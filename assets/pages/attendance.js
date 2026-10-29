// Attendance for a grade: the class teacher (or an admin) takes it; everyone else sees it read-only.
import { db, must, h, mount, param, go, guardUnsaved, getGrades, getCurrentYear, getClass, className, isoDate, fmtDate, pct, btn, card,
  pageHead, emptyState, studentName, input, select, tabs, toast, busy } from '../lib.js';
import { classSidebar, classTabs } from './common.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function gradeRoster(gradeId) {
  return must(await db.from('students').select('id, full_name, display_name, roll_no').eq('grade_id', gradeId).eq('status', 'active').not('roll_no', 'is', null).order('roll_no'));
}

export async function render(ctx) {
  const classId = Number(param('class')) || null;
  const cls = classId ? await getClass(classId) : null;
  const grades = await getGrades();
  let gradeId = Number(param('grade')) || cls?.grade_id || grades.find((g) => g.class_teacher_id === ctx.me.id)?.id;
  if (!gradeId && ctx.isAdmin) gradeId = grades[0]?.id;
  const grade = grades.find((g) => g.id === gradeId);
  if (!grade) {
    await classSidebar(ctx, {});
    mount(ctx.main, emptyState('No homeroom', 'Attendance is taken by class teachers. Open a class to see its attendance.', btn('My Classes', { href: ctx.link('Main') }), 'cal'));
    return;
  }
  const canEdit = ctx.isAdmin || grade.class_teacher_id === ctx.me.id;
  if (ctx.page === 'Attendance' && !canEdit && cls) return go(`AttendanceView.html?class=${cls.id}`);
  await classSidebar(ctx, { classId: cls?.id, gradeId: grade.id, browse: !ctx.isAdmin && !!cls && cls.teacher_id !== ctx.me.id });

  const year = await getCurrentYear();
  const roster = await gradeRoster(grade.id);
  const view = param('view') === 'records' ? 'records' : 'take';
  const date = param('date') || isoDate();
  const selfHref = (q) => `${location.pathname.split('/').pop()}?${new URLSearchParams({ grade: grade.id, ...(cls ? { class: cls.id } : {}), ...q })}`;

  const header = cls
    ? pageHead(cls.subject.name, `${grade.name} · ${!ctx.isAdmin && cls.teacher_id === ctx.me.id ? '' : `Teacher: ${cls.teacher?.name || 'Not assigned'} · `}${roster.length} students`)
    : pageHead(grade.name, `Class teacher: ${grade.class_teacher?.name || 'Not assigned'} · ${roster.length} students`);

  const ids = roster.map((s) => s.id);
  const ytdRows = ids.length ? must(await db.from('attendance').select('student_id, status').in('student_id', ids).gte('on_date', year.starts_on).lte('on_date', year.ends_on)) : [];
  const ytd = new Map(ids.map((id) => [id, { total: 0, present: 0 }]));
  ytdRows.forEach((r) => { const t = ytd.get(r.student_id); t.total++; if (r.status !== 'A') t.present++; });
  const ytdText = (id) => { const t = ytd.get(id); return t.total ? pct((t.present / t.total) * 100) : '—'; };

  const parts = [header];
  if (cls) parts.push(classTabs(ctx, cls, 'attendance'));
  if (!canEdit) parts.push(h('div', { class: 'note' }, `View only. Attendance is taken by the class teacher of ${grade.name}${grade.class_teacher ? ` (${grade.class_teacher.name})` : ''}.`));
  parts.push(tabs([['take', canEdit ? 'Take attendance' : 'By date'], ['records', 'View records']], view, null, { hrefFor: (k) => selfHref({ view: k, date }) }));

  if (!roster.length) {
    mount(ctx.main, h('div', { class: 'stack' }, parts, emptyState('No students in this grade', 'Students appear here once they are enrolled with a roll number.', null, 'users')));
    return;
  }

  if (view === 'records') {
    const month = param('month') || date.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const end = isoDate(new Date(y, m, 0));
    const recs = must(await db.from('attendance').select('student_id, on_date, status').in('student_id', ids).gte('on_date', start).lte('on_date', end));
    const days = [...new Set(recs.map((r) => r.on_date))].sort();
    const at = new Map(recs.map((r) => [r.student_id + ':' + r.on_date, r.status]));
    const monthSel = input({ type: 'month', value: month, style: 'width: auto', onchange: (e) => go(selfHref({ view: 'records', month: e.target.value })) });
    parts.push(h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Month'), monthSel, h('span', { class: 'muted small' }, `${days.length} school days recorded in ${MONTHS[m - 1]} ${y}`)));
    parts.push(days.length
      ? h('div', { class: 'tbx', style: 'overflow-x: auto' }, h('table', { class: 'tt' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Student'), days.map((d) => h('th', { class: 'c', style: 'padding: 0 6px' },
          h('a', { href: selfHref({ view: 'take', date: d }), title: fmtDate(d) }, d.slice(8)))), h('th', { class: 'num' }, 'Present'))),
        h('tbody', {}, roster.map((s) => {
          const marks = days.map((d) => at.get(s.id + ':' + d));
          const present = marks.filter((x) => x && x !== 'A').length;
          return h('tr', {}, h('th', { scope: 'row' }, studentName(s)),
            marks.map((x) => h('td', { class: 'c', style: `padding: 0 6px; ${x === 'A' ? 'color: var(--debit); font-weight: 700' : x === 'L' ? 'color: var(--saffron-deep); font-weight: 700' : 'color: var(--muted)'}` }, x || '·')),
            h('td', { class: 'num' }, `${present} / ${marks.filter(Boolean).length}`));
        }))))
      : emptyState('No attendance this month', 'Pick another month, or take attendance for a day in this month.', null, 'cal'));
    mount(ctx.main, h('div', { class: 'stack' }, parts));
    return;
  }

  const today = must(await db.from('attendance').select('*').in('student_id', ids).eq('on_date', date));
  const state = new Map(roster.map((s) => { const r = today.find((x) => x.student_id === s.id); return [s.id, { status: r?.status || '', remark: r?.remark || '' }]; }));
  const counts = h('div', { class: 'row small' });
  const drawCounts = () => {
    const v = [...state.values()];
    const c = (k) => v.filter((x) => x.status === k).length;
    mount(counts, [['Present', c('P'), 'ok'], ['Absent', c('A'), 'bad'], ['Late', c('L'), 'warn'], ['Not marked', c(''), '']]
      .map(([l, n, k]) => h('span', { class: 'tag' + (k ? ' ' + k : '') }, `${n} ${l}`)));
  };

  const dateIn = input({ type: 'date', value: date, style: 'width: auto', 'data-no-dirty': true, onchange: async (e) => {
    if (guard) { if (!(await guard.leave(selfHref({ date: e.target.value })))) e.target.value = date; } else go(selfHref({ date: e.target.value }));
  } });
  const body = h('tbody', {}, roster.map((s) => {
    const st = state.get(s.id);
    const statusCell = canEdit
      ? h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `${studentName(s)} status` }, ['P', 'A', 'L'].map((k) => h('label', {},
        h('input', { type: 'radio', name: 'st' + s.id, value: k, checked: st.status === k, onchange: () => { st.status = k; drawCounts(); } }),
        h('span', {}, k))))
      : st.status ? ({ P: 'Present', A: 'Absent', L: 'Late' })[st.status] : h('span', { class: 'muted' }, 'Not marked');
    const remark = canEdit
      ? input({ value: st.remark, placeholder: 'Remark', style: 'height: 34px; min-width: 160px', 'aria-label': `Remark for ${studentName(s)}`, oninput: (e) => { st.remark = e.target.value; } })
      : st.remark || '—';
    return h('tr', {}, h('td', { class: 'num' }, s.roll_no), h('th', { scope: 'row' }, h('a', { href: ctx.link('Student', { id: s.id }) }, studentName(s))),
      h('td', {}, statusCell), h('td', {}, remark), h('td', { class: 'num' }, ytdText(s.id)));
  }));

  const actions = canEdit ? [
    btn('Mark All Present', { onclick: () => {
      state.forEach((st) => { if (!st.status) st.status = 'P'; });
      body.querySelectorAll('.seg').forEach((seg) => { if (!seg.querySelector('input:checked')) seg.querySelector('input[value="P"]').checked = true; });
      drawCounts();
      guard?.mark();
    } }),
  ] : [];
  const saveBtn = canEdit ? btn('Save Attendance', { primary: true, onclick: () => busy(saveBtn, async () => {
    const rows = roster.filter((s) => state.get(s.id).status).map((s) => ({
      student_id: s.id, on_date: date, grade_id: grade.id, status: state.get(s.id).status, remark: state.get(s.id).remark, marked_by: ctx.me.id,
    }));
    if (!rows.length) throw new Error('Mark at least one student first.');
    must(await db.from('attendance').upsert(rows));
    guard?.clear();
    toast(`Attendance saved for ${fmtDate(date)}`);
  }).catch(() => {}) }) : null;
  if (saveBtn) actions.push(saveBtn);

  parts.push(h('div', { class: 'spread' }, h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Date'), dateIn, counts), h('div', { class: 'row' }, actions)));
  parts.push(h('div', { class: 'tbx' }, h('table', { class: 'tt' },
    h('thead', {}, h('tr', {}, h('th', { class: 'num' }, 'Roll No.'), h('th', {}, 'Student'), h('th', {}, 'Status'), h('th', {}, 'Remark'), h('th', { class: 'num' }, 'Year to date'))),
    body)));
  parts.push(h('p', { class: 'muted small', style: 'margin: 0' }, 'P = Present · A = Absent · L = Late. ', canEdit
    ? (ctx.isAdmin ? 'As an admin you can take or correct attendance for any class.' : 'Subject teachers see this attendance read-only in their own class pages.') : ''));
  mount(ctx.main, h('div', { class: 'stack' }, parts));
  drawCounts();
  // Teachers taking attendance get a warning before leaving without saving.
  const guard = canEdit && !ctx.isAdmin ? guardUnsaved(ctx.main) : null;
}
