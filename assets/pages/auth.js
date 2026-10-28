// Sign in, first-time account setup, password reset.
import { db, h, param, go, must } from '../lib.js';

function message(card, text, bad = false) {
  let box = card.querySelector('.auth-msg');
  if (!box) { box = h('div', { class: 'auth-msg', role: 'status' }); card.querySelector('h1').parentElement.after(box); }
  box.className = 'auth-msg ' + (bad ? 'app-error' : 'note');
  box.textContent = text;
}

function landingFor(next) {
  return next && /^[A-Za-z]+\.html(\?.*)?$/.test(next) ? next : 'Dashboard.html';
}

function renderLogin(main) {
  const card = main.querySelector('section.card');
  const email = card.querySelector('input[type="text"]');
  const password = card.querySelector('input[type="password"]');
  const keep = card.querySelector('input[type="checkbox"]');
  const submit = card.querySelector('a.btn.p');
  const title = card.querySelector('h1');
  const sub = title.nextElementSibling;
  email.type = 'email';
  email.autocomplete = 'email';
  email.closest('label').firstChild.textContent = 'Email';
  password.autocomplete = 'current-password';
  keep.checked = localStorage.getItem('ledger-keep') !== '0';
  const role = card.querySelector('p.ph');
  if (role) role.remove();

  // Wrap the fields in a real form so Enter submits.
  const form = h('form', { style: 'display: contents', novalidate: true });
  card.insertBefore(form, email.closest('label'));
  [email.closest('label'), password.closest('label'), keep.closest('div'), submit].forEach((el) => form.append(el));
  const button = h('button', { type: 'submit', class: submit.className, style: submit.getAttribute('style') }, 'Sign In');
  submit.replaceWith(button);

  let mode = 'signin';
  const toggle = h('p', { style: 'margin: 0; font-size: 13.5px; text-align: center' });
  const setMode = (m) => {
    mode = m;
    title.textContent = m === 'signin' ? 'Sign in' : m === 'signup' ? 'Set up your account' : 'Choose a new password';
    sub.textContent = m === 'signin' ? 'Teachers and school admins use the same sign-in.'
      : m === 'signup' ? 'Use the email your school admin added to the staff list.'
      : 'Enter a new password for your account.';
    button.textContent = m === 'signin' ? 'Sign In' : m === 'signup' ? 'Create Account' : 'Save Password';
    email.closest('label').hidden = m === 'reset';
    keep.closest('div').hidden = m !== 'signin';
    password.autocomplete = m === 'signin' ? 'current-password' : 'new-password';
    toggle.replaceChildren(m === 'signin'
      ? h('span', {}, 'New staff member? ', h('button', { type: 'button', class: 'linkbtn', onclick: () => setMode('signup') }, 'Set up your account'))
      : m === 'signup' ? h('span', {}, 'Already set up? ', h('button', { type: 'button', class: 'linkbtn', onclick: () => setMode('signin') }, 'Sign in'))
      : '');
  };
  card.append(toggle);
  setMode('signin');

  db.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') setMode('reset'); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    try {
      if (mode === 'reset') {
        if (password.value.length < 8) throw new Error('Use at least 8 characters.');
        must(await db.auth.updateUser({ password: password.value }));
        go('Dashboard.html');
        return;
      }
      if (!email.value || !password.value) throw new Error('Enter your email and password.');
      if (mode === 'signup') {
        if (password.value.length < 8) throw new Error('Use at least 8 characters for your password.');
        const { data, error } = await db.auth.signUp({ email: email.value.trim(), password: password.value, options: { emailRedirectTo: new URL('Login.html', location.href).href } });
        if (error) throw error;
        if (!data.session) { message(card, 'Check your email for a confirmation link, then sign in here.'); setMode('signin'); return; }
      } else {
        const { error } = await db.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
      }
      localStorage.setItem('ledger-keep', keep.checked ? '1' : '0');
      sessionStorage.setItem('ledger-live', '1');
      const { data: me } = await db.rpc('claim_staff');
      go(me?.role === 'admin' && !param('next') ? 'AdminDashboard.html' : landingFor(param('next')));
    } catch (x) {
      message(card, x.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

function renderForgot(main) {
  const card = main.querySelector('section.card');
  const email = card.querySelector('input.in');
  const button = card.querySelector('button.btn');
  const after = card.querySelector('.note');
  email.type = 'email';
  email.closest('label').firstChild.textContent = 'Email';
  card.querySelector('h1').nextElementSibling.textContent = 'Enter the email on your account. We’ll send a reset link.';
  if (after) after.remove();
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (!email.value) throw new Error('Enter your email.');
      must(await db.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: new URL('Login.html', location.href).href }));
      message(card, 'Check your email for a reset link. It expires after a while, so use it soon.');
    } catch (x) {
      message(card, x.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

export async function render({ page, main }) {
  if (page === 'Login') {
    const { data: { session } } = await db.auth.getSession();
    const recovering = location.hash.includes('type=recovery');
    renderLogin(main);
    if (session && !recovering) {
      const { data: me } = await db.rpc('claim_staff');
      if (me?.id) go(me.role === 'admin' && !param('next') ? 'AdminDashboard.html' : landingFor(param('next')));
    }
  } else {
    renderForgot(main);
  }
}
