// Admissions (admin): applications list, application detail with enrolment, new application.
import { db, must, h, mount, param, go, getGrades, getCurrentYear, getClasses, className, fmtDMY, isoDate, btn, card, table, tabs, tag,
  pageHead, backLink, emptyState, input, select, field, textarea, checkbox, modal, toast, busy, confirmBox, downloadCSV,
  uploadDocument, openDocument, logActivity } from '../lib.js';
import { APP_STATUS, appTag } from './enrollment.js';
import { siblingPicker } from './assign.js';

const DOCS = [['birth', 'Birth certificate'], ['tc', 'Transfer certificate (TC)'], ['aadhaar', 'Aadhaar (masked)'], ['report', 'Previous report card']];
const docState = (v) => (!v || v === 'missing' ? 'missing' : 'uploaded');

async function nextAppNo() {
  const last = must(await db.from('applications').select('app_no').order('id', { ascending: false }).limit(1));
  const n = last[0] ? Number(String(last[0].app_no).replace(/\D/g, '')) + 1 : 1;
  return 'APP-' + String(n).padStart(4, '0');
}

async function list(ctx) {
  const grades = await getGrades();
  const status = param('status') || 'all';
  const grade = param('grade') || '';
  const sort = param('sort') || 'new';
  const all = must(await db.from('applications').select('*, grade:grade_levels(name)'));
  const counts = Object.fromEntries(Object.keys(APP_STATUS).map((k) => [k, all.filter((a) => a.status === k).length]));
  let rows = all.filter((a) => (status === 'all' || a.status === status) && (!grade || a.grade_id === +grade));
  rows.sort((a, b) => (sort === 'name' ? a.full_name.localeCompare(b.full_name) : sort === 'old' ? a.applied_on.localeCompare(b.applied_on) : b.applied_on.localeCompare(a.applied_on)));
  const url = (q) => 'AdminAdmissions.html?' + new URLSearchParams({ status, grade, sort, ...q });
  const yearName = all.find((a) => a.year_name)?.year_name;
  const action = (a) => ({ new: 'Review', in_review: 'Review', draft: 'Continue', accepted: 'Enroll', rejected: 'View', enrolled: 'Profile' })[a.status];

  mount(ctx.main, h('div', { class: 'stack' },
    backLink('Back to Student Enrollment', 'AdminEnrollment.html'),
    pageHead('Admissions', `Move applicants from application to enrolled student${yearName ? ' · Admissions for ' + yearName : ''}`, [
      btn('New Application', { primary: true, icon: 'plus', href: 'AdminNewApplication.html' })]),
    tabs([['all', 'All', all.length], ...Object.entries(APP_STATUS).filter(([k]) => k !== 'draft' || counts.draft).map(([k, [l]]) => [k, l, counts[k]])], status, null, { hrefFor: (k) => url({ status: k }) }),
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Grade applied'),
      select([['', 'All grades'], ...grades.map((g) => [g.id, g.name])], grade, { style: 'width: auto', onchange: (e) => go(url({ grade: e.target.value })) }),
      h('span', { class: 'muted small' }, 'Sort by'),
      select([['new', 'Newest first'], ['old', 'Oldest first'], ['name', 'Name']], sort, { style: 'width: auto', onchange: (e) => go(url({ sort: e.target.value })) })),
    all.length ? table([
      { label: 'Applicant', th: true, render: (a) => h('a', { href: `AdminApplication.html?id=${a.id}` }, a.full_name) },
      { label: 'Grade applied', render: (a) => a.grade?.name || '—' },
      { label: 'Applied on', render: (a) => fmtDMY(a.applied_on) },
      { label: 'Guardian', render: (a) => a.guardians?.[0] ? `${a.guardians[0].name} (${a.guardians[0].relation})` : '—' },
      { label: 'Status', render: (a) => appTag(a.status) },
      { label: '', render: (a) => btn(action(a), { small: true, primary: a.status === 'accepted', href: a.status === 'enrolled' && a.student_id ? `AdminStudent.html?id=${a.student_id}` : a.status === 'draft' ? `AdminNewApplication.html?id=${a.id}` : `AdminApplication.html?id=${a.id}` }) },
    ], rows, { empty: 'No applications with this status.' })
      : emptyState('No applications yet', 'New applications from parents or the office will appear here.', btn('New Application', { primary: true, icon: 'plus', href: 'AdminNewApplication.html' }))));
}

// The applicant's details, laid out like the student profile's Personal &
// Identity, Family & Contact and Health sections so enrolling carries them over.
const RELATIONS = ['Father', 'Mother', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
function applicantForm(a, grades, students) {
  const v = (x) => ({ value: x || '' });
  const f = {
    full_name: input(v(a.full_name)), display_name: input({ ...v(a.display_name), placeholder: 'Name used in class lists' }),
    dob: input({ type: 'date', ...v(a.dob) }), gender: select([['', 'Select'], 'Female', 'Male', 'Other'], a.gender || ''),
    grade_id: select([['', 'Select grade'], ...grades.map((g) => [g.id, g.name])], a.grade_id || ''),
    residential: select(['Day scholar', 'Hostler'], a.residential || 'Day scholar'),
    aadhaar_last4: input({ ...v(a.aadhaar_last4), maxlength: 4, placeholder: 'Last 4 digits only' }),
    apaar_id: input(v(a.apaar_id)), pen: input(v(a.pen)), location: input(v(a.location)), state: input(v(a.state)),
    previous_school: input(v(a.previous_school)),
  };
  const fam = a.family || {};
  const family = { parents_health: input(v(fam.parents_health)), siblings: input({ ...v(fam.siblings), placeholder: 'e.g. 1 younger sister' }),
    guardian_behaviour: textarea({ rows: 2, value: fam.guardian_behaviour || '' }) };
  const siblings = siblingPicker(students, fam.sibling_ids || []);
  const health = textarea({ rows: 5, value: a.health_issues || '', placeholder: 'One per line, e.g.\nAsthma — carries an inhaler\nAllergic to peanuts' });

  // Guardians: as many as needed; one is the primary contact.
  const radioName = 'primary-' + Math.random().toString(36).slice(2);
  const gRow = (g = {}) => ({ relation: select(RELATIONS, g.relation || 'Father'), name: input(v(g.name)), occupation: input(v(g.occupation)),
    phone: input({ type: 'tel', ...v(g.phone) }), email: input({ type: 'email', ...v(g.email) }), primary: h('input', { type: 'radio', name: radioName, checked: !!g.primary }) });
  const gs = (a.guardians?.length ? a.guardians : [{}]).map(gRow);
  if (!gs.some((g) => g.primary.checked)) gs[0].primary.checked = true;
  const gBox = h('div', { class: 'stack' });
  const drawGuardians = () => mount(gBox, gs.map((g, i) => h('div', { class: 'stack', style: 'gap: 10px; padding-bottom: 12px; border-bottom: 1px solid var(--hairline)' },
    h('div', { class: 'spread', style: 'align-items: center' }, h('b', {}, `Parent / guardian ${i + 1}`),
      h('span', { class: 'row' }, h('label', { class: 'ck' }, g.primary, 'Primary contact'),
        i ? btn('Remove', { small: true, danger: true, onclick: () => { const was = g.primary.checked; gs.splice(i, 1); if (was) gs[0].primary.checked = true; drawGuardians(); } }) : null)),
    h('div', { class: 'grid2' }, field('Relation', g.relation), field(`Name${i ? '' : ' *'}`, g.name), field('Occupation', g.occupation),
      field(`Phone${i ? '' : ' *'}`, g.phone), field('Email', g.email)))),
  h('div', {}, btn('Add parent / guardian', { small: true, icon: 'plus', onclick: () => { gs.push(gRow({ relation: 'Mother' })); drawGuardians(); } })));
  drawGuardians();

  const cards = [
    card('Personal & Identity', h('div', { class: 'grid2' }, field('Full name *', f.full_name), field('Short name', f.display_name), field('Date of birth *', f.dob),
      field('Gender', f.gender), field('Grade applying for *', f.grade_id), field('Residential status', f.residential), field('Aadhaar no. (last 4)', f.aadhaar_last4),
      field('APAAR ID', f.apaar_id), field('PEN no.', f.pen), field('Location', f.location), field('State', f.state), field('Previous school', f.previous_school))),
    card('Family & Contact', gBox, h('div', { class: 'grid2' }, field('Parents’ health status', family.parents_health), field('Siblings', family.siblings),
      field('Sibling at school', siblings, { style: 'grid-column: span 2' }), field('Parent / guardian behaviour', family.guardian_behaviour, { style: 'grid-column: span 2' }))),
    card('Health', field('Other health issues', health), h('p', { class: 'muted small', style: 'margin: 0' }, 'Shown under Health › Other health issues on the student’s profile once enrolled.')),
  ];

  // The application row; strict checks the fields needed to submit or enrol.
  const read = (strict) => {
    if (!f.full_name.value.trim()) throw new Error('Full name is required.');
    const guardians = gs.map((g) => ({ relation: g.relation.value, name: g.name.value.trim(), occupation: g.occupation.value.trim(), phone: g.phone.value.trim(),
      email: g.email.value.trim(), primary: g.primary.checked })).filter((g) => g.name || g.phone);
    if (strict) {
      if (!f.dob.value) throw new Error('Date of birth is required.');
      if (!f.grade_id.value) throw new Error('Choose the grade applying for.');
      if (!guardians[0]?.name || !guardians[0]?.phone) throw new Error('The first parent / guardian needs a name and phone.');
      const primary = guardians.find((g) => g.primary);
      if (!primary?.phone) throw new Error('The primary contact needs a phone number.');
    }
    return {
      full_name: f.full_name.value.trim(), display_name: f.display_name.value.trim(), dob: f.dob.value || null, gender: f.gender.value || null,
      grade_id: f.grade_id.value ? +f.grade_id.value : null, residential: f.residential.value, aadhaar_last4: f.aadhaar_last4.value.trim(),
      apaar_id: f.apaar_id.value.trim(), pen: f.pen.value.trim(), location: f.location.value.trim(), state: f.state.value.trim(),
      previous_school: f.previous_school.value.trim(), health_issues: health.value.trim(), guardians,
      family: { parents_health: family.parents_health.value.trim(), siblings: family.siblings.value.trim(), guardian_behaviour: family.guardian_behaviour.value.trim(), sibling_ids: siblings.picked },
    };
  };
  return { cards, read };
}
const activeStudents = () => db.from('students').select('id, full_name, admission_no, grade:grade_levels(name)').eq('status', 'active').order('full_name').then(must);

async function detail(ctx) {
  const id = Number(param('id'));
  const a = id ? must(await db.from('applications').select('*, grade:grade_levels(id, name)').eq('id', id).maybeSingle()) : null;
  if (!a) { mount(ctx.main, emptyState('Application not found', null, btn('Admissions', { href: 'AdminAdmissions.html' }))); return; }
  const [notes, grades, year, students] = await Promise.all([
    db.from('application_notes').select('*').eq('application_id', id).order('created_at').then(must), getGrades(), getCurrentYear(), activeStudents()]);
  const form = applicantForm(a, grades, students);
  const editable = !['enrolled', 'rejected'].includes(a.status);
  if (!editable) form.cards.forEach((c) => c.querySelectorAll('input, select, textarea, button').forEach((el) => { el.disabled = true; }));
  // Save Application keeps the edits; a new application moves to accepted.
  const saveApp = async () => {
    const row = form.read(true);
    const status = ['new', 'in_review'].includes(a.status) ? 'accepted' : a.status;
    must(await db.from('applications').update({ ...row, status }).eq('id', id));
    return row;
  };
  const reload = () => detail(ctx);
  const setStatus = async (status, note, extra = {}) => {
    must(await db.from('applications').update({ status, ...extra }).eq('id', id));
    if (note) must(await db.from('application_notes').insert({ application_id: id, author_name: ctx.me.name, body: note }));
    await logActivity(ctx.me, 'Admission', a.full_name, note || `Marked ${APP_STATUS[status][0].toLowerCase()}`);
    toast(`Application ${APP_STATUS[status][0].toLowerCase()}`); reload();
  };
  // Rejecting keeps the application on record with the reason.
  const reject = () => {
    const why = textarea({ rows: 3, placeholder: 'e.g. No seats left in Grade 7 this year' });
    modal(`Reject ${a.full_name}?`, [h('p', { class: 'muted small', style: 'margin: 0' }, 'The application stays on record as rejected, with this reason.'), field('Reason', why)], {
      submit: 'Reject', danger: true,
      onSubmit: async () => {
        if (!why.value.trim()) throw new Error('Give the reason for rejecting.');
        await setStatus('rejected', `Rejected: ${why.value.trim()}`, { reject_reason: why.value.trim() });
      },
    });
  };
  const open = ['new', 'in_review', 'accepted'].includes(a.status);
  const actions = [
    open ? btn('Reject', { danger: true, onclick: reject }) : null,
    editable ? (() => { const b = btn('Save Application', { primary: true, onclick: () => busy(b, async () => { await saveApp(); toast('Application saved'); reload(); }).catch(() => {}) }); return b; })() : null,
    a.status === 'rejected' ? btn('Reopen', { onclick: () => setStatus('in_review', null, { reject_reason: '' }) }) : null,
    a.status === 'enrolled' && a.student_id ? btn('Open Profile', { primary: true, href: `AdminStudent.html?id=${a.student_id}` }) : null,
  ];

  const docRows = DOCS.map(([key, label]) => {
    const v = a.documents?.[key];
    const has = docState(v) === 'uploaded';
    return h('div', { class: 'item' }, h('div', { class: 'it' }, h('b', {}, label)),
      h('span', { class: 'row' }, has ? tag('Uploaded', 'ok') : tag('Missing', 'bad'),
        v && v !== 'uploaded' && v !== 'missing' ? btn('View', { small: true, onclick: () => openDocument(v).catch((e) => toast(e.message, true)) }) : null,
        h('label', { class: 'btn s', style: 'cursor: pointer' }, has ? 'Replace' : 'Upload', h('input', { type: 'file', hidden: true, onchange: async (e) => {
          const f = e.target.files[0]; if (!f) return;
          try {
            const path = await uploadDocument(`applications/${id}/${key}-${f.name}`, f);
            must(await db.from('applications').update({ documents: { ...a.documents, [key]: path } }).eq('id', id));
            toast('Uploaded'); reload();
          } catch (x) { toast(x.message, true); }
        } }))));
  });

  const noteIn = textarea({ rows: 2, placeholder: 'Add a note' });
  const addNote = btn('Add Note', { small: true, onclick: () => busy(addNote, async () => {
    if (!noteIn.value.trim()) throw new Error('Write a note first.');
    must(await db.from('application_notes').insert({ application_id: id, author_name: ctx.me.name, body: noteIn.value.trim() }));
    reload();
  }).catch(() => {}) });

  // Enrol: pick grade and classes, create the student profile.
  const gradeSel = select(grades.map((g) => [g.id, g.name]), a.grade_id);
  const classBox = h('div', { class: 'stack', style: 'gap: 8px' });
  const classes = await getClasses(year.id);
  // Mandatory classes are enrolled automatically (migration 009), so they stay ticked.
  const drawClasses = () => mount(classBox, classes.filter((c) => c.grade_id === +gradeSel.value).map((c) => checkbox(className(c) + (c.mandatory ? ' · mandatory' : ''), true, { value: c.id, disabled: c.mandatory }))
    .concat(classes.some((c) => c.grade_id === +gradeSel.value) ? [] : [h('p', { class: 'muted small', style: 'margin: 0' }, 'No classes set up for this grade this year.')]));
  gradeSel.addEventListener('change', drawClasses);
  drawClasses();
  const canEnroll = !['enrolled', 'rejected'].includes(a.status);
  const enroll = btn('Enroll & Create Profile', { primary: true, disabled: !canEnroll, onclick: () => busy(enroll, async () => {
    const gradeId = +gradeSel.value;
    const app = await saveApp();
    const latest = must(await db.from('students').select('admission_no, roll_no, grade_id'));
    const nextAdm = Math.max(0, ...latest.map((s) => Number(s.admission_no) || 0)) + 1;
    const nextRoll = Math.max(0, ...latest.filter((s) => s.grade_id === gradeId).map((s) => s.roll_no || 0)) + 1;
    const student = must(await db.from('students').insert({
      admission_no: String(nextAdm), full_name: app.full_name, display_name: app.display_name || app.full_name, grade_id: gradeId, roll_no: nextRoll,
      residential: app.residential === 'Hostler' ? 'Hostler' : 'Day scholar', dob: app.dob, gender: app.gender, aadhaar_last4: app.aadhaar_last4,
      apaar_id: app.apaar_id || null, pen: app.pen || null, location: app.location || null, state: app.state || null, status: 'active',
      profile: { parents_health: app.family.parents_health, siblings: app.family.siblings, sibling_ids: app.family.sibling_ids, guardian_behaviour: app.family.guardian_behaviour },
    }).select().single());
    const gs = app.guardians.filter((g) => g.name);
    if (gs.length) must(await db.from('guardians').insert(gs.map((g, i) => ({ student_id: student.id, relation: g.relation || 'Guardian', name: g.name, occupation: g.occupation || '', phone: g.phone || '', email: g.email || '', position: i + 1, is_primary: !!g.primary }))));
    if (app.health_issues) must(await db.from('health_years').upsert({ student_id: student.id, year_id: year.id, health_issues: app.health_issues }, { onConflict: 'student_id,year_id' }));
    const picked = [...classBox.querySelectorAll('input:checked')].map((x) => ({ class_id: +x.value, student_id: student.id }));
    if (picked.length) must(await db.from('enrollments').upsert(picked, { onConflict: 'class_id,student_id', ignoreDuplicates: true }));
    // The new student already has the required documents (migration 013); mark what the application brought.
    const docRows = DOCS.map(([key, label], i) => ({ student_id: student.id, name: label, submitted: docState(a.documents?.[key]) === 'uploaded',
      handled_by: ctx.me.name, file_path: a.documents?.[key] && !['uploaded', 'missing'].includes(a.documents[key]) ? a.documents[key] : null, position: i + 1 }));
    must(await db.from('student_documents').upsert(docRows, { onConflict: 'student_id,name' }));
    must(await db.from('applications').update({ status: 'enrolled', student_id: student.id, grade_id: gradeId }).eq('id', id));
    await logActivity(ctx.me, 'Admission', app.full_name, `Enrolled in ${grades.find((g) => g.id === gradeId).name}`);
    go(`AdminStudent.html?id=${student.id}`);
  }).catch(() => {}) });

  mount(ctx.main, h('div', { class: 'stack' },
    backLink('Back to admissions', 'AdminAdmissions.html'),
    pageHead(h('span', { class: 'row' }, a.full_name, appTag(a.status)), `Application no. ${a.app_no || '—'} · Applied ${fmtDMY(a.applied_on)} for ${a.grade?.name || '—'}`, actions),
    a.status === 'rejected' ? h('div', { class: 'note' }, h('b', {}, 'Rejected. '), a.reject_reason || 'No reason recorded.') : null,
    h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        ...form.cards,
        card('Documents', docRows)),
      h('div', { class: 'stack' },
        card('Notes', notes.length ? notes.map((n) => h('div', { class: 'item' }, h('div', { class: 'it' }, h('span', {}, `${n.author_name} · ${fmtDMY(n.created_at)}`), h('b', { style: 'font-weight: 400' }, n.body))))
          : h('p', { class: 'muted small', style: 'margin: 0' }, 'No notes yet.'), noteIn, h('div', {}, addNote)),
        card(h('span', {}, 'Enroll ', a.status === 'enrolled' ? h('small', {}, 'Done') : a.status === 'rejected' ? h('small', {}, 'Reopen the application to enroll') : null),
          field('Assign grade', gradeSel),
          h('div', { class: 'fl' }, 'Classes', classBox), h('div', {}, enroll),
          h('p', { class: 'muted small', style: 'margin: 0' }, 'Saves the application, creates the Student Profile with the next roll number in the grade, and adds the student to each ticked class.'))))));
}

async function newApplication(ctx) {
  const [grades, students] = await Promise.all([getGrades(), activeStudents()]);
  const id = Number(param('id'));
  const a = id ? must(await db.from('applications').select('*').eq('id', id).maybeSingle()) : {};
  const form = applicantForm(a, grades, students);
  const files = Object.fromEntries(DOCS.map(([k]) => [k, h('input', { type: 'file' })]));

  const save = (status) => async () => {
    const row = { ...form.read(status === 'new'), status };
    const year = await getCurrentYear();
    const saved = id
      ? must(await db.from('applications').update(row).eq('id', id).select().single())
      : must(await db.from('applications').insert({ ...row, app_no: await nextAppNo(), applied_on: isoDate(), year_name: year.name, documents: {} }).select().single());
    const documents = { ...Object.fromEntries(DOCS.map(([k]) => [k, 'missing'])), ...(saved.documents || {}) };
    for (const [k, el] of Object.entries(files)) {
      if (el.files[0]) documents[k] = await uploadDocument(`applications/${saved.id}/${k}-${el.files[0].name}`, el.files[0]);
    }
    must(await db.from('applications').update({ documents }).eq('id', saved.id));
    if (status === 'new') await logActivity(ctx.me, 'Admission', row.full_name, 'Application received');
    go(status === 'new' ? `AdminApplication.html?id=${saved.id}` : 'AdminAdmissions.html?status=draft');
  };
  const draftBtn = btn('Save Draft', { onclick: () => busy(draftBtn, save('draft'), 'Draft saved').catch(() => {}) });
  const submitBtn = btn('Submit Application', { primary: true, onclick: () => busy(submitBtn, save('new')).catch(() => {}) });

  mount(ctx.main, h('div', { class: 'stack', style: 'max-width: 960px' },
    backLink('Back to admissions', 'AdminAdmissions.html'),
    pageHead(id ? `Application · ${a.full_name}` : 'New Application', 'Enter the applicant’s details. Required fields are marked *.', [btn('Cancel', { href: 'AdminAdmissions.html' }), draftBtn, submitBtn]),
    ...form.cards,
    card('Documents', h('div', { class: 'grid2' }, DOCS.map(([k, label]) => field(label + (a.documents?.[k] && a.documents[k] !== 'missing' ? ' · uploaded' : ''), files[k]))),
      h('p', { class: 'muted small', style: 'margin: 0' }, 'Documents can also be added later from the application.'))));
}

export function render(ctx) {
  if (ctx.page === 'AdminApplication') return detail(ctx);
  if (ctx.page === 'AdminNewApplication') return newApplication(ctx);
  return list(ctx);
}
