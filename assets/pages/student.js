// Student Profile: everything about one student. Admins edit each section with
// its own Edit button; any staff member can add health notes.
import { db, must, h, mount, param, getGrades, getYears, getCurrentYear, getClasses, getSettings, fmtDate, fmtDMY, ageOn, n1, pct, letterGrade, btn,
  stat, tag, tabs, backLink, emptyState, studentName, input, select, field, textarea, checkbox, modal, toast, uploadDocument,
  openDocument, confirmBox } from '../lib.js';
import { classSidebar } from './common.js';

const SECTIONS = [['personal', 'Personal'], ['family', 'Family & Contact'], ['health', 'Health'], ['attendance', 'Attendance'],
  ['subjects', 'Subjects'], ['cocurricular', 'Co-Curricular'], ['documents', 'Documents & Admin']];
const MONTH_ORDER = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4];
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const kv = (pairs) => h('dl', { class: 'kv' }, pairs.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v === null || v === undefined || v === '' ? '—' : v))));
const longText = (t) => (t ? h('span', { style: 'white-space: pre-wrap' }, t) : '');
const yesNo = (arr, n = 4) => Array.from({ length: n }, (_, i) => (arr?.[i] ? 'Yes' : 'No')).join(' ');
const simpleTable = (head, rows, opts = {}) => h('div', { class: 'tbx', style: 'overflow-x: auto' }, h('table', { class: 'tt' },
  h('thead', {}, h('tr', {}, head.map((x, i) => h('th', { class: i && opts.num ? 'num' : '' }, x)))),
  h('tbody', {}, rows.length ? rows.map((r) => h('tr', {}, r.map((c, i) => h(i ? 'td' : 'th', { class: i && opts.num ? 'num' : i ? 'wrap' : '', scope: i ? undefined : 'row' }, c ?? '—'))))
    : h('tr', {}, h('td', { colspan: head.length, class: 'muted' }, opts.empty || 'Not recorded')))));

// Editable rows with fixed columns; edits land in draft.
function rowsField(columns, draft) {
  const list = h('div', { class: 'stack', style: 'gap: 8px' });
  const draw = () => mount(list, draft.map((r, i) => h('div', { class: 'row', style: 'flex-wrap: nowrap; align-items: flex-end' },
    columns.map((c, j) => field(c, input({ value: r[j] ?? '', oninput: (e) => { r[j] = e.target.value; } }), { style: 'flex: 1' })),
    btn('Remove', { small: true, danger: true, onclick: () => { draft.splice(i, 1); draw(); } }))),
  h('div', {}, btn('Add row', { small: true, icon: 'plus', onclick: () => { draft.push(columns.map(() => '')); draw(); } })));
  draw();
  return list;
}
const filled = (rows) => rows.filter((r) => r.some((x) => String(x ?? '').trim()));

// One student's marks in a class, with the subject percentage to date (weighted,
// following School Settings for absences) and its letter grade.
function classResult(cls, evals, marks, settings) {
  const ev = evals.filter((e) => e.class_id === cls.id);
  const mk = new Map(marks.map((m) => [m.evaluation_id, m]));
  const excluded = settings?.absent_counts === 'excluded';
  let raw = 0, max = 0, adj = 0, w = 0, entered = 0;
  const cells = ev.map((e) => {
    const m = mk.get(e.id);
    if (!m || (!m.absent && m.marks === null)) return { e, state: 'none' };
    entered++;
    if (m.absent) { if (!excluded) { w += Number(e.weight || 0); max += Number(e.max_marks); } return { e, state: 'absent' }; }
    const v = Number(m.marks);
    raw += v; max += Number(e.max_marks);
    adj += (v / Number(e.max_marks)) * Number(e.weight || 0); w += Number(e.weight || 0);
    return { e, state: 'mark', value: v };
  });
  const p = !entered ? null : w ? (adj / w) * 100 : max ? (raw / max) * 100 : null;
  return { ev, cells, raw: entered ? raw : null, max, pct: p };
}

// The gradebook layout for one student: a column per test, then total, % and grade.
function marksTable(r, testHref) {
  if (!r.ev.length) return h('p', { class: 'muted', style: 'margin: 0' }, 'No tests yet this year.');
  return h('div', { style: 'overflow-x: auto' }, h('table', { class: 'tbl compact' },
    h('thead', {}, h('tr', {}, r.ev.map((e) => h('th', { class: 'ev', scope: 'col' },
      h('div', {}, h('a', { class: 'evl', href: testHref(e) }, e.name)), h('div', { class: 'dt' }, fmtDate(e.held_on)),
      h('div', { class: 'sub' }, `Max ${n1(Number(e.max_marks))} · Wt. ${n1(Number(e.weight || 0))}%`))),
    h('th', { class: 'gap' }), h('th', { class: 'sum first' }, 'Total'), h('th', { class: 'sum' }, '%'), h('th', { class: 'sum' }, 'Grade'))),
    h('tbody', {}, h('tr', {}, r.cells.map((c) => h('td', {}, c.state === 'absent' ? h('span', { class: 'ab' }, 'Ab') : c.state === 'mark' ? n1(c.value) : h('span', { class: 'muted' }, '–'))),
      h('td', { class: 'gap' }),
      h('td', { class: 'sum first' }, r.raw === null ? '–' : `${n1(r.raw)} / ${n1(r.max)}`),
      h('td', { class: 'sum' }, h('span', { class: 'big' }, r.pct === null ? '–' : pct(r.pct))),
      h('td', { class: 'sum' }, h('span', { class: 'big' }, letterGrade(r.pct)))))));
}

export async function render(ctx) {
  const id = Number(param('id'));
  const s = id ? must(await db.from('students').select('*, grade:grade_levels(id, name)').eq('id', id).maybeSingle()) : null;
  await classSidebar(ctx, {});
  if (!s) { mount(ctx.main, emptyState('Student not found', 'Search for the student by name or admission number.', btn(ctx.isAdmin ? 'Current Students' : 'Student Search', { href: ctx.link('SearchStart') }), 'search')); return; }

  const [year, years, settings] = await Promise.all([getCurrentYear(), getYears(), getSettings()]);
  const profile = s.profile || {};
  const [guardians, healthRows, healthYears, notes, docs, enrol, att, grades, siblings] = await Promise.all([
    db.from('guardians').select('*').eq('student_id', id).order('position').then(must),
    db.from('health_records').select('*').eq('student_id', id).order('term_no').then(must),
    db.from('health_years').select('*').eq('student_id', id).then(must),
    db.from('health_notes').select('*').eq('student_id', id).order('noted_on', { ascending: false }).then(must),
    db.from('student_documents').select('*').eq('student_id', id).order('position').then(must),
    db.from('enrollments').select('class_id').eq('student_id', id).then(must),
    db.from('attendance').select('on_date, status').eq('student_id', id).gte('on_date', year.starts_on).lte('on_date', year.ends_on).then(must),
    getGrades(),
    profile.sibling_ids?.length ? db.from('students').select('id, full_name, status, grade:grade_levels(name)').in('id', profile.sibling_ids).then(must) : [],
  ]);
  const classes = (await getClasses(year.id)).filter((c) => enrol.some((e) => e.class_id === c.id)).sort((a, b) => a.subject.position - b.subject.position);
  const evals = classes.length ? must(await db.from('evaluations').select('*').in('class_id', classes.map((c) => c.id)).order('held_on')) : [];
  const marks = evals.length ? must(await db.from('marks').select('*').eq('student_id', id).in('evaluation_id', evals.map((e) => e.id))) : [];
  const admin = ctx.isAdmin;
  const reload = () => render(ctx);
  const saveProfile = async (patch) => { must(await db.from('students').update({ profile: { ...profile, ...patch } }).eq('id', id)); toast('Saved'); reload(); };
  const editBtn = (onclick, label = 'Edit') => (admin ? btn(label, { small: true, icon: 'edit', onclick }) : null);
  const section = (key, title, extra, ...body) => h('section', { class: 'card', id: key },
    h('div', { class: 'sh' }, h('span', {}, title), h('span', { class: 'row' }, extra)), ...body);
  const testHref = (e) => ctx.link('TestDetail', { test: e.id });
  const classHref = (c) => ctx.link(admin || c.teacher_id === ctx.me.id ? 'Main' : 'AllClasses', { class: c.id });

  // Attendance by month.
  const byMonth = new Map(MONTH_ORDER.map((m) => [m, { days: 0, present: 0, absent: 0 }]));
  att.forEach((a) => { const m = byMonth.get(Number(a.on_date.slice(5, 7))); if (!m) return; m.days++; if (a.status === 'A') m.absent++; else m.present++; });
  const totals = [...byMonth.values()].reduce((t, m) => ({ days: t.days + m.days, present: t.present + m.present, absent: t.absent + m.absent }), { days: 0, present: 0, absent: 0 });
  const attPct = totals.days ? (totals.present / totals.days) * 100 : null;

  // Subjects (academic classes) and the overall percentage to date.
  const academic = classes.filter((c) => c.subject.academic !== false);
  const extras = classes.filter((c) => c.subject.academic === false);
  const results = new Map(classes.map((c) => [c.id, classResult(c, evals, marks, settings)]));
  const scored = academic.map((c) => results.get(c.id).pct).filter((x) => x !== null);
  const overall = scored.length ? scored.reduce((a, x) => a + x, 0) / scored.length : null;

  const headTags = [s.grade?.name, s.admission_no && `Adm. No ${s.admission_no}`, s.residential, `Academic Year ${year.name}`,
    s.status !== 'active' && s.status[0].toUpperCase() + s.status.slice(1)].filter(Boolean);
  const actions = admin ? [
    btn('Documents', { href: '#documents' }),
    s.status === 'active' ? btn('Start Transfer', { href: `AdminNewTransfer.html?student=${id}` }) : null,
    s.status === 'active' ? btn('Withdraw', { href: `AdminWithdrawals.html?student=${id}` }) : null,
  ] : [btn('Download Record', { icon: 'download', onclick: () => window.print() })];

  // Health: this year's table; earlier years and notes open from See Health Notes.
  const thisYearHealth = healthRows.filter((r) => r.year_id === year.id);
  const healthNow = healthYears.find((r) => r.year_id === year.id) || {};
  const termCell = (rows, t, k) => { const r = rows.find((x) => x.term_no === t); return k === 'remarks' ? r?.remarks || '—' : n1(r?.[k] ?? null); };
  const healthTable = (rows) => simpleTable(['Details', 'Term 1', 'Term 2', 'Term 3'], [
    ['Height (cm)', ...[1, 2, 3].map((t) => termCell(rows, t, 'height_cm'))],
    ['Weight (kg)', ...[1, 2, 3].map((t) => termCell(rows, t, 'weight_kg'))],
    ['Remarks', ...[1, 2, 3].map((t) => termCell(rows, t, 'remarks'))]]);
  const seeNotes = () => healthNotes(ctx, s, notes, years.filter((y) => y.id !== year.id && (healthRows.some((r) => r.year_id === y.id) || healthYears.some((r) => r.year_id === y.id))),
    healthRows, healthYears, healthTable, reload);

  // Siblings at school link to their profiles.
  const siblingLinks = siblings.length
    ? h('span', { class: 'row', style: 'gap: 6px 14px' }, siblings.map((x) => h('a', { href: ctx.link('Student', { id: x.id }) }, x.full_name, h('span', { class: 'muted small' }, ` · ${x.grade?.name || x.status}`))))
    : profile.sibling_at_school || '';

  // Subject tabs.
  const subjectBox = h('div', { class: 'stack' });
  const subjectNotes = (c) => profile.subjects?.[c.subject_id] || {};
  const drawSubject = (cid) => {
    const c = academic.find((x) => x.id === cid);
    const r = results.get(c.id);
    const n = subjectNotes(c);
    mount(subjectBox,
      tabs(academic.map((x) => [x.id, x.subject.name]), cid, (k) => drawSubject(k)),
      h('div', { class: 'spread', style: 'align-items: center' },
        h('div', { class: 'row' }, h('b', {}, c.subject.name), h('span', { class: 'muted small' }, `Teacher: ${c.teacher?.name || 'Not assigned'}`),
          tag(r.pct === null ? 'No marks yet' : `${pct(r.pct)} · ${letterGrade(r.pct)}`, r.pct === null ? '' : 'ok')),
        h('span', { class: 'row' }, btn('Open gradebook', { small: true, href: classHref(c) }), editBtn(() => editSubjectNotes(c, n, profile, saveProfile), 'Edit skills & feedback'))),
      marksTable(r, testHref),
      h('div', { class: 'grid2', style: 'align-items: start' },
        h('div', { class: 'stack', style: 'gap: 8px' }, h('b', {}, 'Skills & Conduct'), simpleTable(['Particulars', 'Grade'], n.skills || [])),
        h('div', { class: 'stack', style: 'gap: 8px' }, h('b', {}, 'Feedback'),
          h('dl', { class: 'kv', style: 'grid-template-columns: 1fr' },
            [['Teacher feedback on student', n.teacher_feedback], ['Student feedback on teacher', n.student_feedback]]
              .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v ? longText(v) : '—')))))));
  };

  // Co-curricular tabs: extracurricular classes plus activities recorded on the profile.
  const activities = profile.activities || [];
  const activityTabs = [
    ...extras.map((c) => ({ key: 'c' + c.id, name: c.subject.name, cls: c, rec: activities.find((a) => a.name?.toLowerCase() === c.subject.name.toLowerCase()) })),
    ...activities.filter((a) => !extras.some((c) => c.subject.name.toLowerCase() === a.name?.toLowerCase())).map((a) => ({ key: 'a' + activities.indexOf(a), name: a.name, rec: a })),
  ];
  const activityBox = h('div', { class: 'stack' });
  const saveActivity = (old, rec) => {
    const list = old ? activities.map((a) => (a === old ? rec : a)) : [...activities, rec];
    return saveProfile({ activities: list });
  };
  const drawActivity = (key) => {
    if (!activityTabs.length) { mount(activityBox, h('p', { class: 'muted', style: 'margin: 0' }, 'No activities recorded yet.')); return; }
    const t = activityTabs.find((x) => x.key === key) || activityTabs[0];
    const rec = t.rec || {};
    const r = t.cls ? results.get(t.cls.id) : null;
    mount(activityBox,
      tabs(activityTabs.map((x) => [x.key, x.name]), t.key, (k) => drawActivity(k)),
      h('div', { class: 'spread', style: 'align-items: center' },
        h('div', { class: 'row' }, h('b', {}, t.name), t.cls ? h('span', { class: 'muted small' }, `Teacher: ${t.cls.teacher?.name || 'Not assigned'}`) : null,
          r && r.pct !== null ? tag(`${pct(r.pct)} · ${letterGrade(r.pct)}`, 'ok') : null),
        h('span', { class: 'row' }, t.cls ? btn('Open gradebook', { small: true, href: classHref(t.cls) }) : null,
          editBtn(() => editActivity(t, (v) => saveActivity(t.rec, v))),
          admin && !t.cls ? btn('Remove', { small: true, danger: true, onclick: async () => {
            if (!(await confirmBox(`Remove ${t.name}?`, 'Its competitions, participation and awards are removed from this profile.', 'Remove'))) return;
            saveProfile({ activities: activities.filter((a) => a !== t.rec) });
          } }) : null)),
      t.cls ? marksTable(r, testHref) : null,
      kv([['Level / grade', rec.level], ['Remarks', longText(rec.remarks)], ['Competitions', longText(rec.competitions)],
        ['Participation details', longText(rec.participation)], ['Awards', longText(rec.awards)]]));
  };

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
    backLink(ctx.isAdmin ? 'Back to Current Students' : 'Back to student search', ctx.link('SearchStart')),
    h('div', { class: 'spread', style: 'align-items: flex-start' },
      h('div', { class: 'row', style: 'align-items: flex-start; gap: 18px' },
        h('div', { style: 'width: 96px; height: 112px; border-radius: 12px; background: var(--mauve-light); display: flex; align-items: center; justify-content: center; color: var(--mauve); font-size: 36px; font-weight: 900', 'aria-label': 'Student photo' }, studentName(s).charAt(0)),
        h('div', { class: 'stack', style: 'gap: 10px' }, h('h1', { style: 'margin: 0; font-size: 26px' }, s.full_name), h('div', { class: 'row' }, headTags.map((t) => tag(t))))),
      h('div', { class: 'row no-print' }, actions)),
    h('section', { class: 'stats' },
      stat(ageOn(s.dob), `Age · DOB ${fmtDMY(s.dob)}`),
      stat(pct(attPct), `Attendance · ${totals.present} / ${totals.days} days`),
      stat(overall === null ? '—' : `${pct(overall)} · ${letterGrade(overall)}`, overall === null ? 'Overall · no marks yet' : `Overall to date · ${scored.length} subject${scored.length === 1 ? '' : 's'}`)),
    h('nav', { class: 'row no-print', 'aria-label': 'Sections' }, SECTIONS.map(([k, l]) => h('a', { href: '#' + k, class: 'tag' }, l))),

    section('personal', 'Personal & Identity', editBtn(() => editPersonal(s, grades, reload)), kv([
      ['Admission No.', s.admission_no], ['Class', s.grade?.name], ['Roll No.', s.roll_no], ['Repeating class', s.repeating ? 'Yes' : 'No'],
      ['Date of birth', fmtDMY(s.dob)], ['Age', ageOn(s.dob)], ['Residential status', s.residential],
      ['Aadhaar No.', s.aadhaar_last4 ? `XXXX XXXX ${s.aadhaar_last4}` : ''], ['APAAR ID', s.apaar_id], ['PEN No.', s.pen],
      ['Gender', s.gender], ['Location', s.location], ['State', s.state]])),

    section('family', 'Family & Contact', editBtn(() => editFamily(ctx, s, guardians, profile, siblings, reload)),
      simpleTable(['Relation', 'Name', 'Occupation', 'Contact'], guardians.map((g) => [g.relation, g.name || '—', g.occupation || '—', g.phone || '—'])),
      kv([['Parents’ health status', profile.parents_health], ['Siblings', profile.siblings], ['Sibling at school', siblingLinks],
        ['Parent / guardian behaviour', profile.guardian_behaviour]])),

    section('health', 'Health', [btn('See Health Notes', { small: true, onclick: seeNotes }), editBtn(() => editHealth(s, year, thisYearHealth, healthNow, reload))],
      h('div', { class: 'muted small' }, `This academic year (${year.name})`),
      healthTable(thisYearHealth),
      kv([['Eyesight', healthNow.eyesight], ['Other health issues', longText(healthNow.health_issues)]])),

    section('attendance', 'Attendance', [h('span', { class: 'muted small' }, `Total: ${totals.present} of ${totals.days} working days · ${totals.absent} absent · ${pct(attPct)}`),
      editBtn(() => editFields('Attendance notes', [['attendance_remarks', 'Attendance remarks', profile.attendance_remarks, 'long'], ['ptm', 'PTM attended (e.g. Yes No No No)', yesNo(profile.ptm)]],
        (v) => saveProfile({ attendance_remarks: v.attendance_remarks, ptm: v.ptm.split(/\s+/).map((x) => /^y/i.test(x)) })))],
    h('div', { class: 'tbx', style: 'overflow-x: auto' }, h('table', { class: 'tt' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Month'), MONTH_ORDER.map((m) => h('th', { class: 'num' }, MONTH_NAMES[m])), h('th', { class: 'num' }, 'Total'))),
      h('tbody', {}, [['Working days', 'days'], ['Present', 'present'], ['Absent', 'absent']].map(([label, k]) => h('tr', {}, h('th', { scope: 'row' }, label),
        MONTH_ORDER.map((m) => h('td', { class: 'num' }, byMonth.get(m).days ? byMonth.get(m)[k] : '—')), h('td', { class: 'num' }, h('b', {}, totals[k]))))))),
    kv([['Attendance remarks', longText(profile.attendance_remarks)], ['PTM attendance (I · II · III · IV)', yesNo(profile.ptm)]])),

    section('subjects', 'Subjects', h('span', { class: 'row' }, h('span', { class: 'muted small' }, 'Total to date'),
      h('b', {}, overall === null ? '—' : `${pct(overall)} · Grade ${letterGrade(overall)}`)),
    academic.length ? subjectBox : h('p', { class: 'muted', style: 'margin: 0' }, 'Not enrolled in any subjects this year.')),

    section('cocurricular', 'Co-Curricular Activities', editBtn(() => editActivity(null, (v) => saveActivity(null, v)), 'Add activity'), activityBox),

    section('documents', 'Documents & Admin', [h('span', { class: 'muted small' }, `Checked by admin in-charge: ${profile.documents_checked || '—'}`),
      admin ? btn('Add document', { small: true, icon: 'plus', onclick: () => {
        const nm = input({ placeholder: 'e.g. Caste certificate' });
        modal('Add document', field('Document', nm), { submit: 'Add', onSubmit: async () => {
          if (!nm.value.trim()) throw new Error('Name the document.');
          must(await db.from('student_documents').insert({ student_id: id, name: nm.value.trim(), position: docs.length + 1 })); reload();
        } });
      } }) : null],
    simpleTable(['Document', 'Submitted', 'Handled by', 'File'], docs.map(docRow), { empty: 'No documents listed.' }))));

  if (academic.length) drawSubject(academic[0].id);
  drawActivity(activityTabs[0]?.key);
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

// A modal that edits named text fields.
function editFields(title, defs, onSave) {
  const els = defs.map(([key, label, value, type]) => [key, type === 'long' ? textarea({ value: value ?? '', rows: 4 }) : input({ value: value ?? '' }), label, type]);
  modal(title, h('div', { class: 'grid2' }, els.map(([, el, label, type]) => field(label, el, type === 'long' ? { style: 'grid-column: span 2' } : {}))), {
    onSubmit: () => onSave(Object.fromEntries(els.map(([k, el]) => [k, el.value]))),
  });
}

function editPersonal(s, grades, reload) {
  const f = {
    full_name: input({ value: s.full_name }), display_name: input({ value: s.display_name || '' }),
    admission_no: input({ value: s.admission_no || '' }), grade_id: select(grades.map((g) => [g.id, g.name]), s.grade_id),
    roll_no: input({ type: 'number', value: s.roll_no ?? '' }), residential: select(['Hostler', 'Day scholar'], s.residential || 'Day scholar'),
    dob: input({ type: 'date', value: s.dob || '' }), gender: select(['', 'Female', 'Male', 'Other'], s.gender || ''),
    aadhaar_last4: input({ value: s.aadhaar_last4 || '', maxlength: 4, placeholder: 'Last 4 digits only' }), apaar_id: input({ value: s.apaar_id || '' }),
    pen: input({ value: s.pen || '' }), location: input({ value: s.location || '' }), state: input({ value: s.state || '' }),
  };
  const repeating = checkbox('Repeating this class', s.repeating);
  const labels = { full_name: 'Full name', display_name: 'Short name', admission_no: 'Admission no.', grade_id: 'Class', roll_no: 'Roll no.', residential: 'Residential',
    dob: 'Date of birth', gender: 'Gender', aadhaar_last4: 'Aadhaar (last 4)', apaar_id: 'APAAR ID', pen: 'PEN', location: 'Location', state: 'State' };
  modal('Edit personal & identity', h('div', { class: 'scroll' }, h('div', { class: 'grid2' }, Object.entries(f).map(([k, el]) => field(labels[k], el))), repeating), {
    onSubmit: async () => {
      if (!f.full_name.value.trim()) throw new Error('Full name is required.');
      const patch = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value === '' ? null : el.value]));
      patch.grade_id = Number(patch.grade_id); patch.roll_no = patch.roll_no === null ? null : Number(patch.roll_no);
      patch.repeating = repeating.querySelector('input').checked;
      must(await db.from('students').update(patch).eq('id', s.id));
      toast('Saved'); reload();
    },
  });
}

// Guardians, family details and siblings at school in one form.
async function editFamily(ctx, s, guardians, profile, siblings, reload) {
  const others = must(await db.from('students').select('id, full_name, admission_no, grade:grade_levels(name)').eq('status', 'active').neq('id', s.id).order('full_name'));
  const draft = guardians.map((g) => [g.relation, g.name, g.occupation, g.phone]);
  const text = (v, long) => (long ? textarea({ value: v ?? '', rows: 2 }) : input({ value: v ?? '' }));
  const parents = text(profile.parents_health), sibs = text(profile.siblings), behaviour = text(profile.guardian_behaviour, true);
  const picked = [...siblings.map((x) => x.id)];
  const label = (x) => `${x.full_name} · ${x.grade?.name || '—'} · Adm. ${x.admission_no || '—'}`;
  const chips = h('div', { class: 'row', style: 'gap: 6px' });
  const drawChips = () => mount(chips, picked.length ? picked.map((pid) => {
    const x = others.find((o) => o.id === pid) || siblings.find((o) => o.id === pid);
    return h('span', { class: 'tag' }, x?.full_name || 'Student', ' ', h('button', { type: 'button', style: 'border: 0; background: none; cursor: pointer; padding: 0 2px; font: inherit', 'aria-label': `Remove ${x?.full_name}`, onclick: () => { picked.splice(picked.indexOf(pid), 1); drawChips(); } }, '×'));
  }) : h('span', { class: 'muted small' }, 'No siblings at this school linked.'));
  drawChips();
  const find = input({ list: 'sibling-options', placeholder: 'Type a name or admission no.', autocomplete: 'off' });
  find.addEventListener('change', () => {
    const x = others.find((o) => label(o) === find.value);
    if (x && !picked.includes(x.id)) { picked.push(x.id); drawChips(); }
    find.value = '';
  });
  modal('Edit family & contact', h('div', { class: 'scroll stack' },
    h('b', {}, 'Parents & guardians'), rowsField(['Relation', 'Name', 'Occupation', 'Contact'], draft),
    h('div', { class: 'grid2' }, field('Parents’ health status', parents), field('Siblings', sibs),
      field('Parent / guardian behaviour', behaviour, { style: 'grid-column: span 2' })),
    field('Sibling at school', h('div', { class: 'stack', style: 'gap: 8px' }, chips, find,
      h('datalist', { id: 'sibling-options' }, others.map((o) => h('option', { value: label(o) })))))), {
    onSubmit: async () => {
      const rows = filled(draft);
      must(await db.from('guardians').delete().eq('student_id', s.id));
      if (rows.length) must(await db.from('guardians').insert(rows.map((r, i) => ({ student_id: s.id, relation: r[0] || 'Guardian', name: r[1] || '', occupation: r[2] || '', phone: r[3] || '', position: i + 1 }))));
      must(await db.from('students').update({ profile: { ...profile, parents_health: parents.value, siblings: sibs.value, guardian_behaviour: behaviour.value, sibling_ids: picked } }).eq('id', s.id));
      toast('Saved'); reload();
    },
  });
}

function editHealth(s, year, rows, now, reload) {
  const terms = [1, 2, 3].map((t) => {
    const r = rows.find((x) => x.term_no === t) || {};
    return { t, h: input({ type: 'number', step: 'any', value: r.height_cm ?? '' }), w: input({ type: 'number', step: 'any', value: r.weight_kg ?? '' }), r: input({ value: r.remarks || '' }) };
  });
  const eyes = input({ value: now.eyesight || '' });
  const issues = textarea({ value: now.health_issues || '', rows: 6, placeholder: 'One per line, e.g.\nAsthma — inhaler kept with the warden\nAllergic to peanuts' });
  modal(`Health · ${year.name}`, h('div', { class: 'scroll' },
    terms.map((x) => h('div', { class: 'grid3', style: 'gap: 10px' }, field(`Term ${x.t} height (cm)`, x.h), field('Weight (kg)', x.w), field('Remarks', x.r))),
    field('Eyesight', eyes), field('Other health issues', issues)), {
    onSubmit: async () => {
      const list = terms.filter((x) => x.h.value || x.w.value || x.r.value)
        .map((x) => ({ student_id: s.id, year_id: year.id, term_no: x.t, height_cm: x.h.value || null, weight_kg: x.w.value || null, remarks: x.r.value }));
      if (list.length) must(await db.from('health_records').upsert(list, { onConflict: 'student_id,year_id,term_no' }));
      must(await db.from('health_years').upsert({ student_id: s.id, year_id: year.id, eyesight: eyes.value, health_issues: issues.value }, { onConflict: 'student_id,year_id' }));
      toast('Saved'); reload();
    },
  });
}

// Ongoing health notes (any staff member can add) and earlier years' health records.
function healthNotes(ctx, s, notes, pastYears, healthRows, healthYears, healthTable, reload) {
  const note = textarea({ rows: 3, placeholder: 'e.g. Fever in the morning; sent to the sick room and parents informed.' });
  const date = input({ type: 'date', value: new Date().toISOString().slice(0, 10) });
  const canDelete = (n) => ctx.isAdmin || n.author_id === ctx.me.id;
  const list = notes.length ? h('div', { class: 'stack', style: 'gap: 10px' }, notes.map((n) => h('div', { class: 'item', style: 'align-items: flex-start' },
    h('div', { class: 'it' }, h('b', {}, `${fmtDMY(n.noted_on)} · ${n.author_name || 'Staff'}`), h('span', { style: 'white-space: pre-wrap' }, n.note)),
    canDelete(n) ? btn('Delete', { small: true, danger: true, onclick: async () => {
      if (!(await confirmBox('Delete this note?', 'It can’t be undone.', 'Delete'))) return;
      must(await db.from('health_notes').delete().eq('id', n.id)); document.querySelector('dialog.modal')?.close(); toast('Note deleted'); reload();
    } }) : null)))
    : h('p', { class: 'muted small', style: 'margin: 0' }, 'No health notes yet.');
  const past = pastYears.length ? pastYears.map((y) => {
    const hy = healthYears.find((r) => r.year_id === y.id) || {};
    return h('div', { class: 'stack', style: 'gap: 8px' }, h('b', {}, y.name), healthTable(healthRows.filter((r) => r.year_id === y.id)),
      kv([['Eyesight', hy.eyesight], ['Other health issues', longText(hy.health_issues)]]));
  }) : h('p', { class: 'muted small', style: 'margin: 0' }, 'No records from earlier years.');
  modal(`Health notes · ${studentName(s)}`, h('div', { class: 'scroll stack' },
    h('div', { class: 'grid2' }, field('Date', date), h('div')), field('New note', note),
    h('b', {}, 'Ongoing notes'), list,
    h('b', {}, 'Earlier years'), past), {
    submit: 'Add Note',
    onSubmit: async () => {
      if (!note.value.trim()) throw new Error('Write the note first.');
      must(await db.from('health_notes').insert({ student_id: s.id, noted_on: date.value || undefined, note: note.value.trim(), author_id: ctx.me.id, author_name: ctx.me.name }));
      toast('Note added'); reload();
    },
  });
}

// Skills & conduct grades and feedback for one subject.
function editSubjectNotes(c, n, profile, saveProfile) {
  const draft = (n.skills || []).map((r) => [...r]);
  const teacher = textarea({ value: n.teacher_feedback || '', rows: 3 });
  const student = textarea({ value: n.student_feedback || '', rows: 3 });
  modal(`${c.subject.name} · skills & feedback`, h('div', { class: 'scroll stack' },
    h('b', {}, 'Skills & Conduct'), rowsField(['Particulars', 'Grade'], draft),
    field('Teacher feedback on student', teacher), field('Student feedback on teacher', student)), {
    onSubmit: () => saveProfile({ subjects: { ...(profile.subjects || {}), [c.subject_id]: { skills: filled(draft), teacher_feedback: teacher.value, student_feedback: student.value } } }),
  });
}

// One co-curricular activity: level, remarks, competitions, participation and awards.
function editActivity(t, onSave) {
  const rec = t?.rec || {};
  const name = input({ value: t?.name || '', placeholder: 'e.g. Karate', disabled: !!t?.cls });
  const long = (v, ph) => textarea({ value: v || '', rows: 3, placeholder: ph });
  const level = input({ value: rec.level || '', placeholder: 'e.g. Black belt, Grade O' });
  const remarks = long(rec.remarks), comp = long(rec.competitions, 'e.g. District karate championship, Jan 2026');
  const part = long(rec.participation, 'e.g. Annual day performance'), awards = long(rec.awards, 'e.g. Gold medal, inter-school meet');
  modal(t ? `Edit ${t.name}` : 'Add activity', h('div', { class: 'scroll' }, h('div', { class: 'grid2' },
    field('Activity', name), field('Level / grade', level),
    field('Competitions', comp, { style: 'grid-column: span 2' }), field('Participation details', part, { style: 'grid-column: span 2' }),
    field('Awards', awards, { style: 'grid-column: span 2' }), field('Remarks', remarks, { style: 'grid-column: span 2' }))), {
    submit: t ? 'Save' : 'Add Activity',
    onSubmit: () => {
      if (!name.value.trim()) throw new Error('Name the activity.');
      return onSave({ name: name.value.trim(), level: level.value, remarks: remarks.value, competitions: comp.value, participation: part.value, awards: awards.value });
    },
  });
}
