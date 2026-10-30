// Scheduling (admin): terms and periods, subjects per grade, rooms.
import { db, must, h, mount, param, go, getCurrentYear, getTerms, getPeriods, getGrades, getSubjects, getStaff, getClasses, getSettings,
  isoDate, fmtDMY, btn, card, table, tag, pageHead, emptyState, input, select, field, checkbox, modal, toast, busy, confirmBox, tabs } from '../lib.js';

const termTabs = (view) => tabs([['terms', 'Terms and periods'], ['subjects', 'Subjects']], view, null, { hrefFor: (k) => 'AdminTerms.html' + (k === 'subjects' ? '?view=subjects' : '') });

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

// The term that covers today; outside every term, the latest one with a
// published timetable, else the last one.
export async function currentTerm(year) {
  const terms = await getTerms(year.id);
  const today = isoDate();
  const now = terms.find((t) => t.starts_on <= today && today <= t.ends_on);
  if (now || !terms.length) return now || null;
  const published = new Set(must(await db.from('timetable_status').select('term_id').eq('published', true).in('term_id', terms.map((t) => t.id))).map((r) => r.term_id));
  return [...terms].reverse().find((t) => published.has(t.id)) || terms[terms.length - 1];
}

export function grid({ periods, days, cellFor }) {
  return h('div', { class: 'tbx', style: 'overflow-x: auto' }, h('table', { class: 'tg', style: 'min-width: 760px' },
    h('thead', {}, h('tr', {}, h('th', {}), days.map((d) => h('th', {}, d)))),
    h('tbody', {}, periods.map((p) => (p.kind === 'break'
      ? h('tr', { class: 'lunch' }, h('th', {}, p.name), h('td', { colspan: days.length }, `${p.name} · ${String(p.starts_at).slice(0, 5)}`))
      : h('tr', {}, h('th', {}, p.name, h('small', {}, String(p.starts_at || '').slice(0, 5))), days.map((_, i) => h('td', {}, cellFor(i + 1, p)))))))));
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
    termTabs('terms'),
    card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, `Academic Year ${year.name}`,
      btn('Add Term', { small: true, icon: 'plus', onclick: () => { termRows.push({ name: `Term ${termRows.length + 1}` }); drawTerms(); } })), termBox),
    card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, 'Daily periods',
      btn('Add Period', { small: true, icon: 'plus', onclick: () => { periodRows.push({ name: `Period ${periodRows.filter((p) => p.kind !== 'break').length + 1}`, kind: 'class' }); drawPeriods(); } })), periodBox)));
}

// Subjects: which grades offer each subject this year, and which are mandatory.
// Offering a subject to a grade creates its class, which lands in the
// timetable's Unplaced subjects; mandatory classes enrol the whole grade (009).
async function subjectsPage(ctx) {
  const year = await getCurrentYear();
  const [grades, subjects, classes] = await Promise.all([
    getGrades(),
    db.from('subjects').select('*').order('position').then(must),
    db.from('classes').select('id, grade_id, subject_id, mandatory').eq('year_id', year.id).then(must),
  ]);
  const classFor = (s, g) => classes.find((c) => c.subject_id === s.id && c.grade_id === g.id);

  const edit = (s = {}) => {
    const name = input({ value: s.name || '', placeholder: 'e.g. Computer Science' });
    const short = input({ value: s.short_name || '', placeholder: 'e.g. CS' });
    const type = select([['academic', 'Academic'], ['extra', 'Extracurricular']], s.id && !s.academic ? 'extra' : 'academic');
    const rows = grades.map((g) => {
      const c = s.id ? classFor(s, g) : null;
      const offered = h('input', { type: 'checkbox', checked: !!c, 'aria-label': `Offer in ${g.name}` });
      const mandatory = h('input', { type: 'checkbox', checked: !!c?.mandatory, disabled: !c, 'aria-label': `Mandatory in ${g.name}` });
      offered.addEventListener('change', () => { mandatory.disabled = !offered.checked; if (!offered.checked) mandatory.checked = false; syncAll(); });
      return { g, c, offered, mandatory };
    });
    const all = h('input', { type: 'checkbox' });
    const syncAll = () => { all.checked = rows.every((r) => r.offered.checked); };
    all.addEventListener('change', () => rows.forEach((r) => { r.offered.checked = all.checked; r.mandatory.disabled = !all.checked; if (!all.checked) r.mandatory.checked = false; }));
    syncAll();
    const gradeTable = h('div', { class: 'tbx' }, h('table', { class: 'tt' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Grade'), h('th', {}, 'Offered'), h('th', {}, 'Mandatory'))),
      h('tbody', {},
        h('tr', {}, h('th', { scope: 'row' }, 'All grades'), h('td', {}, all), h('td', {})),
        rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.g.name), h('td', {}, r.offered), h('td', {}, r.mandatory))))));

    modal(s.id ? `Edit ${s.name}` : 'Add subject', [
      h('div', { class: 'grid2' }, field('Subject', name), field('Short name', short), field('Type', type, { style: 'grid-column: span 2' })),
      h('p', { class: 'muted small', style: 'margin: 0' }, 'Extracurricular subjects use their own grading template when adding tests.'),
      gradeTable,
      h('p', { class: 'muted small', style: 'margin: 0' }, 'New grades go to Unplaced subjects on the timetable. Students in a mandatory grade are enrolled automatically, including new admissions.'),
    ], {
      submit: s.id ? 'Save' : 'Add Subject',
      onSubmit: async () => {
        const nm = name.value.trim();
        if (!nm) throw new Error('Name the subject.');
        if (subjects.some((x) => x.id !== s.id && x.name.toLowerCase() === nm.toLowerCase())) throw new Error(`${nm} already exists.`);
        const removing = rows.filter((r) => r.c && !r.offered.checked);
        if (removing.length) {
          const used = must(await db.from('evaluations').select('class_id').in('class_id', removing.map((r) => r.c.id)));
          const blocked = removing.filter((r) => used.some((e) => e.class_id === r.c.id));
          if (blocked.length) throw new Error(`${blocked.map((r) => r.g.name).join(', ')} already ${blocked.length === 1 ? 'has' : 'have'} tests for this subject, so ${blocked.length === 1 ? 'it' : 'they'} can’t be removed.`);
          if (!(await confirmBox(`Remove ${nm} from ${removing.map((r) => r.g.name).join(', ')}?`, 'Its class, roster and timetable periods for this year are removed.', 'Remove'))) throw new Error('Nothing saved. Tick the grade again or confirm the removal.');
        }
        const row = { name: nm, short_name: short.value.trim() || nm.slice(0, 4), academic: type.value === 'academic' };
        const saved = s.id ? must(await db.from('subjects').update(row).eq('id', s.id).select().single())
          : must(await db.from('subjects').insert({ ...row, position: Math.max(0, ...subjects.map((x) => x.position || 0)) + 1 }).select().single());
        const adding = rows.filter((r) => !r.c && r.offered.checked);
        if (adding.length) must(await db.from('classes').insert(adding.map((r) => ({ year_id: year.id, grade_id: r.g.id, subject_id: saved.id, mandatory: r.mandatory.checked }))));
        for (const r of rows.filter((x) => x.c && x.offered.checked && x.c.mandatory !== x.mandatory.checked)) {
          must(await db.from('classes').update({ mandatory: r.mandatory.checked }).eq('id', r.c.id));
        }
        if (removing.length) {
          const termIds = (await getTerms(year.id)).map((t) => t.id);
          const gradeIds = removing.map((r) => r.g.id);
          if (termIds.length) must(await db.from('timetable_slots').delete().eq('subject_id', saved.id).in('grade_id', gradeIds).in('term_id', termIds));
          must(await db.from('timetable_plan').delete().eq('year_id', year.id).eq('subject_id', saved.id).in('grade_id', gradeIds));
          must(await db.from('classes').delete().in('id', removing.map((r) => r.c.id)));
        }
        toast(s.id ? 'Subject saved' : `${nm} added${adding.length ? ' · it’s waiting in Unplaced subjects' : ''}`);
        subjectsPage(ctx);
      },
    });
  };

  const gradesCell = (s) => {
    const on = grades.filter((g) => classFor(s, g));
    if (!on.length) return h('span', { class: 'muted' }, 'No grades yet');
    const req = on.filter((g) => classFor(s, g).mandatory);
    const label = (list) => (list.length === grades.length ? 'All grades' : list.map((g) => g.name.replace('Grade ', '')).join(', '));
    return h('span', { class: 'row', style: 'gap: 6px; flex-wrap: wrap' },
      h('span', {}, on.length === grades.length ? 'All grades' : (on.length === 1 ? 'Grade ' : 'Grades ') + label(on)),
      req.length ? tag(req.length === on.length ? 'Mandatory' : `Mandatory: ${label(req)}`, 'ok') : tag('Optional'));
  };
  const addBtn = () => btn('Add Subject', { primary: true, icon: 'plus', onclick: () => edit() });
  const list = (title, rows) => card(h('span', {}, title + ' ', h('span', { class: 'count tag' }, rows.length)),
    table([
      { label: 'Subject', th: true, render: (s) => s.name },
      { label: 'Short', render: (s) => s.short_name || '—' },
      { label: `Grades in ${year.name}`, render: gradesCell },
      { label: '', cls: 'r', render: (s) => btn('Edit', { small: true, onclick: () => edit(s) }) },
    ], rows, { empty: 'None yet.' }));

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead('Terms and Periods', 'Add subjects, choose which grades take them and which are mandatory.', [addBtn()]),
    termTabs('subjects'),
    list('Academic', subjects.filter((s) => s.academic)),
    list('Extracurricular', subjects.filter((s) => !s.academic))));
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
  if (ctx.page === 'AdminRooms') return roomsPage(ctx);
  return param('view') === 'subjects' ? subjectsPage(ctx) : termsPage(ctx);
}
