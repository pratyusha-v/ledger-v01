// My Account: profile, password and notification preferences.
import { db, must, h, mount, guardUnsaved, btn, card, pageHead, input, field, checkbox, toast, busy, signOut, getGrades } from '../lib.js';

const NOTIFY = {
  teacher: [['grades_due', 'Email me when grades are due'], ['attendance', 'Email me when attendance isn’t taken'], ['weekly', 'Weekly summary']],
  admin: [['admissions', 'New admission applications'], ['transfers', 'Transfer requests'], ['conflicts', 'Timetable conflicts'], ['weekly', 'Weekly school summary']],
};

export async function render(ctx) {
  const me = ctx.me;
  const homeroom = (await getGrades()).filter((g) => g.class_teacher_id === me.id).map((g) => g.name);
  const role = me.role === 'admin' ? 'School admin' : `Teacher${homeroom.length ? ' · Class teacher of ' + homeroom.join(', ') : ''}`;
  const name = input({ value: me.name, autocomplete: 'name' });
  const email = input({ value: me.email, disabled: true });
  const phone = input({ value: me.phone || '', autocomplete: 'tel' });
  const pw1 = input({ type: 'password', autocomplete: 'new-password' });
  const pw2 = input({ type: 'password', autocomplete: 'new-password' });
  const prefs = NOTIFY[me.role].map(([k, l]) => [k, checkbox(l, me.notify?.[k])]);

  const save = btn('Save Changes', { primary: true, onclick: () => busy(save, async () => {
    if (!name.value.trim()) throw new Error('Name can’t be empty.');
    const notify = { ...me.notify, ...Object.fromEntries(prefs.map(([k, el]) => [k, el.querySelector('input').checked])) };
    must(await db.from('staff').update({ name: name.value.trim(), phone: phone.value.trim(), notify }).eq('id', me.id));
    Object.assign(me, { name: name.value.trim(), phone: phone.value.trim(), notify });
    guard?.clear();
  }, 'Saved').catch(() => {}) });

  const pwBtn = btn('Update Password', { onclick: () => busy(pwBtn, async () => {
    if (pw1.value.length < 8) throw new Error('Use at least 8 characters.');
    if (pw1.value !== pw2.value) throw new Error('The two passwords don’t match.');
    must(await db.auth.updateUser({ password: pw1.value }));
    pw1.value = ''; pw2.value = '';
    guard?.clear();
  }, 'Password updated').catch(() => {}) });

  mount(ctx.main, h('div', { class: 'stack', style: 'max-width: 880px' },
    pageHead('My Account', `${me.name} · ${role}`, [save]),
    card('Profile', h('div', { class: 'grid2' }, field('Name', name), field('Email', email), field('Phone', phone)),
      h('p', { class: 'muted small', style: 'margin: 0' }, 'Your sign-in email can only be changed by the school admin.')),
    card('Password', h('div', { class: 'grid2' }, field('New password', pw1), field('Confirm new password', pw2)), h('div', {}, pwBtn)),
    card('Notifications', h('div', { class: 'stack', style: 'gap: 10px' }, prefs.map(([, el]) => el)),
      h('p', { class: 'muted small', style: 'margin: 0' }, 'Your preferences are saved. Ledger doesn’t send these emails yet.')),
    h('div', {}, btn('Log Out', { danger: true, onclick: async () => { if (!guard || (await guard.leave())) signOut(); } }))));
  // Teachers get a warning before leaving with unsaved account changes.
  const guard = ctx.isAdmin ? null : guardUnsaved(ctx.main);
}
