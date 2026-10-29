// Transfers (admin): list by type, and a four-step form to start or continue one.
import { db, must, h, mount, param, go, getGrades, getCurrentYear, getClasses, fmtDMY, isoDate, btn, card, table, tabs, tag,
  pageHead, backLink, emptyState, studentName, input, select, field, textarea, checkbox, toast, busy, confirmBox, logActivity } from '../lib.js';
import { KIND } from './enrollment.js';

const STATUS = { draft: ['Draft', ''], pending: ['Pending', 'warn'], completed: ['Completed', 'ok'], cancelled: ['Cancelled', 'bad'] };
const statusTag = (s) => tag(...STATUS[s]);

// Finishing a transfer updates the student's record and rosters.
async function complete(ctx, t) {
  const year = await getCurrentYear();
  if (t.kind === 'outgoing' && t.student_id) {
    const s = must(await db.from('students').select('grade:grade_levels(name)').eq('id', t.student_id).single());
    must(await db.from('students').update({ status: 'transferred', left_on: t.effective_on || isoDate(), left_year: year.name, left_grade: s.grade?.name, left_reason: 'Transferred', roll_no: null }).eq('id', t.student_id));
    const classIds = (await getClasses(year.id)).map((c) => c.id);
    if (!t.carry_records) must(await db.from('enrollments').delete().eq('student_id', t.student_id).in('class_id', classIds));
  }
  if (t.kind === 'internal' && t.student_id) {
    const grades = await getGrades();
    const to = grades.find((g) => g.name === t.to_place);
    if (to) {
      const classes = await getClasses(year.id);
      must(await db.from('enrollments').delete().eq('student_id', t.student_id).in('class_id', classes.map((c) => c.id)));
      must(await db.from('students').update({ grade_id: to.id }).eq('id', t.student_id));
      const add = classes.filter((c) => c.grade_id === to.id).map((c) => ({ class_id: c.id, student_id: t.student_id }));
      if (add.length) must(await db.from('enrollments').insert(add));
    }
  }
  must(await db.from('transfers').update({ status: 'completed' }).eq('id', t.id));
  await logActivity(ctx.me, 'Transfer', t.student_name, `${KIND[t.kind]} transfer completed`);
}

async function list(ctx) {
  const kind = param('kind') || 'incoming';
  const status = param('status') || '';
  const openId = Number(param('id'));
  const all = must(await db.from('transfers').select('*').order('created_at', { ascending: false }));
  const focus = openId ? all.find((t) => t.id === openId) : null;
  const shownKind = focus ? focus.kind : kind;
  const rows = all.filter((t) => t.kind === shownKind && (!status || t.status === status));
  const url = (q) => 'AdminTransfers.html?' + new URLSearchParams({ kind: shownKind, status, ...q });
  const count = (k) => all.filter((t) => t.kind === k && t.status !== 'cancelled').length;

  const actions = (t) => h('span', { class: 'row' },
    t.status === 'draft' ? btn('Continue', { small: true, href: `AdminNewTransfer.html?id=${t.id}` }) : null,
    t.status === 'pending' ? btn(t.kind === 'incoming' ? 'Start admission' : 'Complete', { small: true, primary: true, onclick: async () => {
      if (t.kind === 'incoming') { go('AdminNewApplication.html'); return; }
      if (!(await confirmBox(`Complete ${t.student_name}’s transfer?`, t.kind === 'outgoing' ? 'The student is moved to Former Students. Their records stay viewable.' : `The student moves to ${t.to_place} and its class rosters.`, 'Complete', false))) return;
      await busy(null, () => complete(ctx, t), 'Transfer completed').catch(() => {});
      list(ctx);
    } }) : null,
    ['draft', 'pending'].includes(t.status) ? btn('Cancel', { small: true, danger: true, onclick: async () => {
      if (!(await confirmBox('Cancel this transfer?', 'It stays in the list as cancelled.', 'Cancel transfer'))) return;
      must(await db.from('transfers').update({ status: 'cancelled' }).eq('id', t.id)); list(ctx);
    } }) : null,
    t.student_id ? btn('Profile', { small: true, href: `AdminStudent.html?id=${t.student_id}` }) : null);

  mount(ctx.main, h('div', { class: 'stack' },
    backLink('Back to Student Enrollment', 'AdminEnrollment.html'),
    pageHead('Transfers', 'Move students in, out, or between classes. Records stay viewable in history.', [btn('New Transfer', { primary: true, icon: 'plus', href: 'AdminNewTransfer.html' })]),
    tabs(Object.entries(KIND).map(([k, l]) => [k, l, count(k)]), shownKind, null, { hrefFor: (k) => 'AdminTransfers.html?kind=' + k }),
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Status'),
      select([['', 'All'], ...Object.entries(STATUS).map(([k, [l]]) => [k, l])], status, { style: 'width: auto', onchange: (e) => go(url({ status: e.target.value })) })),
    focus ? h('div', { class: 'note' }, `Showing ${focus.student_name}’s ${KIND[focus.kind].toLowerCase()} transfer.`) : null,
    rows.length ? table([
      { label: 'Student', th: true, render: (t) => (t.student_id ? h('a', { href: `AdminStudent.html?id=${t.student_id}` }, t.student_name) : t.student_name) },
      { label: 'Type', render: (t) => KIND[t.kind] }, { label: 'From', render: (t) => t.from_place || '—' }, { label: 'To', render: (t) => t.to_place || '—' },
      { label: 'Effective date', render: (t) => fmtDMY(t.effective_on) }, { label: 'Status', render: (t) => statusTag(t.status) }, { label: '', render: actions },
    ], rows)
      : emptyState('No transfers here', `${KIND[shownKind]} transfers will appear here once started.`, btn('New Transfer', { primary: true, icon: 'plus', href: 'AdminNewTransfer.html' }))));
}

async function wizard(ctx) {
  const id = Number(param('id'));
  const t = id ? must(await db.from('transfers').select('*').eq('id', id).maybeSingle()) : { kind: 'outgoing', step: 1, carry_records: true, student_id: Number(param('student')) || null };
  if (!t) { mount(ctx.main, emptyState('Transfer not found', null, btn('Transfers', { href: 'AdminTransfers.html' }))); return; }
  const grades = await getGrades();
  let step = Math.min(Number(param('step')) || t.step || 1, 4);
  if (t.student_id && step === 1 && !id) step = 2;
  const student = t.student_id ? must(await db.from('students').select('*, grade:grade_levels(name)').eq('id', t.student_id).maybeSingle()) : null;

  const persist = async (patch, nextStep) => {
    const row = { ...patch, step: nextStep, status: nextStep > 4 ? 'pending' : 'draft' };
    if (nextStep > 4) row.step = 4;
    const saved = id ? must(await db.from('transfers').update(row).eq('id', id).select().single())
      : must(await db.from('transfers').insert({ kind: t.kind, student_name: student ? studentName(student) : patch.student_name || 'New student', ...t, ...row }).select().single());
    if (!id) await logActivity(ctx.me, 'Transfer', saved.student_name, `${KIND[saved.kind]} transfer started`);
    if (nextStep > 4) { toast('Transfer submitted'); go(`AdminTransfers.html?id=${saved.id}`); } else go(`AdminNewTransfer.html?id=${saved.id}&step=${nextStep}`);
  };

  const steps = h('ol', { class: 'steps' }, ['Pick student', 'Type and destination', 'Effective date and records', 'Review and confirm'].map((l, i) =>
    h('li', { class: i + 1 === step ? 'on' : i + 1 < step ? 'done' : '' }, h('b', {}, i + 1 < step ? '✓' : i + 1), l)));
  const studentCard = student ? card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, 'Student', id && step > 1 ? h('a', { href: `AdminNewTransfer.html?id=${id}&step=1`, style: 'font-size: 13px; font-weight: 400' }, 'Change') : null),
    h('div', { class: 'it' }, h('b', {}, student.full_name), h('span', { class: 'muted small' }, ` Adm. No ${student.admission_no || '—'} · ${student.grade?.name || '—'} · ${student.residential || '—'}`))) : null;

  let body;
  const next = btn(step === 4 ? 'Confirm Transfer' : 'Next', { primary: true });
  if (step === 1) {
    const q = input({ placeholder: 'Search by name or admission no.', 'aria-label': 'Search students' });
    const results = h('div', { class: 'stack', style: 'gap: 0' });
    const incomingName = input({ placeholder: 'Incoming student’s name' });
    const kindSel = select([['outgoing', 'Existing student (outgoing or internal)'], ['incoming', 'New student joining (incoming)']], t.kind === 'incoming' ? 'incoming' : 'outgoing');
    let picked = t.student_id;
    const search = async () => {
      const term = q.value.replace(/[%,()]/g, ' ').trim();
      const rows = term ? must(await db.from('students').select('id, full_name, admission_no, grade:grade_levels(name)').eq('status', 'active').or(`full_name.ilike.%${term}%,admission_no.ilike.%${term}%`).limit(8)) : [];
      mount(results, rows.map((s) => h('label', { class: 'item', style: 'cursor: pointer' }, h('span', { class: 'row' }, h('input', { type: 'radio', name: 'pick', checked: s.id === picked, onchange: () => { picked = s.id; } }),
        h('span', { class: 'it' }, h('b', {}, s.full_name), h('span', {}, `Adm. No ${s.admission_no || '—'} · ${s.grade?.name || '—'}`))))));
    };
    q.addEventListener('input', search);
    const drawMode = () => { q.closest('.fl').hidden = kindSel.value === 'incoming'; results.hidden = kindSel.value === 'incoming'; incomingName.closest('.fl').hidden = kindSel.value !== 'incoming'; };
    kindSel.addEventListener('change', drawMode);
    body = card('Pick student', field('Who is transferring?', kindSel), field('Student', q), results, field('Name', incomingName));
    setTimeout(drawMode);
    next.onclick = () => busy(next, async () => {
      if (kindSel.value === 'incoming') {
        if (!incomingName.value.trim()) throw new Error('Enter the student’s name.');
        Object.assign(t, { kind: 'incoming', student_id: null });
        await persist({ kind: 'incoming', student_id: null, student_name: incomingName.value.trim() }, 2);
      } else {
        if (!picked) throw new Error('Pick a student.');
        const s = must(await db.from('students').select('full_name, display_name, grade:grade_levels(name)').eq('id', picked).single());
        await persist({ student_id: picked, student_name: studentName(s), from_place: s.grade?.name || '', kind: t.kind === 'incoming' ? 'outgoing' : t.kind }, 2);
      }
    }).catch(() => {});
  } else if (step === 2) {
    const kinds = t.kind === 'incoming' ? ['incoming'] : ['outgoing', 'internal'];
    let kind = kinds.includes(t.kind) ? t.kind : kinds[0];
    const desc = { incoming: 'Joining from another school', outgoing: 'Leaving for another school', internal: 'Moving to another class / grade' };
    const dest = input({ value: t.kind === 'incoming' ? t.from_place || '' : t.to_place || '' });
    const gradeDest = select(grades.map((g) => g.name), t.to_place && grades.some((g) => g.name === t.to_place) ? t.to_place : grades[0]?.name);
    const city = input({ value: t.city || '' });
    const reason = select([['', 'Select reason'], 'Family relocation', 'Parent request', 'Health', 'Other'], t.reason || '');
    const contact = input({ value: t.contact || '', placeholder: 'Name, phone or email' });
    const destField = field(kind === 'incoming' ? 'Previous school *' : 'Destination school *', dest);
    const gradeField = field(kind === 'incoming' ? 'Joining grade *' : 'Destination grade *', gradeDest);
    const drawKind = () => { destField.hidden = kind === 'internal'; gradeField.hidden = kind === 'outgoing'; };
    body = card('Transfer type and destination',
      h('div', { class: 'choices' }, kinds.map((k) => h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'kind', value: k, checked: k === kind, onchange: () => { kind = k; drawKind(); } }),
        h('span', {}, h('b', {}, KIND[k]), h('span', {}, desc[k]))))),
      h('div', { class: 'grid2' }, destField, gradeField, field('City / district', city), field('Reason', reason), field('Contact at destination', contact)));
    drawKind();
    next.onclick = () => busy(next, async () => {
      if (kind !== 'internal' && !dest.value.trim()) throw new Error(kind === 'incoming' ? 'Enter the previous school.' : 'Enter the destination school.');
      const patch = { kind, city: city.value, reason: reason.value, contact: contact.value };
      if (kind === 'incoming') Object.assign(patch, { from_place: dest.value.trim(), to_place: gradeDest.value });
      else if (kind === 'outgoing') Object.assign(patch, { to_place: dest.value.trim(), from_place: student?.grade?.name || t.from_place });
      else Object.assign(patch, { to_place: gradeDest.value, from_place: student?.grade?.name || t.from_place });
      await persist(patch, 3);
    }).catch(() => {});
  } else if (step === 3) {
    const date = input({ type: 'date', value: t.effective_on || isoDate() });
    const carry = checkbox(t.kind === 'outgoing' ? 'Keep the student on this year’s class rosters (marks stay in gradebooks)' : 'Carry over existing records', t.carry_records);
    body = card('Effective date and records', h('div', { class: 'grid2' }, field('Effective date *', date)), carry,
      h('p', { class: 'muted small', style: 'margin: 0' }, 'Records stay viewable in history after the transfer.'));
    next.onclick = () => busy(next, async () => {
      if (!date.value) throw new Error('Pick the effective date.');
      await persist({ effective_on: date.value, carry_records: carry.querySelector('input').checked }, 4);
    }).catch(() => {});
  } else {
    body = card('Review and confirm', h('dl', { class: 'kv', style: 'grid-template-columns: repeat(2, minmax(0, 1fr))' },
      [['Student', t.student_name], ['Type', KIND[t.kind]], ['From', t.from_place], ['To', t.to_place], ['City / district', t.city], ['Reason', t.reason],
        ['Contact', t.contact], ['Effective date', fmtDMY(t.effective_on)], ['Records', t.carry_records ? 'Carried over' : 'Not carried over']]
        .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v || '—')))),
    h('p', { class: 'muted small', style: 'margin: 0' }, 'Confirming submits the transfer as pending. Complete it from the Transfers list on the effective date.'));
    next.onclick = () => busy(next, () => persist({}, 5)).catch(() => {});
  }

  mount(ctx.main, h('div', { class: 'stack', style: 'max-width: 960px' },
    backLink('Back to transfers', 'AdminTransfers.html'),
    pageHead('New Transfer', `Step ${step} of 4 · Records stay viewable in history after the transfer.`, [btn('Cancel', { href: 'AdminTransfers.html' })]),
    steps, step > 1 ? studentCard : null, body,
    h('div', { class: 'row', style: 'justify-content: flex-end' }, step > 1 && id ? btn('Back', { href: `AdminNewTransfer.html?id=${id}&step=${step - 1}` }) : null, next)));
}

export function render(ctx) {
  return ctx.page === 'AdminNewTransfer' ? wizard(ctx) : list(ctx);
}
