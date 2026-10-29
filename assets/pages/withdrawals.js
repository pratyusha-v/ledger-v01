// Withdrawals (admin): students leaving the school. Records are archived, not deleted.
import { db, must, h, mount, param, go, getYears, getCurrentYear, fmtDMY, isoDate, btn, card, table, tag, pageHead, backLink, emptyState,
  studentName, input, select, field, textarea, checkbox, toast, busy, logActivity } from '../lib.js';

const REASONS = ['Family relocation', 'Health', 'Financial', 'Other'];

export async function render(ctx) {
  const [years, current] = await Promise.all([getYears(), getCurrentYear()]);
  const yearName = param('year') || current.name;
  const rows = must(await db.from('withdrawals').select('*').eq('year_name', yearName).order('last_day', { ascending: false }));
  const studentId = Number(param('student')) || null;
  const showForm = !!param('new') || !!studentId;

  const markIssued = (w) => btn('TC issued', { small: true, primary: true, onclick: async () => {
    must(await db.from('withdrawals').update({ status: 'completed' }).eq('id', w.id));
    await logActivity(ctx.me, 'Withdrawal', w.student_name, 'Transfer certificate issued');
    toast('Marked as issued'); render(ctx);
  } });

  let form = null;
  if (showForm) {
    const picker = select([['', 'Select student']], '');
    const students = must(await db.from('students').select('id, full_name, display_name, admission_no, grade:grade_levels(name)').eq('status', 'active').order('full_name'));
    students.forEach((s) => picker.append(h('option', { value: s.id }, `${s.full_name} · ${s.grade?.name || '—'} · Adm. ${s.admission_no || '—'}`)));
    if (studentId) picker.value = String(studentId);
    const reason = select([['', 'Select reason'], ...REASONS], '');
    const last = input({ type: 'date', value: isoDate() });
    const notes = textarea({ placeholder: 'Anything the office should know' });
    const archive = checkbox('Archive records (stay viewable under Former Students)', true);
    const tc = checkbox('Issue Transfer Certificate', true);
    const confirm = btn('Confirm Withdrawal', { primary: true, onclick: () => busy(confirm, async () => {
      const s = students.find((x) => x.id === +picker.value);
      if (!s) throw new Error('Pick the student.');
      if (!reason.value) throw new Error('Pick a reason.');
      if (!last.value) throw new Error('Enter the last day at school.');
      const issue = tc.querySelector('input').checked;
      must(await db.from('withdrawals').insert({
        student_id: s.id, student_name: studentName(s), grade_name: s.grade?.name, reason: reason.value, last_day: last.value, notes: notes.value,
        archive_records: archive.querySelector('input').checked, issue_tc: issue, status: issue ? 'awaiting_tc' : 'completed', year_name: current.name,
      }));
      must(await db.from('students').update({ status: 'withdrawn', left_on: last.value, left_year: current.name, left_grade: s.grade?.name, left_reason: 'Withdrawn', roll_no: null }).eq('id', s.id));
      await logActivity(ctx.me, 'Withdrawal', studentName(s), `Withdrawn · ${reason.value}`);
      toast('Withdrawal recorded');
      go('AdminWithdrawals.html');
    }).catch(() => {}) });
    form = card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, 'New Withdrawal', h('a', { href: 'AdminWithdrawals.html', style: 'font-size: 13px; font-weight: 400' }, 'Close')),
      h('div', { class: 'grid2' }, field('Student *', picker), field('Reason *', reason), field('Last day at school *', last), field('Notes', notes)),
      archive, tc, h('div', {}, confirm));
  }

  const yearSel = select(years.map((y) => y.name), yearName, { style: 'width: auto', onchange: (e) => go('AdminWithdrawals.html?year=' + encodeURIComponent(e.target.value)) });
  mount(ctx.main, h('div', { class: 'stack' },
    backLink('Back to Student Enrollment', 'AdminEnrollment.html'),
    pageHead('Withdrawals', 'Students leaving the school. Their records are archived, not deleted.', showForm ? [] : [btn('New Withdrawal', { primary: true, icon: 'plus', href: 'AdminWithdrawals.html?new=1' })]),
    form,
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Year'), yearSel),
    rows.length ? table([
      { label: 'Student', th: true, render: (w) => (w.student_id ? h('a', { href: `AdminStudent.html?id=${w.student_id}` }, w.student_name) : w.student_name) },
      { label: 'Grade', render: (w) => w.grade_name || '—' }, { label: 'Last day', render: (w) => fmtDMY(w.last_day) }, { label: 'Reason', key: 'reason' },
      { label: 'Records', render: (w) => (w.archive_records ? 'Records archived' : 'Not archived') },
      { label: 'Status', render: (w) => (w.status === 'awaiting_tc' ? h('span', { class: 'row' }, tag('Awaiting TC', 'warn'), markIssued(w)) : tag('Completed', 'ok')) },
    ], rows)
      : emptyState('No withdrawals this year', 'Withdrawn students will be listed here with their archived records.', null, 'users')));
}
