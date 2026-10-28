// Test details: the test's settings, its stats and every student's marks.
import { db, must, h, mount, param, getClass, getRoster, className, testStats, n1, pct, fmtDMY, stat, btn, card,
  pageHead, backLink, emptyState, studentName, select, field, tag } from '../lib.js';
import { classSidebar } from './common.js';

export const SORTS = [['roll', 'Roll number'], ['name', 'Student name'], ['high', 'Marks, high to low'], ['low', 'Marks, low to high']];
export function sortRows(rows, how, valueOf) {
  const v = (r) => { const x = valueOf(r); return x === null || x === undefined || x === '' || Number.isNaN(+x) ? null : +x; };
  const byRoll = (a, b) => (a.student.roll_no ?? 999) - (b.student.roll_no ?? 999);
  return [...rows].sort((a, b) => {
    if (how === 'name') return studentName(a.student).localeCompare(studentName(b.student));
    if (how === 'high' || how === 'low') {
      const x = v(a), y = v(b);
      if (x === null && y === null) return byRoll(a, b);
      if (x === null) return 1;
      if (y === null) return -1;
      return how === 'high' ? y - x : x - y;
    }
    return byRoll(a, b);
  });
}

export function statsCard(s, max, count) {
  return card('Stats', h('div', { class: 'stats' },
    stat(s.avg === null ? '—' : n1(s.avg), s.avg === null ? 'Average marks' : `Average marks (${pct((s.avg / max) * 100)}) · of ${s.wrote.length} who wrote`),
    stat(s.hi ? n1(s.hi.value) : '—', s.hi ? `Highest · ${studentName(s.hi.student)}` : 'Highest'),
    stat(s.lo ? n1(s.lo.value) : '—', s.lo ? `Lowest · ${studentName(s.lo.student)}` : 'Lowest'),
    stat(s.passPct === null ? '—' : pct(s.passPct), s.passPct === null ? 'Pass percentage' : `Pass percentage · ${s.passed} of ${count} passed (pass mark ${s.passMark} / ${n1(max)})`)));
}

export async function render(ctx) {
  const id = Number(param('test'));
  const test = id ? must(await db.from('evaluations').select('*').eq('id', id).maybeSingle()) : null;
  if (!test) { await classSidebar(ctx, {}); mount(ctx.main, emptyState('Test not found', 'Open a test from a class gradebook.', btn('My Classes', { href: ctx.link('Main') }))); return; }
  const cls = await getClass(test.class_id);
  const editable = (ctx.isAdmin || cls.teacher_id === ctx.me.id) && !cls.year?.closed;
  await classSidebar(ctx, { classId: cls.id, browse: !ctx.isAdmin && cls.teacher_id !== ctx.me.id });

  const [roster, marks] = await Promise.all([getRoster(cls.id), db.from('marks').select('*').eq('evaluation_id', id).then(must)]);
  const byStudent = new Map(marks.map((m) => [m.student_id, m]));
  const s = testStats(test, roster, marks);
  const max = Number(test.max_marks);
  const anyMarks = marks.some((m) => m.absent || m.marks !== null);

  const details = card('Test Details', h('dl', { class: 'kv', style: 'grid-template-columns: repeat(2, minmax(0, 1fr))' },
    [['Test name', test.name], ['Date', fmtDMY(test.held_on)], ['Max marks', n1(max)], ['Weightage', `${n1(Number(test.weight))}% of final grade`],
      ['Students who wrote it', anyMarks ? `${s.wrote.length} of ${roster.length}` : 'Not entered yet'],
      ['Absent', anyMarks ? `${s.absent.length}${s.absent.length ? ' · ' + s.absent.map(studentName).join(', ') : ''}` : 'Not entered yet']]
      .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))),
    h('div', { style: 'grid-column: span 2' }, h('dt', {}, 'Syllabus covered'), h('dd', { class: test.syllabus ? '' : 'muted' }, test.syllabus || 'Not recorded'))));
  const notes = card('Teacher’s Notes', h('p', { class: test.notes ? '' : 'muted', style: 'margin: 0; white-space: pre-wrap; line-height: 1.5' }, test.notes || 'No notes yet'));

  const sortSel = select(SORTS, 'roll', { style: 'width: auto; height: 32px' });
  const rows = roster.map((st) => ({ student: st, m: byStudent.get(st.id) }));
  const tableBox = h('div', { class: 'tbx' });
  const draw = () => {
    const sorted = sortRows(rows, sortSel.value, (r) => (r.m && !r.m.absent ? r.m.marks : null));
    mount(tableBox, h('table', { class: 'tt' },
      h('thead', {}, h('tr', {}, h('th', { class: 'num' }, 'Roll No.'), h('th', {}, 'Student'), h('th', { class: 'num' }, `Marks / ${n1(max)}`), h('th', { class: 'num' }, '%'))),
      h('tbody', {}, sorted.map((r) => {
        const m = r.m;
        const val = !m ? '—' : m.absent ? h('span', { class: 'ab' }, 'Ab') : m.marks === null ? '—' : n1(Number(m.marks));
        return h('tr', {},
          h('td', { class: 'num' }, r.student.roll_no ?? '—'),
          h('th', { scope: 'row' }, h('a', { href: ctx.link('Student', { id: r.student.id }) }, studentName(r.student)),
            s.hi && s.hi.student.id === r.student.id ? [' ', tag('Highest', 'ok')] : null,
            s.lo && s.lo.student.id === r.student.id && s.wrote.length > 1 ? [' ', tag('Lowest', 'warn')] : null),
          h('td', { class: 'num' }, val),
          h('td', { class: 'num' }, m && !m.absent && m.marks !== null ? pct((Number(m.marks) / max) * 100) : m?.absent ? 'Ab' : '—'));
      }))));
  };
  sortSel.addEventListener('change', draw);
  draw();

  mount(ctx.main, h('div', { class: 'stack' },
    backLink('Back to gradebook', ctx.link(ctx.isAdmin || cls.teacher_id === ctx.me.id ? 'Main' : 'AllClasses', { class: cls.id })),
    pageHead(test.name, `${className(cls)} · ${fmtDMY(test.held_on)}`,
      editable ? [btn(anyMarks ? 'Edit' : 'Enter Marks', { primary: true, icon: 'edit', href: ctx.link('Marks', { test: id }) })] : []),
    h('div', { class: 'cols' },
      h('div', { class: 'stack' }, details, statsCard(s, max, roster.length), notes),
      card(h('span', {}, 'Student Marks'), h('div', { class: 'row', style: 'justify-content: flex-end' }, h('span', { class: 'muted small' }, 'Sorted by'), sortSel), tableBox))));
}
