// Class gradebook: students × evaluations with totals and weighted marks.
// Editable for the class's teacher and for admins; read-only for everyone else.
import {
  db, must, h, mount, param, go, getClass, getCurrentYear, getClasses, getRoster, getSettings, getStaff, getGrades,
  className, gradebook, n1, pct, fmtDate, stat, btn, pageHead, emptyState, studentName, modal, select, field, checkbox, toast,
} from '../lib.js';
import { classSidebar, classTabs } from './common.js';

async function pickClassId(ctx) {
  const id = Number(param('class'));
  if (id) return id;
  const year = await getCurrentYear();
  const classes = await getClasses(year.id);
  const own = classes.find((c) => c.teacher_id === ctx.me.id);
  return (own || (ctx.isAdmin ? classes[0] : null))?.id || null;
}

function assignTeacher(cls, onDone) {
  return async () => {
    const staff = (await getStaff()).filter((s) => s.role === 'teacher' && s.status !== 'inactive');
    const pick = select([['', 'No teacher'], ...staff.map((s) => [s.id, s.name])], cls.teacher_id || '');
    modal(`Assign teacher · ${className(cls)}`, field('Teacher', pick), {
      onSubmit: async () => {
        must(await db.from('classes').update({ teacher_id: pick.value || null }).eq('id', cls.id));
        toast('Teacher assigned');
        onDone();
      },
    });
  };
}

function manageRoster(cls, roster, onDone) {
  return async () => {
    const all = must(await db.from('students').select('id, full_name, display_name, roll_no, grade_id').eq('status', 'active').order('roll_no'));
    const onRoster = new Set(roster.map((s) => s.id));
    const sameGrade = all.filter((s) => s.grade_id === cls.grade_id || onRoster.has(s.id));
    const boxes = sameGrade.map((s) => ({ s, el: checkbox(`${studentName(s)}${s.roll_no ? ` · Roll ${s.roll_no}` : ''}`, onRoster.has(s.id)) }));
    modal(`Manage roster · ${className(cls)}`, h('div', { class: 'scroll' }, h('p', { class: 'muted small', style: 'margin: 0' }, `Students in ${cls.grade.name}. Ticked students are on this class's roster.`), boxes.map((b) => b.el)), {
      onSubmit: async () => {
        const want = new Set(boxes.filter((b) => b.el.querySelector('input').checked).map((b) => b.s.id));
        const add = [...want].filter((id) => !onRoster.has(id)).map((id) => ({ class_id: cls.id, student_id: id }));
        const remove = [...onRoster].filter((id) => !want.has(id));
        if (add.length) must(await db.from('enrollments').insert(add));
        if (remove.length) must(await db.from('enrollments').delete().eq('class_id', cls.id).in('student_id', remove));
        toast('Roster updated');
        onDone();
      },
    });
  };
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
    return h('div', { class: 'stack' }, emptyState('No students on this roster', ctx.isAdmin ? 'Use Manage Roster to add students to this class.' : 'The school office adds students to class rosters.', null, 'users'));
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
        editable ? btn('Add Test', { primary: true, icon: 'plus', href: ctx.link('AddTest', { class: cls.id }) }) : null));
}

export async function render(ctx) {
  const id = await pickClassId(ctx);
  if (!id) {
    await classSidebar(ctx, {});
    mount(ctx.main, emptyState('No classes yet', 'You don’t teach any classes this year. Browse all classes to view others.', btn('Browse All Classes', { href: ctx.link('AllClassesStart') }), 'users'));
    return;
  }
  const cls = await getClass(id);
  if (!cls) { mount(ctx.main, emptyState('Class not found', 'It may have been removed.', btn('All Classes', { href: ctx.link('AllClassesStart') }))); return; }

  const own = cls.teacher_id === ctx.me.id;
  if (!ctx.isAdmin) {
    if (ctx.page === 'Main' && !own) return go(`AllClasses.html?class=${id}`);
    if (ctx.page === 'AllClasses' && own) return go(`Main.html?class=${id}`);
  }
  const editable = (ctx.isAdmin || own) && !cls.year?.closed;
  const browse = !ctx.isAdmin && !own;
  await classSidebar(ctx, { classId: id, browse });

  const [roster, evalCount] = await Promise.all([getRoster(id), db.from('evaluations').select('id', { count: 'exact', head: true }).eq('class_id', id)]);
  const reload = () => render(ctx);
  const actions = [];
  if (ctx.isAdmin && !cls.year?.closed) {
    actions.push(btn('Assign Teacher', { onclick: assignTeacher(cls, reload) }), btn('Manage Roster', { onclick: manageRoster(cls, roster, reload) }));
  }
  if (editable) actions.push(btn('Add Test', { primary: true, icon: 'plus', href: ctx.link('AddTest', { class: id }) }));

  const notice = cls.year?.closed
    ? h('div', { class: 'note' }, `Archive · ${cls.year.name} is closed, so this class is read-only.`)
    : !editable ? h('div', { class: 'note' }, 'View only. You can see this class’s marks but can’t edit them.') : null;

  mount(ctx.main, h('div', { class: 'stack' },
    notice,
    pageHead(className(cls), `Teacher: ${cls.teacher?.name || 'Not assigned'} · ${roster.length} students · ${evalCount.count ?? 0} evaluations${cls.year && !cls.year.is_current ? ' · ' + cls.year.name : ''}`, actions),
    classTabs(ctx, cls, 'gradebook'),
    await gradebookSection(ctx, cls)));
}
