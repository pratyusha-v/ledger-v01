// Admin navigation: which section each page belongs to, the section's own links,
// breadcrumbs, page titles, and the header search. The header markup itself is
// shared by every admin page (tools/admin-header.html).
import { db, must, h, mount, pageName, getCurrentYear, getClasses, backLink, studentName, retitleVisit } from './lib.js';

// Section -> its pages. `links` are shown as the section's tabs under the main nav;
// `pages` are the deeper pages that belong to it. The first link is the landing page.
const SECTIONS = {
  dashboard: { pages: ['AdminDashboard'] },
  admissions: {
    links: [['AdminAdmissions', 'Applications'], ['AdminNewApplication', 'New Application'], ['AdminTransfers', 'Transfers'],
      ['AdminWithdrawals', 'Withdrawals'], ['AdminEnrollment', 'Enrollment Overview']],
    pages: ['AdminApplication', 'AdminNewTransfer'],
  },
  students: { pages: ['AdminSearchStart', 'AdminSearch', 'AdminStudent'] },
  classes: {
    links: [['AdminAllClassesStart', 'Classes'], ['AdminTerms', 'Subjects'], ['AdminAttendance', 'Student Attendance']],
    pages: ['AdminAllClassesResults', 'AdminAllClasses', 'AdminMain', 'AdminTestDetail', 'AdminNewTest', 'AdminAddTest', 'AdminAddExtraTest', 'AdminMarks'],
  },
  timetable: { links: [['AdminTimetable', 'Timetable'], ['AdminTerms?view=times', 'Terms and Period Times'], ['AdminRooms', 'Rooms']] },
  staff: { links: [['AdminStaff', 'Staff Directory'], ['AdminStaffAttendance', 'Staff Attendance'], ['AdminRoles', 'Roles and Permissions']], pages: ['AdminStaffProfile'] },
  archive: { links: [['AdminPastYears', 'Past Academic Years'], ['AdminFormerStudents', 'Former Students'], ['AdminReports', 'Reports']] },
};
// Pages outside the main nav, reached from the profile menu.
const OTHER = { AdminSettings: 'School Settings', AdminMyAccount: 'My Account' };
// One-line descriptions for pages whose heading doesn't carry one.
const DESCRIPTIONS = {
  AdminSearchStart: 'Find any current student and open their profile.',
  AdminSearch: 'Find any current student and open their profile.',
  AdminStudent: 'Everything on record for this student. Each section has its own Edit button.',
  AdminStaffProfile: 'This staff member’s details, classes, timetable and attendance.',
};
// The last breadcrumb, where the heading would just repeat the section's name.
const CRUMB = { AdminSearch: 'Search results', AdminAllClassesResults: 'Search results' };

const page = pageName();
const query = new URLSearchParams(location.search);
const linkPage = (target) => target.split('?')[0];
const matches = (target) => {
  const [p, q] = target.split('?');
  if (p !== page) return false;
  // Subjects and Terms and period times are one page with two views.
  if (p === 'AdminTerms') return (query.get('view') === 'times') === (q === 'view=times');
  return true;
};
const sectionKey = Object.keys(SECTIONS).find((k) => {
  const s = SECTIONS[k];
  return (s.links || []).some(([t]) => matches(t)) || (s.pages || []).includes(page);
});
const section = SECTIONS[sectionKey];
const navLink = document.querySelector(`.site-nav a[data-section="${sectionKey}"]`);
const sectionLabel = navLink?.textContent.trim();
const landing = section ? linkPage(section.links?.[0][0] || section.pages[0]) : null;
const isLanding = page === landing && !(page === 'AdminTerms' && query.get('view') === 'times');
const tab = section?.links?.find(([t]) => matches(t));

// Modules can name the pages between the section and this one (e.g. a test's gradebook).
let parents = [];
let on = false; // only admin pages run the nav (teacher pages share some modules)
export function setParents(list) { parents = list; if (on) decorate(); }

function markNav() {
  if (navLink) navLink.setAttribute('aria-current', isLanding ? 'page' : 'true');
  const sub = document.querySelector('.site-sub');
  if (!sub || !section?.links) return;
  mount(sub, section.links.map(([t, label]) => h('a', { href: t.includes('?') ? `${linkPage(t)}.html?${t.split('?')[1]}` : `${t}.html`, 'aria-current': matches(t) ? 'page' : null }, label)));
  sub.setAttribute('aria-label', `${sectionLabel} pages`);
  sub.hidden = false;
}

// Breadcrumbs, a back link on detail pages, the one-line description and the tab title.
let busy = false;
function decorate() {
  const main = document.querySelector('main');
  const h1 = main?.querySelector('h1');
  if (!on || !main || !h1 || busy) return;
  busy = true;
  const heading = h1.cloneNode(true);
  heading.querySelectorAll('.tag').forEach((t) => t.remove());
  const named = heading.textContent.trim();
  const title = page === 'AdminDashboard' ? sectionLabel : tab && tab[1] !== named && !isLanding ? `${tab[1]} – ${named}` : named;
  document.title = `Ledger Admin – ${title}`;
  retitleVisit(title);

  if (DESCRIPTIONS[page] && !h1.parentElement.querySelector('p')) h1.after(h('p', { class: 'page-desc' }, DESCRIPTIONS[page]));

  const trail = [];
  if (section && !isLanding) trail.push([sectionLabel, `${landing}.html`]);
  if (!section && OTHER[page]) trail.push(['Dashboard', 'AdminDashboard.html']);
  parents.forEach((p) => trail.push(p));
  const crumbs = trail.length ? h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('ol', {},
    trail.map(([label, href]) => h('li', {}, h('a', { href }, label))),
    h('li', {}, h('span', { 'aria-current': 'page' }, tab ? tab[1] : CRUMB[page] || named)))) : null;
  // Only touch the page when the trail changed, so redraws don't loop.
  const old = main.querySelector(':scope > .crumbs');
  if (old?.textContent !== crumbs?.textContent) { old?.remove(); if (crumbs) main.prepend(crumbs); }
  // Detail pages (not a section's own tabs) always offer a way back up.
  if (section && !isLanding && !tab && !main.querySelector('.back')) {
    const [label, href] = parents.at(-1) || [sectionLabel, `${landing}.html`];
    (main.querySelector(':scope > .crumbs + *') || main).prepend(backLink(`Back to ${label}`, href));
  }
  busy = false;
}

// ---------- Header search: students, staff and classes, filtered in the browser ----------
let index = null;
async function loadIndex() {
  if (index) return index;
  const year = await getCurrentYear();
  const [students, staff, classes] = await Promise.all([
    db.from('students').select('id, full_name, display_name, admission_no, grade:grade_levels(name)').eq('status', 'active').order('full_name').then(must),
    db.from('staff').select('id, name, role').eq('status', 'active').order('name').then(must),
    getClasses(year.id),
  ]);
  index = [
    ...students.map((s) => ({ type: 'Students', label: studentName(s), sub: [s.grade?.name, s.admission_no && `Adm. ${s.admission_no}`].filter(Boolean).join(' · '),
      href: `AdminStudent.html?id=${s.id}`, text: `${s.full_name} ${s.display_name || ''} ${s.admission_no || ''}` })),
    ...staff.map((s) => ({ type: 'Staff', label: s.name, sub: s.role === 'admin' ? 'Admin' : 'Teacher', href: `AdminStaffProfile.html?id=${s.id}`, text: s.name })),
    ...classes.map((c) => ({ type: 'Classes', label: `${c.grade.name} – ${c.subject.name}`, sub: c.teacher?.name || 'No teacher', href: `AdminMain.html?class=${c.id}`, text: `${c.grade.name} ${c.subject.name} ${c.teacher?.name || ''}` })),
  ];
  return index;
}

function initSearch() {
  const box = document.getElementById('gsearch');
  const list = document.getElementById('gsearch-list');
  if (!box || !list) return;
  let options = [], active = -1;
  const close = () => { list.hidden = true; box.setAttribute('aria-expanded', 'false'); box.removeAttribute('aria-activedescendant'); active = -1; };
  const highlight = (i) => {
    options.forEach((o, j) => o.setAttribute('aria-selected', j === i ? 'true' : 'false'));
    active = i;
    if (options[i]) { box.setAttribute('aria-activedescendant', options[i].id); options[i].scrollIntoView({ block: 'nearest' }); }
  };
  const draw = async () => {
    const q = box.value.trim().toLowerCase();
    if (q.length < 2) { close(); return; }
    let all;
    try { all = await loadIndex(); } catch (e) { mount(list, h('p', { class: 'gs-none' }, 'Search isn’t available right now.')); list.hidden = false; return; }
    if (box.value.trim().toLowerCase() !== q) return;
    // Every word typed must start a word in the name (so "ma" finds Mathematics, not Padma).
    const words = q.split(/\s+/);
    const hits = all.filter((x) => { const has = x.words || (x.words = x.text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)); return words.every((w) => has.some((t) => t.startsWith(w.replace(/[^a-z0-9]/g, '')))); });
    const groups = ['Students', 'Staff', 'Classes'].map((type) => [type, hits.filter((x) => x.type === type).slice(0, 6)]).filter(([, xs]) => xs.length);
    let n = 0;
    mount(list, groups.length ? groups.map(([type, xs]) => h('div', { role: 'group', 'aria-label': type },
      h('div', { class: 'gs-type', 'aria-hidden': 'true' }, type),
      xs.map((x) => h('a', { id: `gs-${n++}`, role: 'option', href: x.href, tabindex: '-1', 'aria-selected': 'false' }, h('b', {}, x.label), h('span', {}, x.sub)))))
      : h('p', { class: 'gs-none', role: 'status' }, `No students, staff or classes match “${box.value.trim()}”.`));
    options = [...list.querySelectorAll('[role=option]')];
    active = -1;
    list.hidden = false;
    box.setAttribute('aria-expanded', 'true');
  };
  box.addEventListener('input', draw);
  box.addEventListener('focus', () => { loadIndex().catch(() => {}); if (box.value.trim().length >= 2) draw(); });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); close(); } else box.value = ''; return; }
    if (list.hidden || !options.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight((active + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight((active - 1 + options.length) % options.length); }
    else if (e.key === 'Enter') { e.preventDefault(); location.href = (options[active] || options[0]).href; }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.gsearch')) close(); });
}

function initMenu() {
  const button = document.querySelector('.site-menu');
  const nav = document.getElementById('primary-nav');
  if (!button || !nav) return;
  const set = (open) => { nav.classList.toggle('open', open); button.setAttribute('aria-expanded', open ? 'true' : 'false'); };
  button.addEventListener('click', () => set(!nav.classList.contains('open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); button.focus(); } });
}

export function initNav() {
  on = true;
  markNav();
  initSearch();
  initMenu();
  const main = document.querySelector('main');
  // Pages redraw their <main>; put the breadcrumbs and title back each time.
  if (main) new MutationObserver(() => decorate()).observe(main, { childList: true });
}
