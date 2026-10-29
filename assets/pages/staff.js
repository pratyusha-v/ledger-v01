// Staff Profile (admin): one teacher's or admin's details, classes, timetable, grades due and attendance.
import { db, must, h, mount, param, go, getCurrentYear, getClasses, getGrades, getPeriods, getSettings, className, fmtDMY, isoDate,
  ageOn, pct, btn, card, stat, tag, table, pageHead, backLink, emptyState, input, select, field, textarea, modal, toast, busy,
  uploadDocument } from '../lib.js';
import { DAYS, grid, currentTerm } from './scheduling.js';
import { STATUS_TAG, setupNote } from './people.js';

const MONTH_ORDER = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4];
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ATT_LABEL = { P: 'Present', A: 'Absent', L: 'Late', Leave: 'Paid leave' };

function yearsSince(d) {
  if (!d) return null;
  const n = ageOn(d);
  return n === '—' ? null : n;
}

async function photoUrl(path) {
  if (!path) return null;
  const { data } = await db.storage.from('documents').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

function editDetails(s, grades, isSelf, reload) {
  const name = input({ value: s.name });
  const email = input({ type: 'email', value: s.email, disabled: !!s.user_id });
  const phone = input({ value: s.phone || '', type: 'tel' });
  const dob = input({ type: 'date', value: s.dob || '' });
  const joined = input({ type: 'date', value: s.joined_on || '' });
  const role = select([['teacher', 'Teacher'], ['admin', 'Admin']], s.role, { disabled: isSelf });
  const status = select([['active', 'Active'], ['invited', 'Invited'], ['inactive', 'Inactive']], s.status, { disabled: isSelf });
  const homeroom = select([['', 'None'], ...grades.map((g) => [g.id, g.name])], grades.find((g) => g.class_teacher_id === s.id)?.id ?? '');
  modal(`Edit ${s.name}`, [h('div', { class: 'grid2' },
    field('Name', name), field('Email', email), field('Phone', phone), field('Date of birth', dob), field('Date of joining', joined),
    field('Role', role), field('Status', status), s.role === 'teacher' ? field('Class teacher of', homeroom) : null),
  s.user_id ? h('p', { class: 'muted small', style: 'margin: 0' }, 'Signed in at least once, so the email is locked to their sign-in account.') : null], {
    onSubmit: async () => {
      if (!name.value.trim()) throw new Error('Name is required.');
      must(await db.from('staff').update({
        name: name.value.trim(), email: email.value.trim().toLowerCase(), phone: phone.value.trim(),
        dob: dob.value || null, joined_on: joined.value || null, role: role.value, status: status.value,
      }).eq('id', s.id));
      if (s.role === 'teacher') {
        const was = grades.find((g) => g.class_teacher_id === s.id);
        if (was && String(was.id) !== homeroom.value) must(await db.from('grade_levels').update({ class_teacher_id: null }).eq('id', was.id));
        if (homeroom.value && String(was?.id) !== homeroom.value) must(await db.from('grade_levels').update({ class_teacher_id: s.id }).eq('id', +homeroom.value));
      }
      toast('Saved');
      reload();
    },
  });
}

function recordAttendance(s, reload) {
  const date = input({ type: 'date', value: isoDate() });
  const status = select(Object.entries(ATT_LABEL), 'P');
  const remark = textarea({ rows: 2, placeholder: 'Optional, e.g. half-day leave' });
  modal(`Record attendance · ${s.name}`, h('div', { class: 'grid2' }, field('Date', date), field('Status', status), field('Remark', remark, { style: 'grid-column: span 2' })), {
    onSubmit: async () => {
      if (!date.value) throw new Error('Pick a date.');
      must(await db.from('staff_attendance').upsert({ staff_id: s.id, on_date: date.value, status: status.value, remark: remark.value }));
      toast('Attendance saved');
      reload();
    },
  });
}

export async function render(ctx) {
  const id = param('id');
  const s = id ? must(await db.from('staff').select('*').eq('id', id).maybeSingle()) : null;
  if (!s) { mount(ctx.main, emptyState('Staff member not found', null, btn('Staff Directory', { href: 'AdminStaff.html' }), 'users')); return; }
  const reload = () => render(ctx);
  const teacher = s.role === 'teacher';
  const year = await getCurrentYear();
  const [grades, att, photo] = await Promise.all([
    getGrades(),
    db.from('staff_attendance').select('on_date, status').eq('staff_id', s.id).gte('on_date', year.starts_on).lte('on_date', year.ends_on).then(must),
    photoUrl(s.photo_path),
  ]);
  const homeroom = grades.filter((g) => g.class_teacher_id === s.id);

  // Attendance by month.
  const byMonth = new Map(MONTH_ORDER.map((m) => [m, { days: 0, P: 0, A: 0, L: 0, Leave: 0 }]));
  att.forEach((a) => { const m = byMonth.get(Number(a.on_date.slice(5, 7))); if (m) { m.days++; m[a.status]++; } });
  const tot = [...byMonth.values()].reduce((t, m) => ({ days: t.days + m.days, P: t.P + m.P, A: t.A + m.A, L: t.L + m.L, Leave: t.Leave + m.Leave }), { days: 0, P: 0, A: 0, L: 0, Leave: 0 });
  const attPct = tot.days ? ((tot.P + tot.L) / tot.days) * 100 : null;

  // Teacher-only: classes, grades due, timetable.
  let classes = [], rosterSize = new Map(), due = [];
  if (teacher) {
    classes = (await getClasses(year.id)).filter((c) => c.teacher_id === s.id);
    const ids = classes.map((c) => c.id);
    const [enrol, evals] = ids.length ? await Promise.all([
      db.from('enrollments').select('class_id, student_id').in('class_id', ids).then(must),
      db.from('evaluations').select('id, class_id, name, held_on, max_marks').in('class_id', ids).lte('held_on', isoDate()).order('held_on').then(must),
    ]) : [[], []];
    ids.forEach((cid) => rosterSize.set(cid, enrol.filter((e) => e.class_id === cid).length));
    const marks = evals.length ? must(await db.from('marks').select('evaluation_id, student_id, marks, absent').in('evaluation_id', evals.map((e) => e.id))) : [];
    due = evals.map((e) => {
      const done = new Set(marks.filter((m) => m.evaluation_id === e.id && (m.absent || m.marks !== null)).map((m) => m.student_id));
      return { e, c: classes.find((c) => c.id === e.class_id), missing: enrol.filter((x) => x.class_id === e.class_id && !done.has(x.student_id)).length };
    }).filter((x) => x.missing > 0);
  }

  const photoBox = h('div', { style: 'width: 112px; height: 136px; border-radius: 12px; overflow: hidden; flex-shrink: 0; background: var(--mauve-light); display: flex; align-items: center; justify-content: center; color: var(--mauve); font-size: 40px; font-weight: 900' },
    photo ? h('img', { src: photo, alt: `ID photo of ${s.name}`, style: 'width: 100%; height: 100%; object-fit: cover' }) : h('span', { 'aria-label': 'No ID photo yet' }, s.name.replace(/^(Ms|Mr|Mrs|Dr)\.?\s+/i, '').charAt(0)));
  const upload = h('label', { class: 'btn s', style: 'cursor: pointer' }, photo ? 'Replace ID photo' : 'Upload ID photo', h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const path = await uploadDocument(`staff/${s.id}/photo-${Date.now()}-${f.name}`, f);
      must(await db.from('staff').update({ photo_path: path }).eq('id', s.id));
      toast('ID photo saved'); reload();
    } catch (x) { toast(x.message, true); }
  } }));

  const roleTags = [tag(teacher ? 'Teacher' : 'Admin'), ...homeroom.map((g) => tag(`★ Class teacher · ${g.name}`, 'warn')), tag(...STATUS_TAG[s.status])];
  const service = yearsSince(s.joined_on);

  const sections = [
    backLink('Back to Staff Directory', `AdminStaff.html?tab=${teacher ? 'teachers' : 'admins'}`),
    h('div', { class: 'spread', style: 'align-items: flex-start' },
      h('div', { class: 'row', style: 'align-items: flex-start; gap: 18px' }, photoBox,
        h('div', { class: 'stack', style: 'gap: 10px' }, h('h1', { style: 'margin: 0; font-size: 26px' }, s.name), h('div', { class: 'row' }, roleTags),
          h('div', { class: 'row' }, upload))),
      h('div', { class: 'row' },
        s.status === 'invited' ? btn('Resend set-up', { onclick: () => modal('Set-up instructions', setupNote(s.email), { submit: 'Done' }) }) : null,
        teacher ? null : btn('Record Attendance', { onclick: () => recordAttendance(s, reload) }),
        btn('Edit Details', { primary: true, icon: 'edit', onclick: () => editDetails(s, grades, s.id === ctx.me.id, reload) }))),
    h('section', { class: 'stats' },
      stat(s.dob ? ageOn(s.dob) : '—', `Age · DOB ${fmtDMY(s.dob)}`),
      stat(service === null ? '—' : `${service} yr${service === 1 ? '' : 's'}`, `At school · joined ${fmtDMY(s.joined_on)}`),
      stat(pct(attPct), `Attendance · ${tot.P + tot.L} / ${tot.days} days`),
      teacher ? stat(classes.length, `Classes · ${homeroom.length ? 'class teacher of ' + homeroom.map((g) => g.name).join(', ') : 'subject teacher only'}`) : null,
      teacher ? stat(due.length, 'Grades due') : null),
    card('Details', h('dl', { class: 'kv' }, [
      ['Email', s.email], ['Phone', s.phone], ['Role', teacher ? 'Teacher' : 'Admin'],
      ['Date of birth', fmtDMY(s.dob)], ['Date of joining', fmtDMY(s.joined_on)], ['Status', STATUS_TAG[s.status][0]],
      ['Sign-in', s.user_id ? 'Account set up' : 'Not set up yet'],
    ].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v || '—'))))),
  ];

  if (teacher) {
    const homeIds = new Set(homeroom.map((g) => g.id));
    const rows = [
      ...homeroom.filter((g) => !classes.some((c) => c.grade_id === g.id)).map((g) => ({ homeOnly: g })),
      ...classes.map((c) => ({ c })),
    ];
    const term = await currentTerm(year);
    const [periods, settings, status] = await Promise.all([getPeriods(), getSettings(),
      term ? db.from('timetable_status').select('*').eq('term_id', term.id).maybeSingle().then(must) : null]);
    const slots = term ? must(await db.from('timetable_slots').select('*, grade:grade_levels(name), subject:subjects(name), room:rooms(name)').eq('term_id', term.id).eq('teacher_id', s.id)) : [];
    const days = DAYS.slice(0, settings.week_days === 'Mon–Fri' ? 5 : 6);
    const editTimetable = btn('Edit', { small: true, icon: 'edit', href: `AdminTimetable.html?by=teacher&id=${s.id}${term ? '&term=' + term.id : ''}` });

    sections.push(card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' },
      h('span', {}, 'Classes and timetable ', h('small', {}, `Academic Year ${year.name}`)), editTimetable),
      rows.length ? table([
        { label: 'Class', th: true, render: (r) => (r.homeOnly ? `${r.homeOnly.name} (homeroom)` : h('a', { href: `AdminMain.html?class=${r.c.id}` }, className(r.c))) },
        { label: 'Role in class', render: (r) => (r.homeOnly || homeIds.has(r.c.grade_id) ? tag(`★ Class teacher of ${(r.homeOnly || r.c.grade).name}`, 'warn') : 'Subject teacher') },
        { label: 'Students', cls: 'num', render: (r) => (r.homeOnly ? '—' : rosterSize.get(r.c.id) ?? 0) },
        { label: 'Can edit', cls: 'wrap', render: (r) => (r.homeOnly ? 'Attendance'
          : homeIds.has(r.c.grade_id) ? 'Tests and grades · attendance for the grade' : 'Tests and grades') },
      ], rows) : h('p', { class: 'muted', style: 'margin: 0' }, 'No classes assigned this year. Assign a teacher from a class page.'),
      h('p', { class: 'muted small', style: 'margin: 0' }, '★ A class teacher takes attendance for their grade as well as editing tests and grades. A subject teacher only edits tests and grades for their own classes.'),
      h('div', { class: 'row', style: 'justify-content: space-between' }, h('b', {}, `Timetable · ${term?.name || '—'}`), status?.published ? tag('Published', 'ok') : tag('Draft', 'warn')),
      slots.length ? grid({ periods, days, cellFor: (day, p) => {
        const x = slots.find((y) => y.day === day && y.period_id === p.id);
        return x ? h('div', { class: 'slot' + (homeroom.some((g) => g.name === x.grade.name) ? ' me' : '') }, `${x.grade.name} – ${x.subject.name}`, h('small', {}, x.room?.name || 'No room')) : '';
      } }) : h('p', { class: 'muted small', style: 'margin: 0' }, 'No periods in this term\u2019s timetable.')));

    sections.push(card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, h('span', {}, 'Pending grades due ', h('span', { class: 'count tag' }, due.length))),
      due.length ? table([
        { label: 'Test', th: true, render: (x) => h('a', { href: `AdminTestDetail.html?test=${x.e.id}` }, x.e.name) },
        { label: 'Class', render: (x) => className(x.c) }, { label: 'Held on', render: (x) => fmtDMY(x.e.held_on) },
        { label: 'Students without marks', cls: 'num', render: (x) => x.missing },
        { label: '', render: (x) => btn('Enter marks', { small: true, href: `AdminMarks.html?test=${x.e.id}` }) },
      ], due) : h('p', { class: 'muted small', style: 'margin: 0' }, 'All marks are entered.')));
  }

  sections.push(card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, h('span', {}, 'Attendance ', h('small', {}, `Academic Year ${year.name}`)),
    h('span', { class: 'muted small', style: 'font-weight: 400' }, `${tot.P} present · ${tot.L} late · ${tot.A} absent · ${tot.Leave} paid leave`)),
  tot.days ? h('div', { class: 'tbx', style: 'overflow-x: auto' }, h('table', { class: 'tt' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Month'), MONTH_ORDER.map((m) => h('th', { class: 'num' }, MONTH_NAMES[m])), h('th', { class: 'num' }, 'Total'))),
    h('tbody', {}, [['Working days', 'days'], ['Present', 'P'], ['Late', 'L'], ['Absent', 'A'], ['Paid leave', 'Leave']].map(([label, k]) => h('tr', {}, h('th', { scope: 'row' }, label),
      MONTH_ORDER.map((m) => h('td', { class: 'num' }, byMonth.get(m).days ? byMonth.get(m)[k] : '—')), h('td', { class: 'num' }, h('b', {}, tot[k])))))))
    : h('p', { class: 'muted small', style: 'margin: 0' }, 'No attendance recorded this year. Record it under Staff Services › Staff Attendance.')));

  mount(ctx.main, h('div', { class: 'stack' }, sections));
}
