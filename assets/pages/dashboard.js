// Dashboard: what needs attention today, for a teacher or for the whole school.
import { db, must, h, mount, getCurrentYear, getClasses, getGrades, getSettings, className, gradebook, isoDate, fmtDMY,
  greeting, n1, pct, btn, card, stat, pageHead, studentName, input, field, textarea, modal, toast, emptyState } from '../lib.js';
import { findConflicts } from './scheduling.js';

const item = (title, sub, action) => h('div', { class: 'item' }, h('div', { class: 'it' }, h('b', {}, title), h('span', {}, sub)), action);
const count = (n) => h('span', { class: 'count tag' }, n);
const section = (title, n, href, items, emptyText) => card(
  h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, h('span', {}, title),
    h('span', { class: 'row' }, n !== null ? count(n) : null, href ? h('a', { href, style: 'font-size: 13px; font-weight: 400' }, 'View all') : null)),
  h('div', {}, items.length ? items : h('p', { class: 'muted small', style: 'margin: 0' }, emptyText)));

async function teacher(ctx) {
  const year = await getCurrentYear();
  const today = isoDate();
  const [classes, grades, settings] = await Promise.all([getClasses(year.id), getGrades(), getSettings()]);
  const own = classes.filter((c) => c.teacher_id === ctx.me.id);
  const homeroom = grades.filter((g) => g.class_teacher_id === ctx.me.id);
  const classIds = own.map((c) => c.id);

  const [evals, enrol] = await Promise.all([
    classIds.length ? db.from('evaluations').select('*').in('class_id', classIds).order('held_on').then(must) : [],
    classIds.length ? db.from('enrollments').select('class_id, student:students(id, full_name, display_name, grade_id, roll_no)').in('class_id', classIds).then(must) : [],
  ]);
  const marks = evals.length ? must(await db.from('marks').select('evaluation_id, student_id, marks, absent').in('evaluation_id', evals.map((e) => e.id))) : [];
  const rosterOf = (cid) => enrol.filter((e) => e.class_id === cid).map((e) => e.student);

  // Grades due: tests on or before today with marks missing for someone on the roster.
  const due = evals.filter((e) => !e.held_on || e.held_on <= today).map((e) => {
    const roster = rosterOf(e.class_id);
    const got = new Set(marks.filter((m) => m.evaluation_id === e.id && (m.absent || m.marks !== null)).map((m) => m.student_id));
    return { e, missing: roster.filter((s) => !got.has(s.id)).length };
  }).filter((x) => x.missing > 0);

  // Tasks: today's attendance, pending documents, tests without notes.
  const tasks = [];
  for (const g of homeroom) {
    const { count: n } = await db.from('attendance').select('student_id', { count: 'exact', head: true }).eq('grade_id', g.id).eq('on_date', today);
    if (!n) tasks.push(item('Take today’s attendance', `${g.name} · Class teacher`, btn('Open', { small: true, href: ctx.link('Attendance', { grade: g.id }) })));
  }
  const studentIds = [...new Set(enrol.map((e) => e.student.id))];
  const docs = studentIds.length ? must(await db.from('student_documents').select('student_id, name').eq('submitted', false).in('student_id', studentIds)) : [];
  const docsBy = docs.reduce((m, d) => m.set(d.student_id, (m.get(d.student_id) || 0) + 1), new Map());
  docsBy.forEach((n, sid) => {
    const s = enrol.find((e) => e.student.id === sid).student;
    tasks.push(item('Pending documents', `${studentName(s)} · ${n} certificate${n > 1 ? 's' : ''} not submitted`, btn('View', { small: true, href: ctx.link('Student', { id: sid }) + '#documents' })));
  });
  own.forEach((c) => {
    const noNotes = evals.filter((e) => e.class_id === c.id && !e.notes).length;
    if (noNotes) tasks.push(item('Add remarks to evaluations', `${className(c)} · ${noNotes} evaluation${noNotes > 1 ? 's' : ''} without notes`, btn('Open', { small: true, href: ctx.link('Main', { class: c.id }) })));
  });

  const search = h('form', { action: ctx.link('Search').split('?')[0], method: 'get', class: 'row', style: 'flex-wrap: nowrap' },
    input({ name: 'q', placeholder: 'Search students by name or adm. no.', 'aria-label': 'Search students', style: 'width: 300px' }),
    btn('Search', { type: 'submit', icon: 'search' }));

  const classCards = own.map((c) => {
    const roster = rosterOf(c.id);
    const ev = evals.filter((e) => e.class_id === c.id);
    const gb = gradebook(ev, roster, marks.filter((m) => ev.some((e) => e.id === m.evaluation_id)), settings);
    return h('a', { href: ctx.link('Main', { class: c.id }), class: 'card', style: 'text-decoration: none; color: inherit' },
      h('div', { class: 'sh' }, className(c)),
      h('div', { class: 'stats' }, stat(roster.length, 'Students'), stat(ev.length, 'Evaluations'), stat(n1(gb.avg), 'Class avg (adjusted)')));
  });

  const announcements = must(await db.from('announcements').select('*').order('posted_at', { ascending: false }).limit(3));
  mount(ctx.main, h('div', { class: 'stack' },
    pageHead(`${greeting()}, ${ctx.me.name}`, `Here’s what needs your attention · Academic Year ${year.name}`, [search]),
    h('div', { class: 'grid3' },
      section('Grades Due', due.length, null, due.map(({ e, missing }) => {
        const c = own.find((x) => x.id === e.class_id);
        return item(e.name, `${className(c)} · Max ${n1(Number(e.max_marks))} · ${missing} student${missing > 1 ? 's' : ''} without marks`, btn('Enter marks', { small: true, href: ctx.link('Marks', { test: e.id }) }));
      }), 'All marks are entered.'),
      section('Tasks', tasks.length, null, tasks, 'Nothing pending.'),
      section('Announcements', null, null, announcements.map((a) => item(a.title, `${a.body} · Posted ${fmtDMY(a.posted_at)}`)), 'No announcements.')),
    h('div', { class: 'spread' }, h('h2', { style: 'margin: 0; font-size: 18px' }, 'My Classes'), h('a', { href: ctx.link('AllClassesStart'), style: 'font-size: 13px' }, 'Browse all classes')),
    classCards.length ? h('div', { class: 'grid3' }, classCards) : emptyState('No classes assigned', 'The school office assigns classes to teachers.', null, 'users')));
}

async function admin(ctx) {
  const year = await getCurrentYear();
  const today = isoDate();
  const [classes, grades] = await Promise.all([getClasses(year.id), getGrades()]);
  const [students, attToday, apps, transfers, evals, announcements, conflicts] = await Promise.all([
    db.from('students').select('id, grade_id').eq('status', 'active').not('roll_no', 'is', null).then(must),
    db.from('attendance').select('grade_id, status').eq('on_date', today).then(must),
    db.from('applications').select('id, full_name, status, grade:grade_levels(name), documents').in('status', ['new', 'in_review', 'accepted']).order('applied_on', { ascending: false }).then(must),
    db.from('transfers').select('*').eq('status', 'pending').order('effective_on').then(must),
    db.from('evaluations').select('id, name, class_id, held_on').in('class_id', classes.map((c) => c.id)).lte('held_on', today).then(must),
    db.from('announcements').select('*').order('posted_at', { ascending: false }).limit(5).then(must),
    findConflicts(),
  ]);
  const marks = evals.length ? must(await db.from('marks').select('evaluation_id, student_id').in('evaluation_id', evals.map((e) => e.id))) : [];
  const enrol = must(await db.from('enrollments').select('class_id, student_id').in('class_id', classes.map((c) => c.id)));

  const gradesWithStudents = grades.filter((g) => students.some((s) => s.grade_id === g.id));
  const missingAttendance = gradesWithStudents.filter((g) => !attToday.some((a) => a.grade_id === g.id));
  const presentPct = attToday.length ? (attToday.filter((a) => a.status !== 'A').length / attToday.length) * 100 : null;

  const missingGrades = classes.map((c) => {
    const roster = enrol.filter((e) => e.class_id === c.id).length;
    const pending = evals.filter((e) => e.class_id === c.id && marks.filter((m) => m.evaluation_id === e.id).length < roster);
    return { c, pending };
  }).filter((x) => x.pending.length);

  const appLabel = { new: 'New application', in_review: 'In review', accepted: 'Accepted · ready to enroll' };
  const post = () => {
    const title = input({ required: true, placeholder: 'Title' });
    const body = textarea({ placeholder: 'Message to staff' });
    modal('Post announcement', [field('Title', title), field('Message', body)], {
      submit: 'Post',
      onSubmit: async () => {
        if (!title.value.trim()) throw new Error('Add a title.');
        must(await db.from('announcements').insert({ title: title.value.trim(), body: body.value, posted_by_name: ctx.me.name }));
        toast('Announcement posted');
        render(ctx);
      },
    });
  };

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead(`${greeting()}, ${ctx.me.name}`, `School-wide tasks that need attention · Academic Year ${year.name}`,
      [btn('Export Reports', { href: 'AdminReports.html' }), btn('New Application', { primary: true, icon: 'plus', href: 'AdminNewApplication.html' })]),
    h('section', { class: 'stats', 'aria-label': 'School stats' },
      stat(students.length, 'Students enrolled'),
      stat(pct(presentPct), presentPct === null ? 'Attendance today · not taken yet' : 'Attendance today'),
      h('div', { class: 'stat' }, h('b', {}, conflicts.length), h('span', {}, `Timetable conflict${conflicts.length === 1 ? '' : 's'}`, conflicts.length ? [' · ', h('a', { href: 'AdminTimetable.html' }, 'Resolve')] : '')),
      stat(missingAttendance.length, 'Classes missing attendance today')),
    h('div', { class: 'grid3' },
      section('Pending Admissions', apps.length, 'AdminAdmissions.html', apps.slice(0, 4).map((a) => item(a.full_name, `${a.grade?.name || '—'} · ${Object.values(a.documents || {}).includes('missing') && a.status !== 'accepted' ? 'Documents missing' : appLabel[a.status]}`,
        btn(a.status === 'accepted' ? 'Enroll' : 'Review', { small: true, href: `AdminApplication.html?id=${a.id}` }))), 'No applications waiting.'),
      section('Pending Transfers', transfers.length, 'AdminTransfers.html', transfers.slice(0, 4).map((t) => item(t.student_name,
        t.kind === 'incoming' ? `Incoming · from ${t.from_place || '—'}` : t.kind === 'outgoing' ? `Outgoing · to ${t.to_place || '—'}` : `Internal · ${t.from_place} → ${t.to_place}`,
        btn('Open', { small: true, href: `AdminTransfers.html?id=${t.id}` }))), 'No transfers in progress.'),
      section('Classes Missing Grades', missingGrades.length, 'AdminAllClassesStart.html', missingGrades.slice(0, 4).map(({ c, pending }) => item(className(c),
        `${pending.map((e) => e.name).slice(0, 2).join(' · ')}${pending.length > 2 ? ` +${pending.length - 2}` : ''} · not entered`,
        btn('Open', { small: true, href: `AdminMain.html?class=${c.id}` }))), 'Every class is up to date.')),
    card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, 'Announcements', btn('Post Announcement', { small: true, onclick: post })),
      h('div', {}, announcements.length ? announcements.map((a) => item(a.title, `${a.body || ''} · Posted ${fmtDMY(a.posted_at)} by ${a.posted_by_name}`,
        btn('Remove', { small: true, danger: true, onclick: async () => { must(await db.from('announcements').delete().eq('id', a.id)); render(ctx); } })))
        : h('p', { class: 'muted small', style: 'margin: 0' }, 'No announcements yet.')))));
}

export function render(ctx) {
  return ctx.isAdmin ? admin(ctx) : teacher(ctx);
}
