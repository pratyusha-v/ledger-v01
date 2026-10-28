// Add a test, or edit a test's details and marks. Stats update as marks are typed.
import { db, must, h, mount, param, go, getClass, getRoster, className, testStats, n1, pct, isoDate, btn, card,
  pageHead, backLink, emptyState, studentName, select, field, input, textarea, tag, toast, busy, confirmBox } from '../lib.js';
import { classSidebar } from './common.js';
import { SORTS, sortRows, statsCard } from './test.js';

export async function render(ctx) {
  const adding = ctx.page.endsWith('AddTest');
  const testId = Number(param('test'));
  const test = !adding && testId ? must(await db.from('evaluations').select('*').eq('id', testId).maybeSingle()) : null;
  const classId = adding ? Number(param('class')) : test?.class_id;
  if (!classId) { await classSidebar(ctx, {}); mount(ctx.main, emptyState(adding ? 'Pick a class first' : 'Test not found', 'Open a class gradebook, then choose Add Test.', btn('My Classes', { href: ctx.link('Main') }))); return; }

  const cls = await getClass(classId);
  const editable = (ctx.isAdmin || cls.teacher_id === ctx.me.id) && !cls.year?.closed;
  if (!editable) return go(test ? ctx.link('TestDetail', { test: test.id }) : ctx.link('AllClasses', { class: classId }));
  await classSidebar(ctx, { classId });

  const roster = await getRoster(classId);
  const existing = test ? must(await db.from('marks').select('*').eq('evaluation_id', test.id)) : [];
  const state = new Map(roster.map((s) => {
    const m = existing.find((x) => x.student_id === s.id);
    return [s.id, { absent: !!m?.absent, value: m && m.marks !== null ? String(Number(m.marks)) : '' }];
  }));

  // Test details form.
  const name = input({ value: test?.name || '', required: true, placeholder: 'e.g. Test 07' });
  const date = input({ type: 'date', value: test?.held_on || isoDate() });
  const max = input({ type: 'number', min: 1, step: 'any', value: test ? Number(test.max_marks) : '', placeholder: 'e.g. 25' });
  const weight = input({ type: 'number', min: 0, max: 100, step: 'any', value: test ? Number(test.weight) : '', placeholder: 'e.g. 5' });
  const syllabus = textarea({ value: test?.syllabus || '', placeholder: 'Chapters / topics covered in this test' });
  const notes = textarea({ rows: 4, value: test?.notes || '', placeholder: 'Any remarks about this test — e.g. paper difficulty, topics to revisit' });
  const wroteOut = h('dd', {});
  const absentOut = h('dd', {});

  const statsBox = h('div', {});
  const sortSel = select(SORTS, 'roll', { style: 'width: auto; height: 32px' });
  const tableBox = h('div', { class: 'tbx' });
  const maxHead = h('span', {});
  const rows = roster.map((s) => ({ student: s }));

  const current = () => {
    const mx = Number(max.value) || 0;
    const marks = roster.map((s) => {
      const st = state.get(s.id);
      return { student_id: s.id, absent: st.absent, marks: st.absent || st.value === '' ? null : Number(st.value) };
    });
    return { mx, marks };
  };
  const refreshStats = () => {
    const { mx, marks } = current();
    const s = testStats({ max_marks: mx }, roster, marks);
    mount(statsBox, statsCard(s, mx || 1, roster.length));
    wroteOut.textContent = `${s.wrote.length} of ${roster.length}`;
    absentOut.textContent = String(s.absent.length);
    maxHead.textContent = mx ? n1(mx) : '—';
    tableBox.querySelectorAll('tr[data-id]').forEach((tr) => {
      const st = state.get(+tr.dataset.id);
      const cell = tr.querySelector('.pc');
      const v = Number(st.value);
      cell.textContent = st.absent ? 'Ab' : st.value === '' || !mx ? '—' : pct((v / mx) * 100);
      tr.querySelector('.flag').replaceChildren(
        s.hi && s.hi.student.id === +tr.dataset.id ? tag('Highest', 'ok') : '',
        s.lo && s.lo.student.id === +tr.dataset.id && s.wrote.length > 1 ? tag('Lowest', 'warn') : '');
      const inp = tr.querySelector('input.mk');
      const bad = !st.absent && st.value !== '' && (Number.isNaN(v) || v < 0 || (mx && v > mx));
      inp.setAttribute('aria-invalid', bad ? 'true' : 'false');
      inp.style.borderColor = bad ? 'var(--debit)' : '';
    });
  };
  const drawTable = () => {
    const sorted = sortRows(rows, sortSel.value, (r) => { const st = state.get(r.student.id); return st.absent ? null : st.value; });
    mount(tableBox, h('table', { class: 'tt' },
      h('thead', {}, h('tr', {}, h('th', { class: 'num' }, 'Roll No.'), h('th', {}, 'Student'), h('th', { class: 'c' }, 'Absent?'),
        h('th', { class: 'num' }, 'Marks / ', maxHead), h('th', { class: 'num' }, '%'))),
      h('tbody', {}, sorted.map((r) => {
        const st = state.get(r.student.id);
        const mk = h('input', {
          class: 'in mk', inputmode: 'decimal', value: st.absent ? 'Ab' : st.value, disabled: st.absent, style: 'width: 84px; text-align: right; height: 34px',
          'aria-label': `Marks for ${studentName(r.student)}`,
          oninput: (e) => { st.value = e.target.value.trim(); refreshStats(); },
        });
        const ab = h('input', {
          type: 'checkbox', checked: st.absent, 'aria-label': `${studentName(r.student)} absent`,
          onchange: (e) => { st.absent = e.target.checked; mk.disabled = st.absent; mk.value = st.absent ? 'Ab' : st.value; refreshStats(); },
        });
        return h('tr', { 'data-id': r.student.id },
          h('td', { class: 'num' }, r.student.roll_no ?? '—'),
          h('th', { scope: 'row' }, studentName(r.student), ' ', h('span', { class: 'flag' })),
          h('td', { class: 'c' }, ab), h('td', { class: 'num' }, mk), h('td', { class: 'num pc' }, '—'));
      }))));
    refreshStats();
  };
  sortSel.addEventListener('change', drawTable);
  max.addEventListener('input', refreshStats);

  const save = btn(adding ? 'Save Test' : 'Save Changes', { primary: true, onclick: () => busy(save, async () => {
    const { mx, marks } = current();
    if (!name.value.trim()) throw new Error('Give the test a name.');
    if (!mx || mx <= 0) throw new Error('Enter the max marks.');
    const wt = weight.value === '' ? 0 : Number(weight.value);
    if (wt < 0 || wt > 100) throw new Error('Weightage must be between 0 and 100.');
    const bad = marks.find((m) => m.marks !== null && (Number.isNaN(m.marks) || m.marks < 0 || m.marks > mx));
    if (bad) throw new Error(`Marks for ${studentName(roster.find((s) => s.id === bad.student_id))} must be between 0 and ${n1(mx)}.`);
    const fields = { name: name.value.trim(), held_on: date.value || null, max_marks: mx, weight: wt, syllabus: syllabus.value, notes: notes.value };
    const saved = test
      ? must(await db.from('evaluations').update(fields).eq('id', test.id).select().single())
      : must(await db.from('evaluations').insert({ ...fields, class_id: classId }).select().single());
    const upserts = marks.filter((m) => m.absent || m.marks !== null).map((m) => ({ ...m, evaluation_id: saved.id }));
    const cleared = marks.filter((m) => !m.absent && m.marks === null).map((m) => m.student_id);
    if (upserts.length) must(await db.from('marks').upsert(upserts));
    if (cleared.length && test) must(await db.from('marks').delete().eq('evaluation_id', saved.id).in('student_id', cleared));
    toast('Saved');
    go(ctx.link('TestDetail', { test: saved.id }));
  }).catch(() => {}) });

  const del = test ? btn('Delete Test', { danger: true, onclick: async () => {
    if (!(await confirmBox(`Delete ${test.name}?`, 'This removes the test and every mark entered for it. It can’t be undone.', 'Delete Test'))) return;
    await busy(del, async () => { must(await db.from('evaluations').delete().eq('id', test.id)); go(ctx.link('Main', { class: classId })); });
  } }) : null;

  const cancelHref = test ? ctx.link('TestDetail', { test: test.id }) : ctx.link('Main', { class: classId });
  mount(ctx.main, h('div', { class: 'stack' },
    backLink(test ? 'Back to test details' : 'Back to gradebook', cancelHref),
    pageHead(adding ? 'Add Test' : `Edit – ${test.name}`, `${className(cls)} · ${adding ? 'Fill in the test details. Marks can be added now or later.' : 'Editing test details and marks'}`,
      [del, btn('Cancel', { href: cancelHref }), save]),
    h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        card('Test Details', h('div', { class: 'grid2' },
          field('Test name', name), field('Date', date), field('Max marks', max), field('Weightage (% of final grade)', weight),
          h('dl', { class: 'kv', style: 'grid-column: span 2; grid-template-columns: repeat(2, minmax(0, 1fr))' },
            h('div', {}, h('dt', {}, 'Students who wrote it'), wroteOut), h('div', {}, h('dt', {}, 'Absent'), absentOut)),
          field('Syllabus covered', syllabus, { style: 'grid-column: span 2' }))),
        statsBox,
        card('Teacher’s Notes', notes)),
      card('Student Marks', roster.length
        ? [h('div', { class: 'row', style: 'justify-content: flex-end' }, h('span', { class: 'muted small' }, 'Sorted by'), sortSel), tableBox]
        : h('p', { class: 'muted', style: 'margin: 0' }, 'No students on this class roster yet.')))));
  drawTable();
}
