// Student Enrollment (admin): admissions, transfers and withdrawals in progress.
import { db, must, h, mount, getCurrentYear, fmtDMY, btn, card, table, tag, pageHead } from '../lib.js';

export const APP_STATUS = { draft: ['Draft', ''], new: ['New', 'warn'], in_review: ['In review', ''], accepted: ['Accepted', 'ok'], rejected: ['Rejected', 'bad'], enrolled: ['Enrolled', 'ok'] };
export const appTag = (s) => tag(...(APP_STATUS[s] || [s]));
export const KIND = { incoming: 'Incoming', outgoing: 'Outgoing', internal: 'Internal' };

const item = (title, status, sub, action) => h('div', { class: 'item' },
  h('div', { class: 'it' }, h('b', {}, title, ' ', status), h('span', {}, sub)), action);

export async function render(ctx) {
  const year = await getCurrentYear();
  const [apps, transfers, withdrawals, activity] = await Promise.all([
    db.from('applications').select('*, grade:grade_levels(name)').in('status', ['draft', 'new', 'in_review', 'accepted']).order('applied_on', { ascending: false }).then(must),
    db.from('transfers').select('*').in('status', ['draft', 'pending']).order('created_at', { ascending: false }).then(must),
    db.from('withdrawals').select('*').eq('status', 'awaiting_tc').order('created_at', { ascending: false }).then(must),
    db.from('activity_log').select('*').order('at', { ascending: false }).order('id', { ascending: false }).limit(10).then(must),
  ]);
  const block = (title, n, href, rows, seeAll, emptyText, newBtn) => card(
    h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, h('span', {}, title), h('span', { class: 'row' }, h('span', { class: 'count tag' }, n), h('a', { href, style: 'font-size: 13px; font-weight: 400' }, 'View all'))),
    h('div', {}, rows.length ? rows : h('p', { class: 'muted small', style: 'margin: 0' }, emptyText)),
    h('div', { class: 'spread', style: 'align-items: center; margin-top: auto' }, h('a', { href, class: 'small' }, seeAll), newBtn));

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead('Student Enrollment', `Admissions, transfers and withdrawals in progress · Academic Year ${year.name}`),
    h('div', { class: 'grid3' },
      block('Admissions in progress', apps.length, 'AdminAdmissions.html', apps.slice(0, 5).map((a) => item(a.full_name, appTag(a.status),
        `${a.grade?.name || '—'} · ${a.status === 'accepted' ? 'Ready to enroll' : Object.values(a.documents || {}).includes('missing') ? 'Documents missing' : `Applied ${fmtDMY(a.applied_on)}`}`,
        btn(a.status === 'accepted' ? 'Enroll' : 'Review', { small: true, href: `AdminApplication.html?id=${a.id}` }))), 'See all admissions', 'No admissions in progress.',
        btn('New Admission', { small: true, primary: true, icon: 'plus', href: 'AdminNewApplication.html' })),
      block('Transfers in progress', transfers.length, 'AdminTransfers.html', transfers.slice(0, 5).map((t) => item(t.student_name, tag(KIND[t.kind]),
        t.status === 'draft' ? `Step ${t.step} of 4` : `${t.kind === 'incoming' ? `From ${t.from_place || '—'} → ${t.to_place || '—'}` : `${t.from_place || '—'} → ${t.to_place || '—'}`} · Effective ${fmtDMY(t.effective_on)}`,
        btn(t.status === 'draft' ? 'Continue' : 'Open', { small: true, href: t.status === 'draft' ? `AdminNewTransfer.html?id=${t.id}` : `AdminTransfers.html?id=${t.id}` }))), 'See all transfers', 'No transfers in progress.',
        btn('New Transfer', { small: true, primary: true, icon: 'plus', href: 'AdminNewTransfer.html' })),
      block('Withdrawals in progress', withdrawals.length, 'AdminWithdrawals.html', withdrawals.slice(0, 5).map((w) => item(w.student_name, tag('Awaiting TC', 'warn'),
        `${w.grade_name || '—'} · Last day ${fmtDMY(w.last_day)}`, btn('Open', { small: true, href: `AdminWithdrawals.html?id=${w.id}` }))), 'See all withdrawals', 'No withdrawals in progress.',
        btn('New Withdrawal', { small: true, primary: true, icon: 'plus', href: 'AdminWithdrawals.html?new=1' }))),
    card('Recent activity', table([
      { label: 'Date', render: (r) => fmtDMY(r.at) }, { label: 'Type', key: 'kind' }, { label: 'Student', th: true, key: 'student_name' },
      { label: 'Update', cls: 'wrap', key: 'detail' }, { label: 'By', key: 'by_name' },
    ], activity, { empty: 'No activity yet.' }))));
}
