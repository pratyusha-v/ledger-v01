// Entry point for every Ledger page: checks the session, fills the header,
// then hands the page's <main> (and side column) to that page's module.
import { db, currentStaff, pageName, counterpart, makeLinker, signOut, initials, h, mount, errorBox, go } from './lib.js';

const MODULES = {
  Dashboard: 'dashboard', AdminDashboard: 'dashboard',
  Main: 'gradebook', AdminMain: 'gradebook', AllClasses: 'gradebook', AdminAllClasses: 'gradebook',
  AllClassesStart: 'classes', AllClassesResults: 'classes', AdminAllClassesStart: 'classes', AdminAllClassesResults: 'classes',
  TestDetail: 'test', AdminTestDetail: 'test', NewTest: 'test', AdminNewTest: 'test',
  Marks: 'marks', AdminMarks: 'marks', AddTest: 'marks', AdminAddTest: 'marks',
  Attendance: 'attendance', AdminAttendance: 'attendance', AttendanceView: 'attendance',
  SearchStart: 'search', Search: 'search', AdminSearchStart: 'search', AdminSearch: 'search',
  Student: 'student', AdminStudent: 'student',
  MySchedule: 'schedule',
  MyAccount: 'account', AdminMyAccount: 'account',
  AdminEnrollment: 'enrollment',
  AdminAdmissions: 'admissions', AdminApplication: 'admissions', AdminNewApplication: 'admissions',
  AdminTransfers: 'transfers', AdminNewTransfer: 'transfers',
  AdminWithdrawals: 'withdrawals',
  AdminPastYears: 'records', AdminFormerStudents: 'records', AdminReports: 'reports',
  AdminTimetable: 'scheduling', AdminTerms: 'scheduling', AdminRooms: 'scheduling',
  AdminStaff: 'people', AdminRoles: 'people', AdminSettings: 'people',
  Login: 'auth', ForgotPassword: 'auth',
};

function fillHeader(me) {
  const role = me.role === 'admin' ? 'School admin' : 'Teacher';
  const avatar = document.querySelector('header .nv > button[aria-haspopup]');
  if (avatar) {
    avatar.textContent = initials(me.name);
    avatar.setAttribute('aria-label', `Profile menu – ${me.name}`);
  }
  const who = document.querySelector('header .dd .who');
  if (who) mount(who, h('b', {}, me.name), role);
  document.querySelectorAll('a[href="Login.html"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); signOut(); }));
}

// Touch screens have no hover: the first tap on a dropdown label opens it.
document.addEventListener('click', (e) => {
  const trigger = e.target.closest?.('.nv > [aria-haspopup]');
  document.querySelectorAll('.nv.open').forEach((n) => { if (!n.contains(e.target)) n.classList.remove('open'); });
  if (!trigger) return;
  const nv = trigger.parentElement;
  if (trigger.tagName === 'BUTTON' || matchMedia('(hover: none)').matches) {
    if (!nv.classList.contains('open')) { e.preventDefault(); nv.classList.add('open'); }
    else if (trigger.tagName === 'BUTTON') nv.classList.remove('open');
  }
});

function noAccess(main, email) {
  mount(main, h('section', { class: 'empty', style: 'margin-top: 24px' },
    h('h2', {}, 'No Ledger access for this account'),
    h('p', {}, `${email} is signed in, but isn't on the staff list, or the account is inactive. Ask the school admin to add you under Permissions › Staff Directory.`),
    h('button', { type: 'button', class: 'btn', onclick: signOut }, 'Sign out')));
}

async function start() {
  const page = pageName();
  const main = document.querySelector('main');
  const aside = document.querySelector('aside');
  const mod = MODULES[page];
  if (!mod) return;

  if (mod === 'auth') {
    (await import('./pages/auth.js')).render({ page, main });
    return;
  }

  const me = await currentStaff();
  if (!me) { go('Login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search)); return; }
  if (me.noAccess) { noAccess(main, me.email); return; }

  const isAdmin = me.role === 'admin';
  const other = counterpart(page, isAdmin);
  if (other && other !== page) { go(other + '.html' + location.search); return; }

  fillHeader(me);
  const ctx = { page, me, isAdmin, db, main, aside, link: makeLinker(isAdmin) };
  try {
    await (await import(`./pages/${mod}.js`)).render(ctx);
  } catch (e) {
    console.error(e);
    mount(main, errorBox(e));
  }
}

start();
