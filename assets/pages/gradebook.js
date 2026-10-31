// Class gradebook: students × evaluations with totals and weighted marks.
// Editable for the class's teacher and for admins; read-only for everyone else.
import {
  db, must, h, mount, param, go, redirect, getClass, getCurrentYear, getClasses, getRoster, getSettings, getGrades,
  className, gradebook, n1, pct, fmtDate, stat, btn, pageHead, emptyState, studentName, select,
} from '../lib.js';
import { classSidebar, classTabs, searchBack } from './common.js';

async function pickClassId(ctx) {
  const id = Number(param('class'));
  if (id) return id;
  const year = await getCurrentYear();
  const classes = await getClasses(year.id);
  const own = classes.find((c) => c.teacher_id === ctx.me.id);
  return (own || (ctx.isAdmin ? classes[0] : null))?.id || null;
}

// The gradebook table on its own, reused by the All Classes search page.
export async function gradebookSection(ctx, cls, { compact = false } = {}) {
  const [roster, evals, settings] = await Promise.all([
    getRoster(cls.id),
    db.from('evaluations').select('*').eq('class_id', cls.id).order('held_on', { nullsFirst: false }).order('id').then(must),
    getSettings(),
  ]);
  const marks = evals.length ? must(await db.from('marks').select('*').in('evaluation_id', evals.map((e) => e.id))) : [];
  const gb = gradebook(evals, roster, marks, settings);
  const editable = (ctx.isAdmin || cls.teacher_id === ctx.me.id) && !cls.year?.closed;
  const testHref = (e) => ctx.link('TestDetail', { test: e.id });

  const stats = h('section', { class: 'stats', 'aria-label': 'Class stats' },
    stat(n1(gb.avg), `Class average · adjusted marks (out of ${gb.totalWeight || 100})`),
    stat(gb.hi ? n1(gb.hi.adjusted) : '—', `Highest${gb.hi ? ' · ' + studentName(gb.hi.student) : ''}`),
    stat(gb.lo ? n1(gb.lo.adjusted) : '—', `Lowest${gb.lo ? ' · ' + studentName(gb.lo.student) : ''}`),
    stat(gb.scoredCount ? pct((gb.passed / gb.scoredCount) * 100) : '—', `Pass percentage · ${gb.passed} of ${gb.scoredCount} passed (pass mark ${gb.passMark})`));

  if (!roster.length) {
    return h('div', { class: 'stack' }, emptyState('No students on this roster', ctx.isAdmin ? 'Students are added when they enrol in this class’s grade.' : 'The school office adds students to class rosters.', null, 'users'));
  }

  const head = h('tr', {},
    h('th', { class: 'name', scope: 'col', style: 'text-align: left' }, 'Student'),
    evals.map((e) => h('th', { class: 'ev', scope: 'col' },
      h('div', {}, h('a', { class: 'evl', href: testHref(e) }, e.name)),
      h('div', { class: 'dt' }, fmtDate(e.held_on)),
      h('div', { class: 'sub' }, `Max ${n1(Number(e.max_marks))} · Wt. ${n1(Number(e.weight))}%`))),
    h('th', { class: 'gap', 'aria-hidden': 'true' }),
    h('th', { class: 'sum first', scope: 'col' }, h('div', {}, 'Total Marks Acquired'), h('div', { class: 'sub' }, `Out of ${n1(gb.totalMax)}`), h('div', { class: 'sub' }, 'Raw %')),
    h('th', { class: 'sum', scope: 'col', title: 'Each evaluation is scaled to its weightage: (marks ÷ max marks) × weight, summed across all evaluations.' },
      h('div', {}, 'Adjusted Marks (Weighted)'), h('div', { class: 'sub' }, `Out of ${n1(gb.totalWeight)}`), h('div', { class: 'sub' }, `Sum of weights = ${n1(gb.totalWeight)}%`)));

  const body = gb.rows.map((r) => h('tr', {},
    h('th', { class: 'name', scope: 'row' }, h('a', { class: 'nm', href: ctx.link('Student', { id: r.student.id }) }, studentName(r.student))),
    r.cells.map((c) => h('td', {}, c.state === 'absent' ? h('span', { class: 'ab' }, 'Ab') : c.state === 'mark' ? n1(c.value) : h('span', { class: 'muted' }, '–'))),
    h('td', { class: 'gap' }),
    h('td', { class: 'sum first' }, h('span', { class: 'big' }, n1(r.raw)), h('span', { class: 'pct' }, pct(r.rawPct))),
    h('td', { class: 'sum' }, h('span', { class: 'big' }, n1(r.adjusted)))));

  return h('div', { class: 'stack' },
    compact ? null : stats,
    h('div', { class: 'row small muted' }, h('span', { class: 'ab' }, 'Ab'), ' = Absent · – = not entered', evals.length ? ' · Click a test name to see its details' + (editable ? ' and enter marks' : '') : ''),
    evals.length
      ? h('div', { style: 'overflow-x: auto' }, h('table', { class: 'tbl' }, h('thead', {}, head), h('tbody', {}, body)))
      : emptyState('No tests yet', editable ? 'Add the first test to start the gradebook.' : 'Tests appear here once the class teacher adds them.',
        editable ? btn('Add Test', { primary: true, icon: 'plus', href: ctx.link(addTestPage(cls), { class: cls.id }) }) : null));
}

// Extracurricular classes grade differently, so Add Test opens their own template.
const addTestPage = (cls) => (cls.subject?.academic === false ? 'AddExtraTest' : 'AddTest');

export async function render(ctx) {
  const id = await pickClassId(ctx);
  if (!id) {
    await classSidebar(ctx, {});
    mount(ctx.main, emptyState('No classes yet', 'You don’t teach any classes this year. Browse all classes to view others.', btn('Browse All Classes', { href: ctx.link('AllClassesStart') }), 'users'));
    return;
  }
  const cls = await getClass(id);
  if (!cls) { mount(ctx.main, emptyState('Class not found', 'It may have been removed.', btn(ctx.isAdmin ? 'Current Classes' : 'All Classes', { href: ctx.link('AllClassesStart') }))); return; }

  const own = cls.teacher_id === ctx.me.id;
  if (!ctx.isAdmin) {
    if (ctx.page === 'Main' && !own) return redirect(`AllClasses.html?class=${id}`);
    if (ctx.page === 'AllClasses' && own) return redirect(`Main.html?class=${id}`);
  }
  const editable = (ctx.isAdmin || own) && !cls.year?.closed;
  const browse = !ctx.isAdmin && !own;
  await classSidebar(ctx, { classId: id, browse });

  const [roster, evalCount] = await Promise.all([getRoster(id), db.from('evaluations').select('id', { count: 'exact', head: true }).eq('class_id', id)]);
  const actions = [];
  if (editable) actions.push(btn('Add Test', { primary: true, icon: 'plus', href: ctx.link(addTestPage(cls), { class: id }) }));

  const notice = cls.year?.closed
    ? h('div', { class: 'note' }, `Archive · ${cls.year.name} is closed, so this class is read-only.`)
    : !editable ? h('div', { class: 'note' }, 'View only. You can see this class’s marks but can’t edit them.') : null;

  mount(ctx.main, h('div', { class: 'stack' },
    searchBack(ctx),
    notice,
    pageHead(className(cls), `${!ctx.isAdmin && own ? '' : `Teacher: ${cls.teacher?.name || 'Not assigned'} · `}${roster.length} students · ${evalCount.count ?? 0} evaluations${cls.year && !cls.year.is_current ? ' · ' + cls.year.name : ''}`, actions),
    classTabs(ctx, cls, 'gradebook'),
    await gradebookSection(ctx, cls)));
}
