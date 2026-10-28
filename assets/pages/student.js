// Student Profile: everything about one student. Admins can edit every section.
import { db, must, h, mount, param, go, getGrades, getCurrentYear, getClasses, fmtDMY, ageOn, n1, pct, btn, card, stat, tag,
  pageHead, backLink, emptyState, studentName, input, select, field, textarea, checkbox, modal, toast, busy, uploadDocument,
  openDocument, logActivity } from '../lib.js';
import { classSidebar } from './common.js';

const SECTIONS = [['personal', 'Personal'], ['family', 'Family & Contact'], ['health', 'Health'], ['attendance', 'Attendance'],
  ['academics', 'Academics'], ['skills', 'Skills & Conduct'], ['feedback', 'Teacher Feedback'], ['cocurricular', 'Co-Curricular'],
  ['documents', 'Documents & Admin'], ['final', 'Final Assessment']];
const MONTH_ORDER = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4];
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const kv = (pairs) => h('dl', { class: 'kv' }, pairs.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v === null || v === undefined || v === '' ? '—' : v))));
const yesNo = (arr, n = 4) => Array.from({ length: n }, (_, i) => (arr?.[i] ? 'Yes' : 'No')).join(' ');
const simpleTable = (head, rows, opts = {}) => h('div', { class: 'tbx', style: 'overflow-x: auto' }, h('table', { class: 'tt' },
  h('thead', {}, h('tr', {}, head.map((x, i) => h('th', { class: i && opts.num ? 'num' : '' }, x)))),
  h('tbody', {}, rows.length ? rows.map((r) => h('tr', {}, r.map((c, i) => h(i ? 'td' : 'th', { class: i && opts.num ? 'num' : i ? 'wrap' : '', scope: i ? undefined : 'row' }, c ?? '—'))))
    : h('tr', {}, h('td', { colspan: head.length, class: 'muted' }, opts.empty || 'Not recorded')))));

// A modal that edits a list of rows with fixed columns.
function rowsEditor(title, columns, rows, onSave) {
  const list = h('div', { class: 'scroll' });
  const draft = rows.map((r) => [...r]);
  const draw = () => mount(list, draft.map((r, i) => h('div', { class: 'row', style: 'flex-wrap: nowrap; align-items: flex-end' },
    columns.map((c, j) => field(c, input({ value: r[j] ?? '', oninput: (e) => { r[j] = e.target.value; } }), { style: 'flex: 1' })),
    btn('Remove', { small: true, danger: true, onclick: () => { draft.splice(i, 1); draw(); } }))),
  btn('Add row', { small: true, icon: 'plus', onclick: () => { draft.push(columns.map(() => '')); draw(); } }));
  draw();
  modal(title, list, { onSubmit: () => onSave(draft.filter((r) => r.some((x) => String(x).trim()))) });
}

// A modal that edits named text fields.
function fieldsEditor(title, defs, onSave) {
  const els = defs.map(([key, label, value, type]) => [key, type === 'long' ? textarea({ value: value ?? '' }) : input({ value: value ?? '' }), label]);
  modal(title, h('div', { class: 'grid2' }, els.map(([, el, label]) => field(label, el))), {
    onSubmit: () => onSave(Object.fromEntries(els.map(([k, el]) => [k, el.value]))),
  });
}

export async function render(ctx) {
  const id = Number(param('id'));
  const s = id ? must(await db.from('students').select('*, grade:grade_levels(id, name)').eq('id', id).maybeSingle()) : null;
  await classSidebar(ctx, {});
  if (!s) { mount(ctx.main, emptyState('Student not found', 'Search for the student by name or admission number.', btn('Student Search', { href: ctx.link('SearchStart') }), 'search')); return; }

  const year = await getCurrentYear();
  const [guardians, health, docs, enrol, att, grades] = await Promise.all([
    db.from('guardians').select('*').eq('student_id', id).order('position').then(must),
    db.from('health_records').select('*').eq('student_id', id).order('term_no').then(must),
    db.from('student_documents').select('*').eq('student_id', id).order('position').then(must),
    db.from('enrollments').select('class_id').eq('student_id', id).then(must),
    db.from('attendance').select('on_date, status').eq('student_id', id).gte('on_date', year.starts_on).lte('on_date', year.ends_on).then(must),
    getGrades(),
  ]);
  const classes = (await getClasses(year.id)).filter((c) => enrol.some((e) => e.class_id === c.id)).sort((a, b) => a.subject.position - b.subject.position);
  const evals = classes.length ? must(await db.from('evaluations').select('*').in('class_id', classes.map((c) => c.id)).order('held_on')) : [];
  const marks = evals.length ? must(await db.from('marks').select('*').eq('student_id', id).in('evaluation_id', evals.map((e) => e.id))) : [];
  const profile = s.profile || {};
  const admin = ctx.isAdmin;
  const reload = () => render(ctx);
  const saveProfile = async (patch) => { must(await db.from('students').update({ profile: { ...profile, ...patch } }).eq('id', id)); toast('Saved'); reload(); };
  const editBtn = (onclick) => (admin ? btn('Edit', { small: true, icon: 'edit', onclick }) : null);
  const section = (key, title, extra, ...body) => h('section', { class: 'card', id: key },
    h('div', { class: 'sh' }, h('span', {}, title), h('span', { class: 'row' }, extra)), ...body);

  // Attendance by month.
  const byMonth = new Map(MONTH_ORDER.map((m) => [m, { days: 0, present: 0, absent: 0 }]));
  att.forEach((a) => { const m = byMonth.get(Number(a.on_date.slice(5, 7))); if (!m) return; m.days++; if (a.status === 'A') m.absent++; else m.present++; });
  const totals = [...byMonth.values()].reduce((t, m) => ({ days: t.days + m.days, present: t.present + m.present, absent: t.absent + m.absent }), { days: 0, present: 0, absent: 0 });
  const attPct = totals.days ? (totals.present / totals.days) * 100 : null;

  // Academics: subjects × test names.
  const names = [];
  evals.forEach((e) => { if (!names.includes(e.name)) names.push(e.name); });
  const mk = new Map(marks.map((m) => [m.evaluation_id, m]));
  const cell = (c, name) => {
    const e = evals.find((x) => x.class_id === c.id && x.name === name);
    if (!e) return null;
    const m = mk.get(e.id);
    return { e, m, text: !m ? '–' : m.absent ? 'Ab' : m.marks === null ? '–' : n1(Number(m.marks)) };
  };
  const colTotals = names.map((name) => {
    let got = 0, max = 0, any = false, allAbsent = true;
    classes.forEach((c) => { const x = cell(c, name); if (!x?.m) return; any = true; if (x.m.absent) return; allAbsent = false; got += Number(x.m.marks || 0); max += Number(x.e.max_marks); });
    return { got, max, any, allAbsent };
  });
  const latestIdx = colTotals.map((t, i) => (t.any && !t.allAbsent ? i : -1)).filter((i) => i >= 0).pop();
  const latest = latestIdx !== undefined ? { name: names[latestIdx], pct: (colTotals[latestIdx].got / colTotals[latestIdx].max) * 100 } : null;

  const final = profile.final || {};
  const headTags = [s.grade?.name, s.admission_no && `Adm. No ${s.admission_no}`, s.residential, s.family_status, `Academic Year ${year.name}`,
    s.status !== 'active' && s.status[0].toUpperCase() + s.status.slice(1)].filter(Boolean);

  const actions = admin ? [
    btn('Documents', { href: '#documents' }),
    s.status === 'active' ? btn('Start Transfer', { href: `AdminNewTransfer.html?student=${id}` }) : null,
    s.status === 'active' ? btn('Withdraw', { href: `AdminWithdrawals.html?student=${id}` }) : null,
    btn('Edit Biodata', { primary: true, icon: 'edit', onclick: () => editBiodata(s, grades, reload) }),
  ] : [btn('Download Record', { icon: 'download', onclick: () => window.print() })];

  const docRow = (d) => [d.name,
    admin ? checkbox(d.submitted ? 'Yes' : 'No', d.submitted, { onchange: async (e) => {
      must(await db.from('student_documents').update({ submitted: e.target.checked, handled_by: ctx.me.name }).eq('id', d.id)); toast('Saved'); reload();
    } }) : d.submitted ? 'Yes' : 'No',
    d.handled_by || '—',
    h('span', { class: 'row' },
      d.file_path ? btn('View', { small: true, onclick: () => openDocument(d.file_path).catch((e) => toast(e.message, true)) }) : null,
      admin ? h('label', { class: 'btn s', style: 'cursor: pointer' }, d.file_path ? 'Replace' : 'Upload',
        h('input', { type: 'file', hidden: true, onchange: async (e) => {
          const f = e.target.files[0]; if (!f) return;
          try {
            const path = await uploadDocument(`students/${id}/${d.id}-${f.name}`, f);
            must(await db.from('student_documents').update({ file_path: path, submitted: true, handled_by: ctx.me.name }).eq('id', d.id));
            toast('Uploaded'); reload();
          } catch (x) { toast(x.message, true); }
        } })) : null)];

  mount(ctx.main, h('div', { class: 'stack' },
    backLink('Back to student search', ctx.link('SearchStart')),
    h('div', { class: 'spread', style: 'align-items: flex-start' },
      h('div', { class: 'row', style: 'align-items: flex-start; gap: 18px' },
        h('div', { style: 'width: 96px; height: 112px; border-radius: 12px; background: var(--mauve-light); display: flex; align-items: center; justify-content: center; color: var(--mauve); font-size: 36px; font-weight: 900', 'aria-label': 'Student photo' }, studentName(s).charAt(0)),
        h('div', { class: 'stack', style: 'gap: 10px' }, h('h1', { style: 'margin: 0; font-size: 26px' }, s.full_name), h('div', { class: 'row' }, headTags.map((t) => tag(t))))),
      h('div', { class: 'row no-print' }, actions)),
    h('section', { class: 'stats' },
      stat(ageOn(s.dob), `Age · DOB ${fmtDMY(s.dob)}`),
      stat(pct(attPct), `Attendance · ${totals.present} / ${totals.days} days`),
      stat(latest ? pct(latest.pct) : '—', latest ? `Latest test (${latest.name})` : 'Latest test'),
      stat(s.blood_group || '—', 'Blood group'),
      stat(final.promotion || '—', 'Final assessment')),
    h('nav', { class: 'row no-print', 'aria-label': 'Sections' }, SECTIONS.map(([k, l]) => h('a', { href: '#' + k, class: 'tag' }, l))),

    section('personal', 'Personal & Identity', null, kv([
      ['Admission No.', s.admission_no], ['Class', s.grade?.name], ['Repeating class', s.repeating ? 'Yes' : 'No'],
      ['Date of birth', fmtDMY(s.dob)], ['Age', ageOn(s.dob)], ['Residential status', s.residential],
      ['Aadhaar No.', s.aadhaar_last4 ? `XXXX XXXX ${s.aadhaar_last4}` : ''], ['APAAR ID', s.apaar_id], ['PEN No.', s.pen],
      ['Gender', s.gender], ['Location', s.location], ['State', s.state]])),

    section('family', 'Family & Contact', [h('span', { class: 'muted small' }, `Student status: ${s.family_status || '—'}`), editBtn(() => rowsEditor('Family & contact',
      ['Relation', 'Name', 'Occupation', 'Contact'], guardians.map((g) => [g.relation, g.name, g.occupation, g.phone]), async (rows) => {
        must(await db.from('guardians').delete().eq('student_id', id));
        if (rows.length) must(await db.from('guardians').insert(rows.map((r, i) => ({ student_id: id, relation: r[0] || 'Guardian', name: r[1], occupation: r[2], phone: r[3], position: i + 1 }))));
        toast('Saved'); reload();
      }))],
    simpleTable(['Relation', 'Name', 'Occupation', 'Contact'], guardians.map((g) => [g.relation, g.name || '—', g.occupation || '—', g.phone || '—'])),
    h('div', { class: 'spread', style: 'align-items: flex-start' }, kv([['Parents’ health status', profile.parents_health], ['Siblings', profile.siblings],
      ['Sibling at school', profile.sibling_at_school], ['Parent / guardian behaviour', profile.guardian_behaviour]]),
    editBtn(() => fieldsEditor('Family details', [['parents_health', 'Parents’ health status', profile.parents_health], ['siblings', 'Siblings', profile.siblings],
      ['sibling_at_school', 'Sibling at school', profile.sibling_at_school], ['guardian_behaviour', 'Parent / guardian behaviour', profile.guardian_behaviour]], saveProfile)))),

    section('health', 'Health', editBtn(() => editHealth(s, health, profile, reload)),
      simpleTable(['Details', 'Term 1', 'Term 2', 'Term 3'], [
        ['Height (cm)', ...[1, 2, 3].map((t) => n1(health.find((x) => x.term_no === t)?.height_cm ?? null))],
        ['Weight (kg)', ...[1, 2, 3].map((t) => n1(health.find((x) => x.term_no === t)?.weight_kg ?? null))],
        ['Remarks', ...[1, 2, 3].map((t) => health.find((x) => x.term_no === t)?.remarks || '—')]]),
      kv([['Blood group', s.blood_group], ['Eyesight', profile.eyesight], ['Other health issues', profile.health_issues], ['Warden remarks', profile.warden_remarks]])),

    section('attendance', 'Attendance', h('span', { class: 'muted small' }, `Total: ${totals.present} of ${totals.days} working days · ${totals.absent} absent · ${pct(attPct)}`),
      h('div', { class: 'tbx', style: 'overflow-x: auto' }, h('table', { class: 'tt' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Month'), MONTH_ORDER.map((m) => h('th', { class: 'num' }, MONTH_NAMES[m])), h('th', { class: 'num' }, 'Total'))),
        h('tbody', {}, [['Working days', 'days'], ['Present', 'present'], ['Absent', 'absent']].map(([label, k]) => h('tr', {}, h('th', { scope: 'row' }, label),
          MONTH_ORDER.map((m) => h('td', { class: 'num' }, byMonth.get(m).days ? byMonth.get(m)[k] : '—')), h('td', { class: 'num' }, h('b', {}, totals[k]))))))),
      h('div', { class: 'spread', style: 'align-items: flex-start' }, kv([['Attendance remarks', profile.attendance_remarks], ['PTM attendance (I · II · III · IV)', yesNo(profile.ptm)]]),
        editBtn(() => fieldsEditor('Attendance notes', [['attendance_remarks', 'Attendance remarks', profile.attendance_remarks], ['ptm', 'PTM attended (e.g. Yes No No No)', yesNo(profile.ptm)]],
          (v) => saveProfile({ attendance_remarks: v.attendance_remarks, ptm: v.ptm.split(/\s+/).map((x) => /^y/i.test(x)) }))))),

    section('academics', 'Academics — Subject-wise Test Marks', h('span', { class: 'muted small' }, 'Ab = Absent · – = not entered'),
      classes.length && names.length ? h('div', { class: 'tbx', style: 'overflow-x: auto' }, h('table', { class: 'tt' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Subject'), names.map((n) => h('th', { class: 'num' }, n)))),
        h('tbody', {},
          classes.map((c) => h('tr', {}, h('th', { scope: 'row' }, h('a', { href: ctx.link(ctx.isAdmin || c.teacher_id === ctx.me.id ? 'Main' : 'AllClasses', { class: c.id }) }, c.subject.name)),
            names.map((n) => { const x = cell(c, n); return h('td', { class: 'num' }, x ? (x.text === 'Ab' ? h('span', { class: 'ab' }, 'Ab') : x.text) : ''); }))),
          h('tr', {}, h('th', { scope: 'row' }, 'Total'), colTotals.map((t) => h('td', { class: 'num' }, h('b', {}, !t.any ? '–' : t.allAbsent ? 'Ab' : n1(t.got))))),
          h('tr', {}, h('th', { scope: 'row' }, 'Percentage'), colTotals.map((t) => h('td', { class: 'num' }, !t.any ? '–' : t.allAbsent ? 'Ab' : pct((t.got / t.max) * 100)))))))
        : h('p', { class: 'muted', style: 'margin: 0' }, 'No marks recorded this year.')),

    section('skills', 'Skills & Conduct', [h('span', { class: 'muted small' }, 'Grades by subject'), editBtn(() => {
      const cols = profile.skills?.columns || ['Tel', 'Hin', 'Eng', 'Math', 'Phy', 'Bio', 'Soc'];
      rowsEditor('Skills & conduct', ['Particulars', ...cols], profile.skills?.rows || [], (rows) => saveProfile({ skills: { columns: cols, rows } }));
    })],
    simpleTable(['Particulars', ...(profile.skills?.columns || ['Tel', 'Hin', 'Eng', 'Math', 'Phy', 'Bio', 'Soc'])], profile.skills?.rows || [])),

    section('feedback', 'Teacher Feedback', editBtn(() => rowsEditor('Teacher feedback', ['Subject', 'Feedback on student'], profile.feedback || [], (rows) => saveProfile({ feedback: rows }))),
      simpleTable(['Subject', 'Feedback on student'], profile.feedback || []),
      h('div', { class: 'spread', style: 'align-items: flex-start' }, kv([['Student feedback on teachers', profile.student_feedback]]),
        editBtn(() => fieldsEditor('Student feedback', [['student_feedback', 'Student feedback on teachers', profile.student_feedback, 'long']], saveProfile)))),

    section('cocurricular', 'Co-Curricular Activities', null,
      h('div', { class: 'spread' }, h('b', {}, 'Sports & Martial Arts'), editBtn(() => rowsEditor('Sports & martial arts', ['Activity', 'Details'], profile.sports || [], (rows) => saveProfile({ sports: rows })))),
      simpleTable(['Activity', 'Details'], profile.sports || []),
      h('div', { class: 'spread' }, h('b', {}, 'Spiritual & Cultural'), editBtn(() => rowsEditor('Spiritual & cultural', ['Activity', 'Grade', 'Remarks'], profile.spiritual || [], (rows) => saveProfile({ spiritual: rows })))),
      simpleTable(['Activity', 'Grade', 'Remarks'], profile.spiritual || []),
      h('div', { class: 'spread', style: 'align-items: flex-start' }, kv([['Competitions', profile.competitions], ['Seva (I · II · III · IV)', yesNo(profile.seva)], ['Participation details', profile.participation],
        ['Physical activities', profile.physical], ['Dance', profile.dance]]),
      editBtn(() => fieldsEditor('Competitions & service', [['competitions', 'Competitions', profile.competitions], ['seva', 'Seva done (e.g. Yes No No No)', yesNo(profile.seva)],
        ['participation', 'Participation details', profile.participation, 'long'], ['physical', 'Physical activities', profile.physical], ['dance', 'Dance', profile.dance]],
      (v) => saveProfile({ ...v, seva: v.seva.split(/\s+/).map((x) => /^y/i.test(x)) }))))),

    section('documents', 'Documents & Admin', [h('span', { class: 'muted small' }, `Checked by admin in-charge: ${profile.documents_checked || '—'}`),
      admin ? btn('Add document', { small: true, icon: 'plus', onclick: () => {
        const nm = input({ placeholder: 'e.g. Caste certificate' });
        modal('Add document', field('Document', nm), { submit: 'Add', onSubmit: async () => {
          if (!nm.value.trim()) throw new Error('Name the document.');
          must(await db.from('student_documents').insert({ student_id: id, name: nm.value.trim(), position: docs.length + 1 })); reload();
        } });
      } }) : null],
    simpleTable(['Document', 'Submitted', 'Handled by', 'File'], docs.map(docRow), { empty: 'No documents listed.' })),

    section('final', 'Final Assessment', editBtn(() => fieldsEditor('Final assessment', [['promotion', 'Promotion to next standard', final.promotion], ['decision', 'Final decision by management', final.decision],
      ['remarks', 'Overall remarks by management', final.remarks, 'long'], ['open_school', 'Parents’ willingness for open school', final.open_school],
      ['checked_by', 'Checked by', final.checked_by], ['designation', 'Designation', final.designation]], (v) => saveProfile({ final: v }))),
    kv([['Promotion to next standard', final.promotion], ['Final decision by management', final.decision], ['Overall remarks by management', final.remarks],
      ['Parents’ willingness for open school', final.open_school], ['Checked by', final.checked_by], ['Designation', final.designation]]))));

  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

function editBiodata(s, grades, reload) {
  const f = {
    full_name: input({ value: s.full_name }), display_name: input({ value: s.display_name || '' }),
    admission_no: input({ value: s.admission_no || '' }), grade_id: select(grades.map((g) => [g.id, g.name]), s.grade_id),
    roll_no: input({ type: 'number', value: s.roll_no ?? '' }), residential: select(['Hostler', 'Day scholar'], s.residential || 'Day scholar'),
    dob: input({ type: 'date', value: s.dob || '' }), gender: select(['', 'Female', 'Male', 'Other'], s.gender || ''),
    aadhaar_last4: input({ value: s.aadhaar_last4 || '', maxlength: 4, placeholder: 'Last 4 digits only' }), apaar_id: input({ value: s.apaar_id || '' }),
    pen: input({ value: s.pen || '' }), location: input({ value: s.location || '' }), state: input({ value: s.state || '' }),
    family_status: input({ value: s.family_status || '' }), blood_group: input({ value: s.blood_group || '' }),
  };
  const repeating = checkbox('Repeating this class', s.repeating);
  const labels = { full_name: 'Full name', display_name: 'Short name', admission_no: 'Admission no.', grade_id: 'Class', roll_no: 'Roll no.', residential: 'Residential',
    dob: 'Date of birth', gender: 'Gender', aadhaar_last4: 'Aadhaar (last 4)', apaar_id: 'APAAR ID', pen: 'PEN', location: 'Location', state: 'State',
    family_status: 'Family status', blood_group: 'Blood group' };
  modal('Edit biodata', h('div', { class: 'scroll' }, h('div', { class: 'grid2' }, Object.entries(f).map(([k, el]) => field(labels[k], el))), repeating), {
    onSubmit: async () => {
      if (!f.full_name.value.trim()) throw new Error('Full name is required.');
      const patch = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value === '' ? null : el.value]));
      patch.grade_id = Number(patch.grade_id); patch.roll_no = patch.roll_no === null ? null : Number(patch.roll_no);
      patch.repeating = repeating.querySelector('input').checked;
      must(await db.from('students').update(patch).eq('id', s.id));
      toast('Biodata saved'); reload();
    },
  });
}

function editHealth(s, health, profile, reload) {
  const terms = [1, 2, 3].map((t) => {
    const r = health.find((x) => x.term_no === t) || {};
    return { t, h: input({ type: 'number', step: 'any', value: r.height_cm ?? '' }), w: input({ type: 'number', step: 'any', value: r.weight_kg ?? '' }), r: input({ value: r.remarks || '' }) };
  });
  const blood = input({ value: s.blood_group || '' });
  const eyes = input({ value: profile.eyesight || '' });
  const issues = input({ value: profile.health_issues || '' });
  const warden = input({ value: profile.warden_remarks || '' });
  modal('Health', h('div', { class: 'scroll' },
    terms.map((x) => h('div', { class: 'grid3', style: 'gap: 10px' }, field(`Term ${x.t} height (cm)`, x.h), field('Weight (kg)', x.w), field('Remarks', x.r))),
    h('div', { class: 'grid2' }, field('Blood group', blood), field('Eyesight', eyes), field('Other health issues', issues), field('Warden remarks', warden))), {
    onSubmit: async () => {
      const rows = terms.filter((x) => x.h.value || x.w.value || x.r.value).map((x) => ({ student_id: s.id, term_no: x.t, height_cm: x.h.value || null, weight_kg: x.w.value || null, remarks: x.r.value }));
      if (rows.length) must(await db.from('health_records').upsert(rows));
      must(await db.from('students').update({ blood_group: blood.value, profile: { ...profile, eyesight: eyes.value, health_issues: issues.value, warden_remarks: warden.value } }).eq('id', s.id));
      toast('Saved'); reload();
    },
  });
}
