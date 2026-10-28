// Scheduling (admin): timetable builder, terms and periods, rooms.
import { db, must, h, mount, param, go, getCurrentYear, getTerms, getPeriods, getGrades, getSubjects, getStaff, getClasses, getSettings,
  isoDate, fmtDMY, btn, card, table, tag, pageHead, emptyState, input, select, field, modal, toast, busy, confirmBox, tabs } from '../lib.js';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SLOT_SELECT = '*, grade:grade_levels(id, name), subject:subjects(id, name), teacher:staff(id, name), room:rooms(id, name)';

// Teachers or rooms booked in two places at once.
export async function findConflicts(termId) {
  let q = db.from('timetable_slots').select(SLOT_SELECT);
  if (termId) q = q.eq('term_id', termId);
  const slots = must(await q);
  const out = [];
  const group = (keyFn, kind, label) => {
    const m = new Map();
    slots.forEach((s) => { const k = keyFn(s); if (!k) return; (m.get(k) || m.set(k, []).get(k)).push(s); });
    m.forEach((list) => { if (list.length > 1) out.push({ kind, label: label(list[0]), slots: list }); });
  };
  group((s) => s.teacher_id && `${s.term_id}:${s.day}:${s.period_id}:${s.teacher_id}`, 'teacher', (s) => s.teacher?.name);
  group((s) => s.room_id && `${s.term_id}:${s.day}:${s.period_id}:${s.room_id}`, 'room', (s) => s.room?.name);
  return out;
}

// The term that covers today, else the last one.
export async function currentTerm(year) {
  const terms = await getTerms(year.id);
  const today = isoDate();
  return terms.find((t) => t.starts_on <= today && today <= t.ends_on) || terms[terms.length - 1] || null;
}

export function grid({ periods, days, cellFor }) {
  return h('div', { class: 'tbx', style: 'overflow-x: auto' }, h('table', { class: 'tg', style: 'min-width: 760px' },
    h('thead', {}, h('tr', {}, h('th', {}), days.map((d) => h('th', {}, d)))),
    h('tbody', {}, periods.map((p) => (p.kind === 'break'
      ? h('tr', { class: 'lunch' }, h('th', {}, p.name), h('td', { colspan: days.length }, `${p.name} · ${String(p.starts_at).slice(0, 5)}`))
      : h('tr', {}, h('th', {}, p.name, h('small', {}, String(p.starts_at || '').slice(0, 5))), days.map((_, i) => h('td', {}, cellFor(i + 1, p)))))))));
}

async function timetable(ctx) {
  const year = await getCurrentYear();
  const [terms, periods, grades, subjects, staff, classes, settings, rooms] = await Promise.all([
    getTerms(year.id), getPeriods(), getGrades(), getSubjects(), getStaff(), getClasses(year.id), getSettings(),
    db.from('rooms').select('*').order('name').then(must)]);
  const def = await currentTerm(year);
  if (!terms.length) { mount(ctx.main, emptyState('No terms set up', 'Add the academic year’s terms before building the timetable.', btn('Terms and Periods', { href: 'AdminTerms.html' }), 'cal')); return; }
  const termId = Number(param('term')) || def.id;
  const by = param('by') || 'class';
  const target = param('id') || (by === 'class' ? String(grades[0].id) : by === 'teacher' ? staff.find((s) => s.role === 'teacher')?.id : String(rooms[0]?.id || ''));
  const days = DAYS.slice(0, settings.week_days === 'Mon–Fri' ? 5 : 6);

  let slots = must(await db.from('timetable_slots').select(SLOT_SELECT).eq('term_id', termId));
  const status = must(await db.from('timetable_status').select('*').eq('term_id', termId).maybeSingle());
  const conflicts = await findConflicts(termId);
  const conflictIds = new Set(conflicts.flatMap((c) => c.slots.map((s) => s.id)));
  const pending = new Map(); // key day:period -> { subject_id, teacher_id, room_id } | null (clear)
  const go2 = (q) => go('AdminTimetable.html?' + new URLSearchParams({ by, id: target, term: termId, ...q }));

  const bySel = select([['class', 'Class'], ['teacher', 'Teacher'], ['room', 'Room']], by, { style: 'width: auto', onchange: (e) => go('AdminTimetable.html?' + new URLSearchParams({ by: e.target.value, term: termId })) });
  const targetSel = by === 'class' ? select(grades.map((g) => [g.id, g.name]), target)
    : by === 'teacher' ? select(staff.filter((s) => s.role === 'teacher').map((s) => [s.id, s.name]), target)
    : select(rooms.map((r) => [r.id, r.name]), target);
  targetSel.style.width = 'auto';
  targetSel.addEventListener('change', (e) => go2({ id: e.target.value }));
  const termSel = select(terms.map((t) => [t.id, t.name]), termId, { style: 'width: auto', onchange: (e) => go2({ term: e.target.value }) });

  const unsaved = h('span', {});
  const markDirty = () => mount(unsaved, pending.size ? tag(`${pending.size} unsaved change${pending.size > 1 ? 's' : ''}`, 'warn') : null);
  const gridBox = h('div', {});

  const visible = () => slots.filter((s) => (by === 'class' ? s.grade_id === +target : by === 'teacher' ? s.teacher_id === target : s.room_id === +target));
  const draw = () => {
    const at = (day, p) => visible().find((s) => s.day === day && s.period_id === p.id);
    mount(gridBox, grid({ periods, days, cellFor: (day, p) => {
      const key = `${day}:${p.id}`;
      const change = pending.get(key);
      const s = pending.has(key) ? (change && { ...change, subject: subjects.find((x) => x.id === +change.subject_id), teacher: staff.find((x) => x.id === change.teacher_id), room: rooms.find((x) => x.id === +change.room_id) }) : at(day, p);
      const label = s ? [s.subject?.name, h('small', {}, by === 'class' ? `${s.teacher?.name || 'No teacher'} · ${s.room?.name || 'No room'}` : `${s.grade?.name || ''} · ${by === 'teacher' ? s.room?.name || 'No room' : s.teacher?.name || ''}`)] : 'Free';
      const cls = 'slot' + (!s ? ' empty-slot' : '') + (s && conflictIds.has(s.id) && !pending.has(key) ? ' conflict' : '') + (pending.has(key) ? ' me' : '');
      if (by !== 'class') return h('div', { class: cls }, label);
      return h('button', { type: 'button', class: cls, onclick: () => editSlot(day, p, s) }, label, s && conflictIds.has(s.id) && !pending.has(key) ? h('small', {}, '⚠ Double-booked') : null);
    } }));
  };
  const editSlot = (day, p, s) => {
    const grade = grades.find((g) => g.id === +target);
    const subj = select([['', 'Free period'], ...subjects.map((x) => [x.id, x.name])], s?.subject_id ?? s?.subject?.id ?? '');
    const teach = select([['', 'No teacher'], ...staff.filter((x) => x.role === 'teacher').map((x) => [x.id, x.name])], s?.teacher_id ?? s?.teacher?.id ?? '');
    const room = select([['', 'No room'], ...rooms.map((r) => [r.id, r.name])], s?.room_id ?? s?.room?.id ?? '');
    subj.addEventListener('change', () => { const c = classes.find((x) => x.grade_id === grade.id && x.subject_id === +subj.value); if (c?.teacher_id) teach.value = c.teacher_id; });
    modal(`${grade.name} · ${DAYS[day - 1]} · ${p.name}`, [field('Subject', subj), field('Teacher', teach), field('Room', room)], {
      submit: 'Apply',
      onSubmit: () => {
        pending.set(`${day}:${p.id}`, subj.value ? { subject_id: +subj.value, teacher_id: teach.value || null, room_id: room.value ? +room.value : null } : null);
        markDirty(); draw();
      },
    });
  };

  const publish = btn('Publish Timetable', { primary: true, onclick: () => busy(publish, async () => {
    for (const [key, val] of pending) {
      const [day, period_id] = key.split(':').map(Number);
      const match = { term_id: termId, grade_id: +target, day, period_id };
      if (val) must(await db.from('timetable_slots').upsert({ ...match, ...val }, { onConflict: 'term_id,grade_id,day,period_id' }));
      else must(await db.from('timetable_slots').delete().match(match));
    }
    must(await db.from('timetable_status').upsert({ term_id: termId, published: true, published_at: new Date().toISOString() }));
    toast('Timetable published');
    go2({});
  }).catch(() => {}) });
  const discard = btn('Discard Changes', { onclick: () => { pending.clear(); markDirty(); draw(); } });

  const placed = new Set(slots.filter((s) => s.grade_id === +target).map((s) => s.subject_id));
  const unplaced = by === 'class' ? classes.filter((c) => c.grade_id === +target && !placed.has(c.subject_id)) : [];

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead('Timetable', 'Build the school timetable. Click a slot to set its subject, teacher and room; publishing updates every teacher’s My Schedule.', [discard, publish]),
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'View by'), bySel, targetSel, h('span', { class: 'muted small' }, 'Term'), termSel,
      status?.published ? tag(`Published ${fmtDMY(status.published_at)}`, 'ok') : tag('Draft · not published', 'warn'), unsaved),
    gridBox,
    h('div', { class: 'cols' },
      card(h('span', {}, 'Conflicts ', h('span', { class: 'count tag' }, conflicts.length)), conflicts.length
        ? conflicts.map((c) => h('div', { class: 'item' }, h('div', { class: 'it' }, h('b', {}, `${c.label} is double-booked`),
          h('span', {}, `${DAYS[c.slots[0].day - 1]}, ${periods.find((p) => p.id === c.slots[0].period_id)?.name} · ${c.slots.map((s) => s.grade?.name).join(' and ')}`)),
          btn('Show', { small: true, href: `AdminTimetable.html?by=class&id=${c.slots[0].grade_id}&term=${termId}` })))
        : h('p', { class: 'muted small', style: 'margin: 0' }, 'No double bookings.')),
      by === 'class' ? card('Unplaced subjects', unplaced.length
        ? h('div', { class: 'row' }, unplaced.map((c) => tag(c.subject.name, 'warn')), h('span', { class: 'muted small' }, 'Click an empty slot to place them.'))
        : h('p', { class: 'muted small', style: 'margin: 0' }, 'Every class for this grade has at least one period.')) : null)));
  draw();
}

async function termsPage(ctx) {
  const year = await getCurrentYear();
  const terms = must(await db.from('terms').select('*').eq('year_id', year.id).order('position'));
  const periods = must(await db.from('periods').select('*').order('position'));
  const termRows = terms.map((t) => ({ ...t }));
  const periodRows = periods.map((p) => ({ ...p }));
  const removedTerms = [], removedPeriods = [];
  const termBox = h('div', {}), periodBox = h('div', {});

  const cellIn = (row, key, type = 'text') => input({ type, value: row[key] ? String(row[key]).slice(0, type === 'time' ? 5 : undefined) : '', style: 'height: 34px', oninput: (e) => { row[key] = e.target.value || null; } });
  const drawTerms = () => mount(termBox, table([
    { label: 'Term', render: (r) => cellIn(r, 'name') }, { label: 'Starts', render: (r) => cellIn(r, 'starts_on', 'date') },
    { label: 'Ends', render: (r) => cellIn(r, 'ends_on', 'date') }, { label: 'Main exam', render: (r) => cellIn(r, 'main_exam') },
    { label: '', render: (r) => btn('Remove', { small: true, danger: true, onclick: () => { termRows.splice(termRows.indexOf(r), 1); if (r.id) removedTerms.push(r.id); drawTerms(); } }) },
  ], termRows, { empty: 'No terms yet.' }));
  const drawPeriods = () => mount(periodBox, table([
    { label: 'Period', render: (r) => cellIn(r, 'name') }, { label: 'Starts', render: (r) => cellIn(r, 'starts_at', 'time') },
    { label: 'Ends', render: (r) => cellIn(r, 'ends_at', 'time') },
    { label: 'Type', render: (r) => select([['class', 'Class'], ['break', 'Break']], r.kind, { style: 'height: 34px', onchange: (e) => { r.kind = e.target.value; } }) },
    { label: '', render: (r) => btn('Remove', { small: true, danger: true, onclick: () => { periodRows.splice(periodRows.indexOf(r), 1); if (r.id) removedPeriods.push(r.id); drawPeriods(); } }) },
  ], periodRows, { empty: 'No periods yet.' }));
  drawTerms(); drawPeriods();

  const save = btn('Save Changes', { primary: true, onclick: () => busy(save, async () => {
    if (removedTerms.length) must(await db.from('terms').delete().in('id', removedTerms));
    if (removedPeriods.length) must(await db.from('periods').delete().in('id', removedPeriods));
    for (const [i, t] of termRows.entries()) {
      if (!t.name) throw new Error('Every term needs a name.');
      const row = { year_id: year.id, name: t.name, starts_on: t.starts_on, ends_on: t.ends_on, main_exam: t.main_exam, position: i + 1 };
      must(t.id ? await db.from('terms').update(row).eq('id', t.id) : await db.from('terms').insert(row));
    }
    for (const [i, p] of periodRows.entries()) {
      if (!p.name) throw new Error('Every period needs a name.');
      const row = { name: p.name, starts_at: p.starts_at, ends_at: p.ends_at, kind: p.kind || 'class', position: i + 1 };
      must(p.id ? await db.from('periods').update(row).eq('id', p.id) : await db.from('periods').insert(row));
    }
    toast('Saved'); go('AdminTerms.html');
  }).catch(() => {}) });

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead('Terms and Periods', 'Set the academic year’s terms and the daily bell schedule used by the timetable.', [save]),
    card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, `Academic Year ${year.name}`,
      btn('Add Term', { small: true, icon: 'plus', onclick: () => { termRows.push({ name: `Term ${termRows.length + 1}` }); drawTerms(); } })), termBox),
    card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, 'Daily periods',
      btn('Add Period', { small: true, icon: 'plus', onclick: () => { periodRows.push({ name: `Period ${periodRows.filter((p) => p.kind !== 'break').length + 1}`, kind: 'class' }); drawPeriods(); } })), periodBox)));
}

async function roomsPage(ctx) {
  const kind = param('type') || '';
  let rooms = must(await db.from('rooms').select('*').order('name'));
  const total = rooms.length;
  if (kind) rooms = rooms.filter((r) => r.kind === kind);
  const edit = (r = {}) => {
    const name = input({ value: r.name || '' });
    const type = select(['Classroom', 'Laboratory', 'Library', 'Outdoor'], r.kind || 'Classroom');
    const cap = input({ type: 'number', min: 0, value: r.capacity ?? '' });
    const used = input({ value: r.used_by || '', placeholder: 'e.g. Grade 6' });
    modal(r.id ? `Edit ${r.name}` : 'Add room', h('div', { class: 'grid2' }, field('Room', name), field('Type', type), field('Capacity', cap), field('Used by', used)), {
      onSubmit: async () => {
        if (!name.value.trim()) throw new Error('Name the room.');
        const row = { name: name.value.trim(), kind: type.value, capacity: cap.value === '' ? null : +cap.value, used_by: used.value };
        must(r.id ? await db.from('rooms').update(row).eq('id', r.id) : await db.from('rooms').insert(row));
        toast('Saved'); roomsPage(ctx);
      },
    });
  };
  const typeSel = select([['', 'All types'], 'Classroom', 'Laboratory', 'Library', 'Outdoor'], kind, { style: 'width: auto', onchange: (e) => go('AdminRooms.html' + (e.target.value ? '?type=' + e.target.value : '')) });
  mount(ctx.main, h('div', { class: 'stack' },
    pageHead('Rooms', 'Rooms used by the timetable builder to catch double bookings.', [btn('Add Room', { primary: true, icon: 'plus', onclick: () => edit() })]),
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Type'), typeSel),
    total ? table([
      { label: 'Room', th: true, key: 'name' }, { label: 'Type', key: 'kind' }, { label: 'Capacity', cls: 'num', render: (r) => r.capacity ?? '—' },
      { label: 'Used by', render: (r) => r.used_by || '—' },
      { label: '', render: (r) => h('span', { class: 'row' }, btn('Edit', { small: true, onclick: () => edit(r) }), btn('Delete', { small: true, danger: true, onclick: async () => {
        if (!(await confirmBox(`Delete ${r.name}?`, 'Timetable slots in this room will show no room.', 'Delete'))) return;
        must(await db.from('rooms').delete().eq('id', r.id)); roomsPage(ctx);
      } })) },
    ], rooms, { empty: 'No rooms of this type.' })
      : emptyState('No rooms added', 'Add rooms so the timetable can check for double bookings.', btn('Add Room', { primary: true, icon: 'plus', onclick: () => edit() }))));
}

export function render(ctx) {
  if (ctx.page === 'AdminTerms') return termsPage(ctx);
  if (ctx.page === 'AdminRooms') return roomsPage(ctx);
  return timetable(ctx);
}
