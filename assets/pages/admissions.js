// Admissions (admin): applications list, application detail with enrolment, new application.
import { db, must, h, mount, param, go, getGrades, getCurrentYear, getClasses, className, fmtDMY, isoDate, btn, card, table, tabs, tag,
  pageHead, backLink, emptyState, input, select, field, textarea, checkbox, modal, toast, busy, confirmBox, downloadCSV,
  uploadDocument, openDocument, logActivity } from '../lib.js';
import { APP_STATUS, appTag } from './enrollment.js';

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

async function detail(ctx) {
  const id = Number(param('id'));
  const a = id ? must(await db.from('applications').select('*, grade:grade_levels(id, name)').eq('id', id).maybeSingle()) : null;
  if (!a) { mount(ctx.main, emptyState('Application not found', null, btn('Admissions', { href: 'AdminAdmissions.html' }))); return; }
  const [notes, grades, year] = await Promise.all([
    db.from('application_notes').select('*').eq('application_id', id).order('created_at').then(must), getGrades(), getCurrentYear()]);
  const reload = () => detail(ctx);
  const setStatus = async (status, note) => {
    must(await db.from('applications').update({ status }).eq('id', id));
    if (note) must(await db.from('application_notes').insert({ application_id: id, author_name: ctx.me.name, body: note }));
    await logActivity(ctx.me, 'Admission', a.full_name, note || `Marked ${APP_STATUS[status][0].toLowerCase()}`);
    toast(`Application ${APP_STATUS[status][0].toLowerCase()}`); reload();
  };
  const requestInfo = () => {
    const msg = textarea({ placeholder: 'What do you need from the family? e.g. the TC from the previous school' });
    modal('Request info', field('Note', msg), { submit: 'Save request', onSubmit: async () => {
      if (!msg.value.trim()) throw new Error('Say what is needed.');
      await setStatus('in_review', `Requested info: ${msg.value.trim()}`);
    } });
  };
  const open = ['new', 'in_review'].includes(a.status);
  const actions = [
    open ? btn('Request Info', { onclick: requestInfo }) : null,
    open ? btn('Reject', { danger: true, onclick: async () => { if (await confirmBox(`Reject ${a.full_name}?`, 'The application stays on record as rejected.', 'Reject')) setStatus('rejected'); } }) : null,
    open ? btn('Accept', { primary: true, onclick: () => setStatus('accepted') }) : null,
    a.status === 'rejected' ? btn('Reopen', { onclick: () => setStatus('in_review') }) : null,
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
  const drawClasses = () => mount(classBox, classes.filter((c) => c.grade_id === +gradeSel.value).map((c) => checkbox(className(c), true, { value: c.id }))
    .concat(classes.some((c) => c.grade_id === +gradeSel.value) ? [] : [h('p', { class: 'muted small', style: 'margin: 0' }, 'No classes set up for this grade this year.')]));
  gradeSel.addEventListener('change', drawClasses);
  drawClasses();
  const enroll = btn('Enroll & Create Profile', { primary: true, disabled: a.status !== 'accepted', onclick: () => busy(enroll, async () => {
    const gradeId = +gradeSel.value;
    const existing = must(await db.from('students').select('admission_no, roll_no, grade_id'));
    const nextAdm = Math.max(0, ...existing.map((s) => Number(s.admission_no) || 0)) + 1;
    const nextRoll = Math.max(0, ...existing.filter((s) => s.grade_id === gradeId).map((s) => s.roll_no || 0)) + 1;
    const student = must(await db.from('students').insert({
      admission_no: String(nextAdm), full_name: a.full_name, display_name: a.full_name, grade_id: gradeId, roll_no: nextRoll,
      residential: a.residential === 'Hostler' ? 'Hostler' : 'Day scholar', dob: a.dob, gender: a.gender, aadhaar_last4: a.aadhaar_last4, status: 'active',
    }).select().single());
    const gs = (a.guardians || []).filter((g) => g.name);
    if (gs.length) must(await db.from('guardians').insert(gs.map((g, i) => ({ student_id: student.id, relation: g.relation || 'Guardian', name: g.name, occupation: g.occupation || '', phone: g.phone || '', email: g.email || '', position: i + 1 }))));
    const picked = [...classBox.querySelectorAll('input:checked')].map((x) => ({ class_id: +x.value, student_id: student.id }));
    if (picked.length) must(await db.from('enrollments').insert(picked));
    const docRowsToAdd = DOCS.map(([key, label], i) => ({ student_id: student.id, name: label, submitted: docState(a.documents?.[key]) === 'uploaded',
      handled_by: ctx.me.name, file_path: a.documents?.[key] && !['uploaded', 'missing'].includes(a.documents[key]) ? a.documents[key] : null, position: i + 1 }));
    must(await db.from('student_documents').insert(docRowsToAdd));
    must(await db.from('applications').update({ status: 'enrolled', student_id: student.id, grade_id: gradeId }).eq('id', id));
    await logActivity(ctx.me, 'Admission', a.full_name, `Enrolled in ${grades.find((g) => g.id === gradeId).name}`);
    go(`AdminStudent.html?id=${student.id}`);
  }).catch(() => {}) });

  mount(ctx.main, h('div', { class: 'stack' },
    backLink('Back to admissions', 'AdminAdmissions.html'),
    pageHead(h('span', { class: 'row' }, a.full_name, appTag(a.status)), `Application no. ${a.app_no || '—'} · Applied ${fmtDMY(a.applied_on)} for ${a.grade?.name || '—'}`, actions),
    h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        card('Applicant', h('dl', { class: 'kv', style: 'grid-template-columns: repeat(2, minmax(0, 1fr))' }, [['Full name', a.full_name], ['Date of birth', fmtDMY(a.dob)], ['Gender', a.gender],
          ['Grade applied', a.grade?.name], ['Residential', a.residential], ['Previous school', a.previous_school], ['Aadhaar', a.aadhaar_last4 ? `XXXX XXXX ${a.aadhaar_last4}` : '']]
          .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v || '—'))))),
        card('Guardians', (a.guardians || []).length ? a.guardians.map((g) => h('div', { class: 'item' }, h('div', { class: 'it' }, h('b', {}, `${g.relation} · ${g.name || '—'}`),
          h('span', {}, [g.occupation, g.phone, g.email].filter(Boolean).join(' · ') || 'No contact details')))) : h('p', { class: 'muted', style: 'margin: 0' }, 'No guardians recorded.')),
        card('Documents', docRows)),
      h('div', { class: 'stack' },
        card('Notes', notes.length ? notes.map((n) => h('div', { class: 'item' }, h('div', { class: 'it' }, h('span', {}, `${n.author_name} · ${fmtDMY(n.created_at)}`), h('b', { style: 'font-weight: 400' }, n.body))))
          : h('p', { class: 'muted small', style: 'margin: 0' }, 'No notes yet.'), noteIn, h('div', {}, addNote)),
        card(h('span', {}, 'Enroll ', a.status === 'accepted' ? null : h('small', {}, a.status === 'enrolled' ? 'Done' : 'Available after Accept')),
          field('Assign grade', gradeSel), h('div', { class: 'fl' }, 'Classes', classBox), h('div', {}, enroll),
          h('p', { class: 'muted small', style: 'margin: 0' }, 'Creates a Student Profile and adds the student to each ticked class roster.'))))));
}

async function newApplication(ctx) {
  const grades = await getGrades();
  const id = Number(param('id'));
  const a = id ? must(await db.from('applications').select('*').eq('id', id).maybeSingle()) : {};
  const f = {
    full_name: input({ value: a.full_name || '', required: true }), dob: input({ type: 'date', value: a.dob || '' }),
    gender: select([['', 'Select'], 'Female', 'Male', 'Other'], a.gender || ''),
    grade_id: select([['', 'Select grade'], ...grades.map((g) => [g.id, g.name])], a.grade_id || ''),
    residential: select(['Day scholar', 'Hostler'], a.residential || 'Day scholar'),
    previous_school: input({ value: a.previous_school || '' }), aadhaar_last4: input({ value: a.aadhaar_last4 || '', maxlength: 4, placeholder: 'Last 4 digits only' }),
  };
  const guardianForm = (g = {}) => ({ name: input({ value: g.name || '' }), relation: select(['Father', 'Mother', 'Guardian'], g.relation || 'Father'),
    occupation: input({ value: g.occupation || '' }), phone: input({ value: g.phone || '', type: 'tel' }), email: input({ value: g.email || '', type: 'email' }) });
  const guardians = (a.guardians?.length ? a.guardians : [{}]).map(guardianForm);
  const gBox = h('div', { class: 'stack' });
  const drawGuardians = () => mount(gBox, guardians.map((g, i) => h('div', { class: 'grid2' },
    field(`Guardian ${i + 1} name${i ? '' : ' *'}`, g.name), field('Relation', g.relation), field('Occupation', g.occupation), field(`Phone${i ? '' : ' *'}`, g.phone), field('Email', g.email))),
  guardians.length < 2 ? btn('Add second guardian', { small: true, icon: 'plus', onclick: () => { guardians.push(guardianForm({ relation: 'Mother' })); drawGuardians(); } }) : null);
  drawGuardians();
  const files = Object.fromEntries(DOCS.map(([k]) => [k, h('input', { type: 'file' })]));

  const save = (status) => async () => {
    if (!f.full_name.value.trim()) throw new Error('Full name is required.');
    if (status === 'new') {
      if (!f.dob.value) throw new Error('Date of birth is required.');
      if (!f.grade_id.value) throw new Error('Choose the grade applying for.');
      if (!guardians[0].name.value.trim() || !guardians[0].phone.value.trim()) throw new Error('Guardian name and phone are required.');
    }
    const row = {
      full_name: f.full_name.value.trim(), dob: f.dob.value || null, gender: f.gender.value || null, grade_id: f.grade_id.value ? +f.grade_id.value : null,
      residential: f.residential.value, previous_school: f.previous_school.value, aadhaar_last4: f.aadhaar_last4.value, status,
      guardians: guardians.map((g) => ({ name: g.name.value, relation: g.relation.value, occupation: g.occupation.value, phone: g.phone.value, email: g.email.value })).filter((g) => g.name),
    };
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
    card('Applicant', h('div', { class: 'grid2' }, field('Full name *', f.full_name), field('Date of birth *', f.dob), field('Gender', f.gender),
      field('Grade applying for *', f.grade_id), field('Residential', f.residential), field('Previous school', f.previous_school), field('Aadhaar no. (last 4)', f.aadhaar_last4))),
    card('Guardian', gBox),
    card('Documents', h('div', { class: 'grid2' }, DOCS.map(([k, label]) => field(label + (a.documents?.[k] && a.documents[k] !== 'missing' ? ' · uploaded' : ''), files[k]))),
      h('p', { class: 'muted small', style: 'margin: 0' }, 'Documents can also be added later from the application.'))));
}

export function render(ctx) {
  if (ctx.page === 'AdminApplication') return detail(ctx);
  if (ctx.page === 'AdminNewApplication') return newApplication(ctx);
  return list(ctx);
}
