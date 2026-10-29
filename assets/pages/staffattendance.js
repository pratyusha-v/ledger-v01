// Staff Attendance (admin): a daily register for teachers and admins, and staff leave.
// Adding a leave marks its school days absent automatically (see migration 008).
import { db, must, h, mount, param, go, getCurrentYear, isoDate, fmtDate, fmtDMY, pct, btn, tabs, tag, card, pageHead, emptyState,
  input, select, field, textarea, modal, toast, busy, confirmBox } from '../lib.js';

const CODES = [['P', 'Present'], ['A', 'Absent'], ['L', 'Late']];

// School days in a range (Mon–Sat, or Mon–Fri when the school week is five days).
function schoolDays(from, to, fiveDay) {
  let n = 0;
  for (let d = new Date(from + 'T00:00'); d <= new Date(to + 'T00:00'); d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && !(fiveDay && dow === 6)) n++;
  }
  return n;
}

function addLeave(staff, fiveDay, me, onDone) {
  const who = select([['', 'Select staff member'], ...staff.map((s) => [s.id, `${s.name} · ${s.role === 'admin' ? 'Admin' : 'Teacher'}`])], '');
  const kind = select([['day', 'Single day'], ['range', 'Date range']], 'day');
  const from = input({ type: 'date', value: isoDate() });
  const to = input({ type: 'date', value: isoDate() });
  const reason = textarea({ rows: 2, placeholder: 'e.g. Medical appointment, family function' });
  const toField = field('To', to);
  const fromField = field('Date', from);
  const summary = h('p', { class: 'muted small', style: 'margin: 0' });
  const refresh = () => {
    toField.hidden = kind.value === 'day';
    fromField.firstChild.textContent = kind.value === 'day' ? 'Date' : 'From';
    if (kind.value === 'day') to.value = from.value;
    const n = from.value && to.value && to.value >= from.value ? schoolDays(from.value, to.value, fiveDay) : 0;
    summary.textContent = n ? `${n} school day${n === 1 ? '' : 's'} will be marked absent (on leave).` : '';
  };
  [kind, from, to].forEach((el) => el.addEventListener('input', refresh));
  modal('Add leave', [h('div', { class: 'grid2' }, field('Staff member', who), field('Leave for', kind), fromField, toField,
    field('Reason', reason, { style: 'grid-column: span 2' })), summary], {
    submit: 'Save Leave',
    onSubmit: async () => {
      if (!who.value) throw new Error('Pick the staff member.');
      if (!from.value || !to.value) throw new Error('Pick the date.');
      if (to.value < from.value) throw new Error('The end date is before the start date.');
      must(await db.from('staff_leaves').insert({ staff_id: who.value, starts_on: from.value, ends_on: to.value, reason: reason.value.trim(), created_by_name: me.name }));
      toast('Leave added');
      onDone();
    },
  });
  refresh();
}

export async function render(ctx) {
  const view = param('view') === 'leave' ? 'leave' : 'register';
  const role = param('role') || '';
  const date = param('date') || isoDate();
  const today = isoDate();
  const [year, settings] = await Promise.all([getCurrentYear(), db.from('school_settings').select('week_days').eq('id', 1).maybeSingle().then(must)]);
  const fiveDay = settings?.week_days === 'Mon–Fri';
  const allStaff = must(await db.from('staff').select('id, name, role').eq('status', 'active').order('name'));
  const staff = role ? allStaff.filter((s) => s.role === role) : allStaff;
  const ids = staff.map((s) => s.id);
  const yearRows = ids.length ? must(await db.from('staff_attendance').select('staff_id, on_date, status, remark, leave_id').in('staff_id', ids).gte('on_date', year.starts_on).lte('on_date', year.ends_on)) : [];
  const url = (q) => 'AdminStaffAttendance.html?' + new URLSearchParams({ view, role, date, ...q });

  const roleSel = select([['', 'All staff'], ['teacher', 'Teachers'], ['admin', 'Admins']], role, { style: 'width: auto', onchange: (e) => go(url({ role: e.target.value })) });
  const parts = [
    pageHead('Staff Attendance', 'Record daily attendance for teachers and admins, and plan staff leave.'),
    tabs([['register', 'Daily register'], ['leave', 'Leave']], view, null, { hrefFor: (k) => url({ view: k }) }),
  ];

  if (!allStaff.length) {
    mount(ctx.main, h('div', { class: 'stack' }, parts, emptyState('No active staff', 'Active teachers and admins appear here.', null, 'users')));
    return;
  }

  if (view === 'leave') {
    const leaves = must(await db.from('staff_leaves').select('*').gte('ends_on', today).order('starts_on'));
    const nameOf = (id) => allStaff.find((s) => s.id === id)?.name || 'Former staff';
    const upcoming = leaves.filter((l) => !role || allStaff.find((s) => s.id === l.staff_id)?.role === role);
    const remove = (l) => async () => {
      if (!(await confirmBox(`Remove ${nameOf(l.staff_id)}’s leave?`, 'The days it marked absent go back to unmarked.', 'Remove Leave'))) return;
      must(await db.from('staff_leaves').delete().eq('id', l.id));
      toast('Leave removed');
      render(ctx);
    };

    parts.push(h('div', { class: 'spread', style: 'align-items: center' }, h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Show'), roleSel),
      btn('Add Leave', { primary: true, icon: 'plus', onclick: () => addLeave(allStaff, fiveDay, ctx.me, () => render(ctx)) })));

    parts.push(card(h('span', {}, 'Upcoming leave ', h('span', { class: 'count tag' }, upcoming.length)),
      upcoming.length ? h('div', { class: 'tbx' }, h('table', { class: 'tt' },
        h('thead', {}, h('tr', {}, ['Name', 'From', 'To', 'School days', 'Reason', 'Added by', ''].map((l, i) => h('th', { class: i === 3 ? 'num' : '' }, l)))),
        h('tbody', {}, upcoming.map((l) => h('tr', {},
          h('th', { scope: 'row' }, h('a', { href: `AdminStaffProfile.html?id=${l.staff_id}` }, nameOf(l.staff_id)), l.starts_on <= today ? [' ', tag('On leave now', 'warn')] : null),
          h('td', {}, fmtDMY(l.starts_on)), h('td', {}, fmtDMY(l.ends_on)),
          h('td', { class: 'num' }, schoolDays(l.starts_on, l.ends_on, fiveDay)),
          h('td', { class: 'wrap' }, l.reason || '—'), h('td', {}, l.created_by_name || '—'),
          h('td', {}, btn('Remove', { small: true, danger: true, onclick: remove(l) })))))))
        : h('p', { class: 'muted small', style: 'margin: 0' }, 'No upcoming leave. Use Add Leave to plan one.')));

    mount(ctx.main, h('div', { class: 'stack' }, parts));
    return;
  }

  // Daily register.
  const onDate = date >= year.starts_on && date <= year.ends_on ? yearRows.filter((r) => r.on_date === date)
    : ids.length ? must(await db.from('staff_attendance').select('staff_id, on_date, status, remark, leave_id').in('staff_id', ids).eq('on_date', date)) : [];
  const state = new Map(staff.map((s) => { const r = onDate.find((x) => x.staff_id === s.id); return [s.id, { status: r?.status || '', remark: r?.remark || '', leave: !!r?.leave_id }]; }));
  const counts = h('div', { class: 'row small' });
  const drawCounts = () => {
    const v = [...state.values()];
    mount(counts, [['P', 'Present', 'ok'], ['A', 'Absent', 'bad'], ['L', 'Late', 'warn'], ['', 'Not marked', '']]
      .map(([k, l, c]) => h('span', { class: 'tag' + (c ? ' ' + c : '') }, `${v.filter((x) => x.status === k).length} ${l}`)),
    v.some((x) => x.leave) ? h('span', { class: 'tag' }, `${v.filter((x) => x.leave).length} on leave`) : null);
  };
  const body = h('tbody', {}, staff.map((s) => {
    const st = state.get(s.id);
    return h('tr', {},
      h('th', { scope: 'row' }, h('a', { href: `AdminStaffProfile.html?id=${s.id}` }, s.name), st.leave ? [' ', tag('On leave', 'warn')] : null),
      h('td', {}, s.role === 'admin' ? 'Admin' : 'Teacher'),
      h('td', {}, h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `${s.name} attendance` }, CODES.map(([v, long]) => h('label', { title: st.leave ? 'On leave · remove the leave under the Leave tab to change this' : long },
        h('input', { type: 'radio', name: 'st-' + s.id, value: v, checked: st.status === v, disabled: st.leave, 'aria-label': long, onchange: () => { st.status = v; drawCounts(); } }),
        h('span', {}, v))))),
      h('td', {}, st.leave ? h('span', { class: 'muted' }, 'On leave') : input({ value: st.remark, placeholder: 'Remark', style: 'height: 34px; min-width: 180px', 'aria-label': `Remark for ${s.name}`, oninput: (e) => { st.remark = e.target.value; } })));
  }));
  const markAll = btn('Mark All Present', { onclick: () => {
    staff.forEach((s) => { const st = state.get(s.id); if (!st.status && !st.leave) st.status = 'P'; });
    body.querySelectorAll('.seg').forEach((seg) => { if (!seg.querySelector('input:checked') && !seg.querySelector('input:disabled')) seg.querySelector('input[value="P"]').checked = true; });
    drawCounts();
  } });
  const save = btn('Save Attendance', { primary: true, onclick: () => busy(save, async () => {
    const rows = staff.filter((s) => state.get(s.id).status && !state.get(s.id).leave)
      .map((s) => ({ staff_id: s.id, on_date: date, status: state.get(s.id).status, remark: state.get(s.id).remark }));
    if (!rows.length) throw new Error('Mark at least one person first.');
    must(await db.from('staff_attendance').upsert(rows));
    toast(`Staff attendance saved for ${fmtDate(date)}`);
    go(url({}));
  }).catch(() => {}) });

  const present = yearRows.filter((r) => r.status !== 'A').length;
  parts.push(h('div', { class: 'spread', style: 'align-items: center' },
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Date'), input({ type: 'date', value: date, style: 'width: auto', onchange: (e) => go(url({ date: e.target.value })) }),
      h('span', { class: 'muted small' }, 'Show'), roleSel, counts),
    h('div', { class: 'row' }, markAll, save)));
  parts.push(h('div', { class: 'tbx' }, h('table', { class: 'tt' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Role'), h('th', {}, 'Status'), h('th', {}, 'Remark'))),
    body)));
  parts.push(h('p', { class: 'muted small', style: 'margin: 0' }, `P = Present · A = Absent · L = Late. Staff on leave are marked absent automatically. Staff attendance this year so far: ${yearRows.length ? pct((present / yearRows.length) * 100) : '—'} present.`));
  mount(ctx.main, h('div', { class: 'stack' }, parts));
  drawCounts();
}
