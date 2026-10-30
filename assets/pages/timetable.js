// Timetable (admin): the whole school's week at a glance, filterable by grade,
// teacher or room. Edit mode drags subjects between periods and from the
// unplaced tray, flags clashes, and publishes to every teacher's My Schedule.
import { db, must, h, mount, param, go, getCurrentYear, getTerms, getPeriods, getGrades, getSubjects, getStaff, getSettings,
  fmtDMY, btn, card, tag, pageHead, emptyState, input, select, field, modal, toast, busy, confirmBox } from '../lib.js';
import { DAYS, currentTerm } from './scheduling.js';

const short = (name) => (name || '').replace(/^(Ms|Mr|Mrs|Dr)\.?\s+/i, '');
const gradeShort = (g) => (g ? g.name.replace('Grade ', 'G') : '?');

export async function render(ctx) {
  const year = await getCurrentYear();
  const [terms, periods, grades, subjects, staff, settings, rooms] = await Promise.all([
    getTerms(year.id), getPeriods(), getGrades(), getSubjects(), getStaff(), getSettings(),
    db.from('rooms').select('*').order('name').then(must)]);
  if (!terms.length) { mount(ctx.main, emptyState('No terms set up', 'Add the academic year’s terms before building the timetable.', btn('Terms and Periods', { href: 'AdminTerms.html' }), 'cal')); return; }

  const def = await currentTerm(year);
  const termId = Number(param('term')) || def.id;
  const by = ['grade', 'teacher', 'room'].includes(param('by')) ? param('by') : 'school';
  const teachers = staff.filter((s) => s.role === 'teacher');
  const target = by === 'school' ? null : param('id') || (by === 'grade' ? String(grades[0].id) : by === 'teacher' ? teachers[0]?.id : String(rooms[0]?.id || ''));
  const editing = param('edit') === '1';
  const days = DAYS.slice(0, settings.week_days === 'Mon–Fri' ? 5 : 6);
  const url = (q) => 'AdminTimetable.html?' + new URLSearchParams(Object.entries({ by: by === 'school' ? '' : by, id: target, term: termId, edit: editing ? '1' : '', ...q }).filter(([, v]) => v));

  const [original, status] = await Promise.all([
    db.from('timetable_slots').select('*').eq('term_id', termId).then(must),
    db.from('timetable_status').select('*').eq('term_id', termId).maybeSingle().then(must)]);
  let plan = must(await db.from('timetable_plan').select('*').eq('year_id', year.id));

  // Working copy; edits stay here until Save & Publish.
  let uid = 0;
  const working = original.map((s) => ({ ...s, uid: ++uid }));
  let dirty = false;
  let picked = null; // { kind: 'slot', uid } | { kind: 'plan', id } for click-to-place

  const gradeOf = (id) => grades.find((g) => g.id === id);
  const subjectOf = (id) => subjects.find((s) => s.id === id);
  const staffOf = (id) => staff.find((s) => s.id === id);
  const roomOf = (id) => rooms.find((r) => r.id === id);
  const colour = (slot) => (subjectOf(slot.subject_id)?.academic === false ? 'extra' : 'g' + (grades.findIndex((g) => g.id === slot.grade_id) % 7));
  const inView = (x) => by === 'school' || (by === 'grade' ? x.grade_id === +target : by === 'teacher' ? x.teacher_id === target : x.room_id === +target);

  // Clashes: a teacher, room or grade in two places in the same period.
  const conflicts = () => {
    const out = [], bad = new Set();
    const check = (kind, keyOf, label) => {
      const m = new Map();
      working.forEach((s) => { const k = keyOf(s); if (k) (m.get(k) || m.set(k, []).get(k)).push(s); });
      m.forEach((list) => { if (list.length > 1) { out.push({ kind, label: label(list[0]), list }); list.forEach((s) => bad.add(s.uid)); } });
    };
    check('teacher', (s) => s.teacher_id && `${s.day}:${s.period_id}:${s.teacher_id}`, (s) => `${staffOf(s.teacher_id)?.name || 'A teacher'} is double-booked`);
    check('room', (s) => s.room_id && `${s.day}:${s.period_id}:${s.room_id}`, (s) => `${roomOf(s.room_id)?.name || 'A room'} is double-booked`);
    check('grade', (s) => `${s.day}:${s.period_id}:${s.grade_id}`, (s) => `${gradeOf(s.grade_id)?.name} has two subjects at once`);
    return { out, bad };
  };
  const unplaced = () => plan.filter((p) => inView(p)).map((p) => ({ p, left: p.periods_per_week - working.filter((s) => s.grade_id === p.grade_id && s.subject_id === p.subject_id).length }))
    .filter((x) => x.left > 0).sort((a, b) => gradeOf(a.p.grade_id).position - gradeOf(b.p.grade_id).position || subjectOf(a.p.subject_id).position - subjectOf(b.p.subject_id).position);

  // Moving things around.
  const place = (what, day, periodId) => {
    if (what.kind === 'slot') {
      const s = working.find((x) => x.uid === what.uid);
      if (!s) return;
      s.day = day; s.period_id = periodId;
    } else {
      const p = plan.find((x) => x.id === what.id);
      if (!p) return;
      working.push({ uid: ++uid, term_id: termId, grade_id: p.grade_id, subject_id: p.subject_id, teacher_id: p.teacher_id, room_id: p.room_id, day, period_id: periodId });
    }
    dirty = true; picked = null; draw();
  };
  const unplace = (slotUid) => { const i = working.findIndex((x) => x.uid === slotUid); if (i >= 0) working.splice(i, 1); dirty = true; picked = null; draw(); };
  const dropTarget = (el, onDrop) => {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop-on'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop-on'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); el.classList.remove('drop-on');
      try { onDrop(JSON.parse(e.dataTransfer.getData('text/plain'))); } catch { /* not ours */ }
    });
  };
  const draggable = (el, what) => {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', JSON.stringify(what)); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  };

  const chipText = (s) => {
    const subj = subjectOf(s.subject_id);
    const name = subj?.short_name && by === 'school' ? subj.short_name : subj?.name;
    const top = by === 'grade' ? name : `${gradeShort(gradeOf(s.grade_id))} · ${name}`;
    const bottom = by === 'teacher' ? roomOf(s.room_id)?.name || 'No room' : short(staffOf(s.teacher_id)?.name) || 'No teacher';
    return [h('b', {}, top), h('small', {}, bottom)];
  };

  const gridBox = h('div', {});
  const trayBox = h('div', {});
  const conflictBox = h('div', {});
  const changes = h('span', {});

  function chip(s, bad) {
    const label = `${gradeOf(s.grade_id)?.name} ${subjectOf(s.subject_id)?.name}, ${staffOf(s.teacher_id)?.name || 'no teacher'}, ${roomOf(s.room_id)?.name || 'no room'}`;
    if (!editing) return h('div', { class: `tchip ${colour(s)}${bad ? ' clash' : ''}`, title: label }, chipText(s), bad ? h('span', { class: 'flag', 'aria-label': 'Clash' }, '!') : null);
    const el = h('div', { class: `tchip ${colour(s)}${bad ? ' clash' : ''}${picked?.kind === 'slot' && picked.uid === s.uid ? ' picked' : ''}`, title: label },
      h('button', { type: 'button', class: 'tchip-body', 'aria-label': `Move ${label}`, onclick: (e) => { e.stopPropagation(); picked = picked?.uid === s.uid ? null : { kind: 'slot', uid: s.uid }; draw(); } }, chipText(s)),
      h('button', { type: 'button', class: 'tchip-x', 'aria-label': `Unplace ${label}`, onclick: (e) => { e.stopPropagation(); unplace(s.uid); } }, '×'),
      bad ? h('span', { class: 'flag', 'aria-label': 'Clash' }, '!') : null);
    draggable(el, { kind: 'slot', uid: s.uid });
    return el;
  }

  function drawGrid(bad) {
    const visible = working.filter(inView);
    const table = h('table', { class: 'tg ttg' },
      h('thead', {}, h('tr', {}, h('th', {}), days.map((d) => h('th', {}, d)))),
      h('tbody', {}, periods.map((p) => (p.kind === 'break'
        ? h('tr', { class: 'lunch' }, h('th', {}, p.name), h('td', { colspan: days.length }, `${p.name} · ${String(p.starts_at).slice(0, 5)}`))
        : h('tr', {}, h('th', {}, p.name, h('small', {}, String(p.starts_at || '').slice(0, 5))),
          days.map((_, i) => {
            const day = i + 1;
            const items = visible.filter((s) => s.day === day && s.period_id === p.id)
              .sort((a, b) => gradeOf(a.grade_id).position - gradeOf(b.grade_id).position);
            const cell = h('td', { class: editing ? 'tcell edit' : 'tcell', 'aria-label': `${DAYS[i]} ${p.name}` }, h('div', { class: 'tstack' }, items.map((s) => chip(s, bad.has(s.uid)))));
            if (editing) {
              dropTarget(cell, (what) => place(what, day, p.id));
              cell.addEventListener('click', () => { if (picked) place(picked, day, p.id); });
              if (picked) cell.classList.add('can-drop');
            }
            return cell;
          }))))));
    mount(gridBox, h('div', { class: 'tbx', style: 'overflow-x: auto' }, table));
  }

  function editPlan(p) {
    const isNew = !p;
    p = p || {};
    const g = select(grades.map((x) => [x.id, x.name]), p.grade_id ?? (by === 'grade' ? target : grades[0].id), { disabled: !isNew });
    const subj = select(subjects.map((x) => [x.id, x.name + (x.academic ? '' : ' (extra-curricular)')]), p.subject_id ?? subjects[0].id, { disabled: !isNew });
    const t = select([['', 'No teacher'], ...teachers.map((x) => [x.id, x.name])], p.teacher_id ?? (by === 'teacher' ? target : ''));
    const r = select([['', 'No room'], ...rooms.map((x) => [x.id, x.name])], p.room_id ?? (by === 'room' ? target : ''));
    const n = input({ type: 'number', min: 0, max: 48, value: p.periods_per_week ?? 4 });
    modal(isNew ? 'Add subject to the timetable' : `${gradeOf(p.grade_id).name} · ${subjectOf(p.subject_id).name}`,
      [h('div', { class: 'grid2' }, field('Grade', g), field('Subject', subj), field('Teacher', t), field('Room', r), field('Periods per week', n)),
        h('p', { class: 'muted small', style: 'margin: 0' }, isNew ? 'It appears under Unplaced subjects until you drag its periods into the week.' : 'Teacher and room apply to periods you place from now on.')], {
      submit: isNew ? 'Add' : 'Save',
      onSubmit: async () => {
        const per = Number(n.value);
        if (!Number.isInteger(per) || per < 0) throw new Error('Periods per week must be a whole number.');
        const row = { year_id: year.id, grade_id: +g.value, subject_id: +subj.value, teacher_id: t.value || null, room_id: r.value ? +r.value : null, periods_per_week: per };
        const saved = must(await db.from('timetable_plan').upsert(row, { onConflict: 'year_id,grade_id,subject_id' }).select().single());
        plan = [...plan.filter((x) => x.id !== saved.id), saved];
        toast(isNew ? 'Subject added to Unplaced subjects' : 'Saved');
        draw();
      },
    });
  }

  function drawTray() {
    const items = unplaced();
    const total = items.reduce((a, x) => a + x.left, 0);
    if (!editing) {
      mount(trayBox, total ? h('div', { class: 'note' }, `${total} period${total === 1 ? '' : 's'} still to place${by === 'school' ? ' across the school' : ''}. `,
        h('a', { href: url({ edit: '1' }) }, 'Edit the timetable'), ' to drag them into the week.') : null);
      return;
    }
    const tray = h('div', { class: 'ttray', 'aria-label': 'Unplaced subjects' },
      items.length ? items.map(({ p, left }) => {
        const s = { grade_id: p.grade_id, subject_id: p.subject_id, teacher_id: p.teacher_id, room_id: p.room_id };
        const el = h('div', { class: `tchip ${colour(s)}${picked?.kind === 'plan' && picked.id === p.id ? ' picked' : ''}` },
          h('button', { type: 'button', class: 'tchip-body', 'aria-label': `Place ${gradeOf(p.grade_id).name} ${subjectOf(p.subject_id).name}`, onclick: () => { picked = picked?.id === p.id ? null : { kind: 'plan', id: p.id }; draw(); } },
            h('b', {}, `${gradeShort(gradeOf(p.grade_id))} · ${subjectOf(p.subject_id).name}`), h('small', {}, `${short(staffOf(p.teacher_id)?.name) || 'No teacher'} · ${left} left`)),
          h('button', { type: 'button', class: 'tchip-x', 'aria-label': 'Edit subject', title: 'Edit teacher, room or periods', onclick: () => editPlan(p) }, '✎'));
        draggable(el, { kind: 'plan', id: p.id });
        return el;
      }) : h('span', { class: 'muted small' }, 'Every subject has all its periods placed. Drag a period here to unplace it.'));
    dropTarget(tray, (what) => { if (what.kind === 'slot') unplace(what.uid); });
    mount(trayBox, card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' },
      h('span', {}, 'Unplaced subjects ', h('span', { class: 'count tag' }, total)),
      btn('Add subject', { small: true, icon: 'plus', onclick: () => editPlan(null) })),
    h('p', { class: 'muted small', style: 'margin: 0' }, 'Drag a subject into a period, or click it and then click a period. Drag a placed period back here to unplace it.'), tray));
  }

  function drawConflicts(list) {
    const periodName = (id) => periods.find((p) => p.id === id)?.name;
    mount(conflictBox, card(h('span', {}, 'Conflicts ', h('span', { class: 'count tag' + (list.length ? ' bad' : '') }, list.length)),
      list.length ? list.map((c) => h('div', { class: 'item' }, h('div', { class: 'it' }, h('b', {}, c.label),
        h('span', {}, `${DAYS[c.list[0].day - 1]}, ${periodName(c.list[0].period_id)} · ${c.list.map((s) => `${gradeOf(s.grade_id)?.name} ${subjectOf(s.subject_id)?.name}`).join(' and ')}`)),
        by !== 'grade' || +target !== c.list[0].grade_id ? btn('Show', { small: true, href: url({ by: 'grade', id: c.list[0].grade_id }) }) : null))
        : h('p', { class: 'muted small', style: 'margin: 0' }, 'No clashes: no teacher, room or grade is in two places at once.')));
  }

  function draw() {
    const { out, bad } = conflicts();
    drawGrid(bad);
    drawTray();
    drawConflicts(out.filter((c) => c.list.some(inView)));
    mount(changes, dirty ? tag('Unsaved changes', 'warn') : null);
  }

  // Controls.
  const bySel = select([['school', 'Whole school'], ['grade', 'Grade'], ['teacher', 'Teacher'], ['room', 'Room']], by, { style: 'width: auto', 'aria-label': 'View by',
    onchange: (e) => go('AdminTimetable.html?' + new URLSearchParams({ by: e.target.value, term: termId, ...(editing ? { edit: '1' } : {}) })) });
  const targetSel = by === 'school' ? null : select(by === 'grade' ? grades.map((g) => [g.id, g.name]) : by === 'teacher' ? teachers.map((s) => [s.id, s.name]) : rooms.map((r) => [r.id, r.name]),
    target, { style: 'width: auto', 'aria-label': by, onchange: (e) => go(url({ id: e.target.value })) });
  const termSel = select(terms.map((t) => [t.id, t.name]), termId, { style: 'width: auto', 'aria-label': 'Term', onchange: (e) => go(url({ term: e.target.value })) });

  const save = btn('Save & Publish', { primary: true, onclick: () => busy(save, async () => {
    const { out } = conflicts();
    if (out.some((c) => c.kind === 'grade')) throw new Error('A grade has two subjects in the same period. Move one before saving.');
    if (out.length && !(await confirmBox('Publish with clashes?', `${out.length} teacher or room clash${out.length === 1 ? '' : 'es'} still flagged. Publish anyway?`, 'Publish', false))) return;
    const same = (a, b) => ['grade_id', 'day', 'period_id', 'subject_id', 'teacher_id', 'room_id'].every((k) => a[k] === b[k]);
    const kept = new Map(working.filter((s) => s.id).map((s) => [s.id, s]));
    const remove = original.filter((o) => !kept.has(o.id) || !same(o, kept.get(o.id))).map((o) => o.id);
    const add = working.filter((s) => !s.id || remove.includes(s.id))
      .map(({ term_id, grade_id, day, period_id, subject_id, teacher_id, room_id }) => ({ term_id: term_id || termId, grade_id, day, period_id, subject_id, teacher_id, room_id }));
    if (remove.length) must(await db.from('timetable_slots').delete().in('id', remove));
    if (add.length) must(await db.from('timetable_slots').insert(add));
    must(await db.from('timetable_status').upsert({ term_id: termId, published: true, published_at: new Date().toISOString() }));
    dirty = false;
    toast('Timetable published');
    go(url({ edit: '' }));
  }).catch(() => {}) });
  const discard = btn('Discard Changes', { onclick: async () => {
    if (dirty && !(await confirmBox('Discard your changes?', 'Everything moved since the last publish goes back to how it was.', 'Discard'))) return;
    dirty = false; go(url({ edit: '' }));
  } });
  addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  const legend = h('div', { class: 'row small muted' }, grades.map((g, i) => h('span', { class: 'row', style: 'gap: 6px' }, h('span', { class: `swatch g${i % 7}` }), g.name)),
    h('span', { class: 'row', style: 'gap: 6px' }, h('span', { class: 'swatch extra' }), 'Extra-curricular'),
    h('span', { class: 'row', style: 'gap: 6px' }, h('span', { class: 'swatch clash' }), 'Clash'));

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead(editing ? 'Edit Timetable' : 'Timetable',
      editing ? 'Drag subjects into periods. Publishing updates every teacher’s My Schedule.' : 'The whole school’s week. Filter to see one grade, teacher or room.',
      editing ? [discard, save] : [btn('Edit Timetable', { primary: true, icon: 'edit', href: url({ edit: '1' }) })]),
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'View'), bySel, targetSel, h('span', { class: 'muted small' }, 'Term'), termSel,
      status?.published ? tag(`Published ${fmtDMY(status.published_at)}`, 'ok') : tag('Draft · not published', 'warn'), changes),
    legend,
    editing ? trayBox : null,
    gridBox,
    editing ? null : trayBox,
    conflictBox));
  draw();
}
