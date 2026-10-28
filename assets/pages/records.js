// Past Records (admin): closed academic years and former students.
import { db, must, h, mount, param, go, getYears, getGrades, getSubjects, getClasses, className, fmtDMY, pct, btn, table, tabs, tag,
  pageHead, emptyState, select, downloadCSV } from '../lib.js';

async function pastYears(ctx) {
  const [years, grades, subjects] = await Promise.all([getYears(), getGrades(), getSubjects()]);
  const closed = years.filter((y) => y.closed);
  if (!closed.length) { mount(ctx.main, h('div', { class: 'stack' }, pageHead('Past Academic Years', 'Read-only archive of classes, gradebooks and attendance from previous years.'), emptyState('No records yet', 'Records appear here once an academic year is closed.', null, 'cal'))); return; }
  const year = closed.find((y) => y.id === Number(param('year'))) || closed[0];
  const grade = param('grade') || '', subject = param('subject') || '', view = param('view') || 'classes';
  const url = (q) => 'AdminPastYears.html?' + new URLSearchParams({ year: year.id, grade, subject, view, ...q });
  const classes = (await getClasses(year.id)).filter((c) => (!grade || c.grade_id === +grade) && (!subject || c.subject_id === +subject));
  const ids = classes.map((c) => c.id);
  const [enrol, evals, att] = await Promise.all([
    ids.length ? db.from('enrollments').select('class_id').in('class_id', ids).then(must) : [],
    ids.length ? db.from('evaluations').select('id, class_id, name').in('class_id', ids).then(must) : [],
    db.from('attendance').select('grade_id, status').gte('on_date', year.starts_on).lte('on_date', year.ends_on).then(must),
  ]);
  const attFor = (gid) => { const a = att.filter((x) => x.grade_id === gid); return a.length ? (a.filter((x) => x.status !== 'A').length / a.length) * 100 : null; };

  const filters = h('div', { class: 'row' },
    h('span', { class: 'muted small' }, 'Academic year'), select(closed.map((y) => [y.id, y.name]), year.id, { style: 'width: auto', onchange: (e) => go(url({ year: e.target.value })) }),
    h('span', { class: 'muted small' }, 'Grade'), select([['', 'All grades'], ...grades.map((g) => [g.id, g.name])], grade, { style: 'width: auto', onchange: (e) => go(url({ grade: e.target.value })) }),
    h('span', { class: 'muted small' }, 'Subject'), select([['', 'All subjects'], ...subjects.filter((s) => s.academic).map((s) => [s.id, s.name])], subject, { style: 'width: auto', onchange: (e) => go(url({ subject: e.target.value })) }));

  let body;
  if (view === 'attendance') {
    const gs = grades.filter((g) => !grade || g.id === +grade);
    body = table([{ label: 'Grade', th: true, key: 'name' }, { label: 'Days recorded', cls: 'num', render: (g) => att.filter((x) => x.grade_id === g.id).length || '—' },
      { label: 'Avg. attendance', cls: 'num', render: (g) => pct(attFor(g.id)) }], gs, { empty: 'No attendance recorded.' });
  } else {
    body = classes.length ? table([
      { label: 'Class', th: true, render: (c) => className(c) }, { label: 'Teacher', render: (c) => c.teacher?.name || '—' },
      { label: 'Students', cls: 'num', render: (c) => enrol.filter((e) => e.class_id === c.id).length },
      { label: 'Avg. attendance', cls: 'num', render: (c) => pct(attFor(c.grade_id)) },
      { label: view === 'gradebooks' ? 'Evaluations' : 'Evaluations', cls: view === 'gradebooks' ? 'wrap' : 'num', render: (c) => {
        const ev = evals.filter((e) => e.class_id === c.id);
        return view === 'gradebooks' ? ev.map((e) => e.name).join(', ') || '—' : ev.length;
      } },
      { label: '', render: (c) => btn('Open', { small: true, href: `AdminAllClasses.html?class=${c.id}` }) },
    ], classes) : emptyState('No records for this year', 'Try another grade or subject.', null, 'cal');
  }

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead('Past Academic Years', 'Read-only archive of classes, gradebooks and attendance from previous years.', [btn('Export Year', { icon: 'download', onclick: () => downloadCSV(`classes-${year.name}.csv`,
      [['Class', 'Teacher', 'Students', 'Evaluations'], ...classes.map((c) => [className(c), c.teacher?.name, enrol.filter((e) => e.class_id === c.id).length, evals.filter((e) => e.class_id === c.id).length])]) })]),
    h('div', { class: 'note' }, 'Archive. Past years are read-only. Reopen a year in School Settings to change it.'),
    filters, tabs([['classes', 'Classes'], ['gradebooks', 'Gradebooks'], ['attendance', 'Attendance']], view, null, { hrefFor: (k) => url({ view: k }) }), body));
}

async function former(ctx) {
  const status = param('status') || 'all';
  const yearLeft = param('year') || '';
  const all = must(await db.from('students').select('id, full_name, status, left_on, left_year, left_grade, left_reason').neq('status', 'active').order('left_on', { ascending: false }));
  const yearsLeft = [...new Set(all.map((s) => s.left_year).filter(Boolean))].sort().reverse();
  const rows = all.filter((s) => (status === 'all' || s.status === status) && (!yearLeft || s.left_year === yearLeft));
  const url = (q) => 'AdminFormerStudents.html?' + new URLSearchParams({ status, year: yearLeft, ...q });
  const label = { withdrawn: 'Withdrawn', transferred: 'Transferred', graduated: 'Graduated' };
  mount(ctx.main, h('div', { class: 'stack' },
    pageHead('Former Students', 'Students who were withdrawn, transferred or graduated. Their profiles are archived.', [btn('Export', { icon: 'download', onclick: () => downloadCSV('former-students.csv',
      [['Student', 'Last grade', 'Year left', 'Left on', 'Reason'], ...rows.map((s) => [s.full_name, s.left_grade, s.left_year, s.left_on, label[s.status]])]) })]),
    tabs([['all', 'All', all.length], ...Object.entries(label).map(([k, l]) => [k, l, all.filter((s) => s.status === k).length])], status, null, { hrefFor: (k) => url({ status: k }) }),
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Year left'),
      select([['', 'All years'], ...yearsLeft], yearLeft, { style: 'width: auto', onchange: (e) => go(url({ year: e.target.value })) })),
    all.length ? table([
      { label: 'Student', th: true, key: 'full_name' }, { label: 'Last grade', render: (s) => s.left_grade || '—' }, { label: 'Year left', render: (s) => s.left_year || '—' },
      { label: 'Left on', render: (s) => fmtDMY(s.left_on) }, { label: 'Reason', render: (s) => tag(label[s.status]) },
      { label: '', render: (s) => btn('Archived Profile', { small: true, href: `AdminStudent.html?id=${s.id}` }) },
    ], rows, { empty: 'No former students match.' })
      : emptyState('No former students', 'Students appear here after a withdrawal, transfer out or graduation.', null, 'users')));
}

export function render(ctx) {
  return ctx.page === 'AdminFormerStudents' ? former(ctx) : pastYears(ctx);
}
