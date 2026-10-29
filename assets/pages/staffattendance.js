// Staff Attendance (admin): a daily register for teachers and admins, and paid leave balances.
import { db, must, h, mount, param, go, getCurrentYear, isoDate, fmtDate, pct, btn, tabs, tag, pageHead, emptyState, input, select,
  toast, busy } from '../lib.js';

const CODES = [['P', 'P', 'Present'], ['A', 'A', 'Absent (unpaid)'], ['L', 'L', 'Late'], ['Leave', 'PL', 'Paid leave']];

export async function render(ctx) {
  const view = param('view') === 'leave' ? 'leave' : 'register';
  const role = param('role') || '';
  const date = param('date') || isoDate();
  const year = await getCurrentYear();
  let staff = must(await db.from('staff').select('id, name, role, paid_leave_days').eq('status', 'active').order('name'));
  if (role) staff = staff.filter((s) => s.role === role);
  const ids = staff.map((s) => s.id);
  const yearRows = ids.length ? must(await db.from('staff_attendance').select('staff_id, on_date, status, remark').in('staff_id', ids).gte('on_date', year.starts_on).lte('on_date', year.ends_on)) : [];
  const count = (id, st) => yearRows.filter((r) => r.staff_id === id && r.status === st).length;
  const url = (q) => 'AdminStaffAttendance.html?' + new URLSearchParams({ view, role, date, ...q });

  const roleSel = select([['', 'All staff'], ['teacher', 'Teachers'], ['admin', 'Admins']], role, { style: 'width: auto', onchange: (e) => go(url({ role: e.target.value })) });
  const parts = [
    pageHead('Staff Attendance', 'Record daily attendance for teachers and admins, and track paid leave.'),
    tabs([['register', 'Daily register'], ['leave', 'Paid leave']], view, null, { hrefFor: (k) => url({ view: k }) }),
  ];

  if (!staff.length) {
    mount(ctx.main, h('div', { class: 'stack' }, parts, h('div', { class: 'row' }, roleSel), emptyState('No active staff', 'Active teachers and admins appear here.', null, 'users')));
    return;
  }

  if (view === 'leave') {
    const allowance = new Map(staff.map((s) => [s.id, input({ type: 'number', min: 0, value: s.paid_leave_days, style: 'width: 80px; height: 34px; text-align: right', 'aria-label': `Paid leave allowance for ${s.name}` })]));
    const save = btn('Save Allowances', { primary: true, onclick: () => busy(save, async () => {
      for (const s of staff) {
        const v = Number(allowance.get(s.id).value);
        if (!Number.isInteger(v) || v < 0) throw new Error(`Allowance for ${s.name} must be a whole number of days.`);
        if (v !== s.paid_leave_days) must(await db.from('staff').update({ paid_leave_days: v }).eq('id', s.id));
      }
      go(url({}));
    }, 'Saved').catch(() => {}) });
    parts.push(h('div', { class: 'spread', style: 'align-items: center' }, h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Show'), roleSel,
      h('span', { class: 'muted small' }, `Academic Year ${year.name}`)), save));
    parts.push(h('div', { class: 'tbx' }, h('table', { class: 'tt' },
      h('thead', {}, h('tr', {}, ['Name', 'Role', 'Allowance (days)', 'Paid leave taken', 'Remaining', 'Unpaid absences', 'Late'].map((l, i) => h('th', { class: i > 1 ? 'num' : '' }, l)))),
      h('tbody', {}, staff.map((s) => {
        const used = count(s.id, 'Leave');
        const left = s.paid_leave_days - used;
        return h('tr', {},
          h('th', { scope: 'row' }, h('a', { href: `AdminStaffProfile.html?id=${s.id}` }, s.name)),
          h('td', {}, s.role === 'admin' ? 'Admin' : 'Teacher'),
          h('td', { class: 'num' }, allowance.get(s.id)),
          h('td', { class: 'num' }, used),
          h('td', { class: 'num' }, left < 0 ? tag(`${left} over`, 'bad') : left === 0 ? tag('0', 'warn') : left),
          h('td', { class: 'num' }, count(s.id, 'A')),
          h('td', { class: 'num' }, count(s.id, 'L')));
      })))));
    parts.push(h('p', { class: 'muted small', style: 'margin: 0' }, 'Paid leave taken counts days marked PL in the daily register this academic year. Days marked A are unpaid absences.'));
    mount(ctx.main, h('div', { class: 'stack' }, parts));
    return;
  }

  // Daily register.
  const today = yearRows.filter((r) => r.on_date === date);
  const extra = date < year.starts_on || date > year.ends_on
    ? must(await db.from('staff_attendance').select('staff_id, on_date, status, remark').in('staff_id', ids).eq('on_date', date)) : [];
  const state = new Map(staff.map((s) => { const r = [...today, ...extra].find((x) => x.staff_id === s.id); return [s.id, { status: r?.status || '', remark: r?.remark || '' }]; }));
  const counts = h('div', { class: 'row small' });
  const drawCounts = () => {
    const v = [...state.values()];
    mount(counts, [['P', 'Present', 'ok'], ['A', 'Absent', 'bad'], ['L', 'Late', 'warn'], ['Leave', 'Paid leave', ''], ['', 'Not marked', '']]
      .map(([k, l, c]) => h('span', { class: 'tag' + (c ? ' ' + c : '') }, `${v.filter((x) => x.status === k).length} ${l}`)));
  };
  const body = h('tbody', {}, staff.map((s) => {
    const st = state.get(s.id);
    const left = s.paid_leave_days - count(s.id, 'Leave');
    return h('tr', {},
      h('th', { scope: 'row' }, h('a', { href: `AdminStaffProfile.html?id=${s.id}` }, s.name)),
      h('td', {}, s.role === 'admin' ? 'Admin' : 'Teacher'),
      h('td', {}, h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `${s.name} attendance` }, CODES.map(([v, short, long]) => h('label', { title: long },
        h('input', { type: 'radio', name: 'st-' + s.id, value: v, checked: st.status === v, 'aria-label': long, onchange: () => { st.status = v; drawCounts(); } }),
        h('span', {}, short))))),
      h('td', {}, input({ value: st.remark, placeholder: 'Remark', style: 'height: 34px; min-width: 180px', 'aria-label': `Remark for ${s.name}`, oninput: (e) => { st.remark = e.target.value; } })),
      h('td', { class: 'num' }, `${left} of ${s.paid_leave_days}`));
  }));
  const markAll = btn('Mark All Present', { onclick: () => {
    state.forEach((st) => { if (!st.status) st.status = 'P'; });
    body.querySelectorAll('.seg').forEach((seg) => { if (!seg.querySelector('input:checked')) seg.querySelector('input[value="P"]').checked = true; });
    drawCounts();
  } });
  const save = btn('Save Attendance', { primary: true, onclick: () => busy(save, async () => {
    const rows = staff.filter((s) => state.get(s.id).status).map((s) => ({ staff_id: s.id, on_date: date, status: state.get(s.id).status, remark: state.get(s.id).remark }));
    if (!rows.length) throw new Error('Mark at least one person first.');
    must(await db.from('staff_attendance').upsert(rows));
    toast(`Staff attendance saved for ${fmtDate(date)}`);
    go(url({}));
  }).catch(() => {}) });

  const marked = yearRows.filter((r) => r.status !== 'A').length;
  parts.push(h('div', { class: 'spread', style: 'align-items: center' },
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Date'), input({ type: 'date', value: date, style: 'width: auto', onchange: (e) => go(url({ date: e.target.value })) }),
      h('span', { class: 'muted small' }, 'Show'), roleSel, counts),
    h('div', { class: 'row' }, markAll, save)));
  parts.push(h('div', { class: 'tbx' }, h('table', { class: 'tt' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Role'), h('th', {}, 'Status'), h('th', {}, 'Remark'), h('th', { class: 'num' }, 'Paid leave left'))),
    body)));
  parts.push(h('p', { class: 'muted small', style: 'margin: 0' }, `P = Present · A = Absent (unpaid) · L = Late · PL = Paid leave. Staff attendance this year so far: ${yearRows.length ? pct((marked / yearRows.length) * 100) : '—'} present.`));
  mount(ctx.main, h('div', { class: 'stack' }, parts));
  drawCounts();
}
