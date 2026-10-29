// Shared helpers for every Ledger page: Supabase client, session, lookups,
// small DOM builders and the gradebook maths.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- Errors ----------
// Unwraps a Supabase response, throwing its error so pages can show it.
export function must({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

// ---------- URL helpers ----------
export const params = new URLSearchParams(location.search);
export const param = (k) => params.get(k);
export const pageName = () => (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
export const go = (href) => { location.href = href; };

// Pages that exist in a teacher and an admin version.
const SHARED = ['Dashboard', 'Main', 'TestDetail', 'Attendance', 'Marks', 'AddTest', 'NewTest', 'AllClassesStart',
  'AllClasses', 'AllClassesResults', 'SearchStart', 'Search', 'Student', 'MyAccount'];

export function makeLinker(isAdmin) {
  return (name, query) => {
    const base = isAdmin && SHARED.includes(name) ? 'Admin' + name : name;
    const q = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')) : '';
    return base + '.html' + q;
  };
}

// Where to send someone who opened the other role's version of a page.
export function counterpart(page, isAdmin) {
  if (isAdmin) {
    if (page === 'AttendanceView') return 'AdminAttendance';
    if (page === 'MySchedule') return 'AdminTimetable';
    return SHARED.includes(page) ? 'Admin' + page : null;
  }
  if (!page.startsWith('Admin')) return null;
  const base = page.slice(5);
  return SHARED.includes(base) ? base : 'Dashboard';
}

// ---------- Session ----------
let meCache;
export async function currentStaff() {
  if (meCache !== undefined) return meCache;
  const { data: { session } } = await db.auth.getSession();
  if (!session) return (meCache = null);
  // "Keep me signed in" unticked: the session ends with the browser tab.
  if (localStorage.getItem('ledger-keep') === '0' && !sessionStorage.getItem('ledger-live')) {
    await db.auth.signOut();
    return (meCache = null);
  }
  const { data, error } = await db.rpc('claim_staff');
  meCache = error || !data || !data.id ? { noAccess: true, email: session.user.email } : data;
  return meCache;
}

export async function signOut() {
  await db.auth.signOut();
  go('Login.html');
}

// ---------- Cached lookups ----------
const cache = {};
function once(key, fn) { return (cache[key] ||= fn()); }

export const getSettings = () => once('settings', async () => must(await db.from('school_settings').select('*').eq('id', 1).maybeSingle()) || { pass_mark: 35, absent_counts: 'zero' });
export const getYears = () => once('years', async () => must(await db.from('academic_years').select('*').order('starts_on', { ascending: false })));
export const getCurrentYear = async () => (await getYears()).find((y) => y.is_current) || (await getYears())[0];
export const getGrades = () => once('grades', async () => must(await db.from('grade_levels').select('*, class_teacher:staff(id, name)').order('position')));
export const getSubjects = () => once('subjects', async () => must(await db.from('subjects').select('*').order('position')));
export const getStaff = () => once('staff', async () => must(await db.from('staff').select('*').order('name')));
export const getTerms = (yearId) => once('terms' + yearId, async () => must(await db.from('terms').select('*').eq('year_id', yearId).order('position')));
export const getPeriods = () => once('periods', async () => must(await db.from('periods').select('*').order('position')));

const CLASS_SELECT = 'id, year_id, grade_id, subject_id, teacher_id, grade:grade_levels(id, name, position, class_teacher_id), subject:subjects(id, name, short_name, position), teacher:staff(id, name)';
export async function getClasses(yearId) {
  return once('classes' + yearId, async () => {
    const rows = must(await db.from('classes').select(CLASS_SELECT).eq('year_id', yearId));
    return rows.sort((a, b) => a.grade.position - b.grade.position || a.subject.position - b.subject.position);
  });
}
export async function getClass(id) {
  return must(await db.from('classes').select(CLASS_SELECT + ', year:academic_years(id, name, closed, is_current)').eq('id', id).maybeSingle());
}
export const className = (c) => `${c.grade.name} – ${c.subject.name}`;

// ---------- Formatting ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function parseDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day);
}
export function fmtDate(d) {
  const x = parseDate(d);
  return x ? `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()]} ${x.getFullYear()}` : '—';
}
export function fmtDMY(d) {
  const x = parseDate(d);
  return x ? `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}` : '—';
}
export function isoDate(x = new Date()) {
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function ageOn(dob, on = new Date()) {
  const b = parseDate(dob);
  if (!b) return '—';
  let a = on.getFullYear() - b.getFullYear();
  if (on.getMonth() < b.getMonth() || (on.getMonth() === b.getMonth() && on.getDate() < b.getDate())) a--;
  return a;
}
export const n1 = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : String(Math.round(x * 10) / 10));
export const pct = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : `${(Math.round(x * 10) / 10).toFixed(1)}%`);
export const initials = (name) => (name || '?').replace(/^(Ms|Mr|Mrs|Dr)\.?\s+/i, '').trim().charAt(0).toUpperCase();
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
export const studentName = (s) => s.display_name || s.full_name;

// ---------- DOM ----------
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export function mount(target, ...kids) { target.replaceChildren(); append(target, kids); }

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  star: '<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" fill="currentColor" stroke="none"/>',
  doc: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.8 3.1 2.5 3.5 5.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
};
export function icon(name, size = 15) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

// Buttons: a link when given href, otherwise a <button>.
export function btn(label, opts = {}) {
  const cls = ['btn', opts.primary && 'p', opts.small && 's', opts.danger && 'danger', opts.class].filter(Boolean).join(' ');
  const kids = [opts.icon && icon(opts.icon), label];
  if (opts.href) return h('a', { class: cls, href: opts.href }, kids);
  return h('button', { type: opts.type || 'button', class: cls, onclick: opts.onclick, disabled: opts.disabled }, kids);
}

export function pageHead(title, sub, actions = []) {
  return h('div', { class: 'spread page-head' },
    h('div', {}, h('h1', {}, title), sub && h('p', {}, sub)),
    actions.length ? h('div', { class: 'row', style: 'flex-shrink: 0' }, actions) : null);
}
export const backLink = (label, href) => h('a', { class: 'back', href }, icon('back', 14), label);
export const stat = (value, label) => h('div', { class: 'stat' }, h('b', {}, value), h('span', {}, label));
export const card = (title, ...body) => h('section', { class: 'card' }, title && h('div', { class: 'sh' }, title), ...body);
export function emptyState(title, text, action, iconName = 'doc') {
  return h('section', { class: 'empty', 'aria-label': 'Empty state' }, icon(iconName, 48), h('h2', {}, title), text && h('p', {}, text), action);
}
export const loading = (text = 'Loading…') => h('div', { class: 'app-loading', role: 'status' }, text);
export const errorBox = (e) => h('div', { class: 'app-error', role: 'alert' }, 'Something went wrong: ', e.message || String(e));
export function tag(text, kind) { return h('span', { class: 'tag' + (kind ? ' ' + kind : '') }, text); }

// Form controls.
export function field(label, control, opts = {}) {
  return h('label', { class: 'fl', style: opts.style }, label, control);
}
export function input(props = {}) { return h('input', { class: 'in', ...props }); }
export function textarea(props = {}) { const t = h('textarea', { class: 'ta', rows: 3, ...props }); if (props.value) t.value = props.value; return t; }
export function select(options, value, props = {}) {
  const s = h('select', { class: 'in', ...props },
    options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : typeof o === 'object' ? [o.value, o.label] : [o, o];
      return h('option', { value: v ?? '' }, l);
    }));
  if (value !== undefined && value !== null) s.value = String(value);
  return s;
}
export function checkbox(label, checked, props = {}) {
  return h('label', { class: 'ck' }, h('input', { type: 'checkbox', checked: !!checked, ...props }), label);
}

// Tables: cols = [{ label, cls, th: true, render(row) }].
export function table(cols, rows, opts = {}) {
  return h('div', { class: 'tbx' },
    h('table', { class: 'tt' },
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', { scope: 'col', class: c.cls }, c.label)))),
      h('tbody', {}, rows.length ? rows.map((r) => h('tr', { onclick: opts.onRow && (() => opts.onRow(r)) },
        cols.map((c) => h(c.th ? 'th' : 'td', { class: c.cls, scope: c.th ? 'row' : undefined }, c.render ? c.render(r) : r[c.key] ?? '—'))))
        : h('tr', {}, h('td', { colspan: cols.length, class: 'muted', style: 'text-align: center; height: 72px' }, opts.empty || 'Nothing here yet.')))));
}

// Tabs that switch in place (onPick handles the click) or, with hrefFor, link to another URL.
export function tabs(items, active, onPick, { hrefFor } = {}) {
  return h('div', { class: 'tabs', role: 'tablist' }, items.map((t) => {
    const [key, label, count] = Array.isArray(t) ? t : [t, t];
    const on = key === active;
    const props = { class: 'tab' + (on ? ' on' : ''), role: 'tab', 'aria-selected': on ? 'true' : 'false' };
    const kids = [label, count !== undefined && h('span', {}, count)];
    return hrefFor
      ? h('a', { ...props, href: hrefFor(key) }, kids)
      : h('button', { type: 'button', ...props, onclick: () => onPick(key) }, kids);
  }));
}

// ---------- Feedback ----------
export function toast(msg, bad = false) {
  const t = h('div', { class: 'toast' + (bad ? ' bad' : ''), role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

// A modal form. onSubmit(form) may return a promise; throwing keeps it open with the error shown.
export function modal(title, body, { submit = 'Save', danger = false, onSubmit } = {}) {
  const err = h('div', { class: 'app-error', hidden: true });
  const save = btn(submit, { type: 'submit', primary: !danger, danger });
  const dlg = h('dialog', { class: 'modal' },
    h('form', { method: 'dialog' }, h('h2', {}, title), body, err,
      h('div', { class: 'actions' }, btn('Cancel', { onclick: () => dlg.close() }), save)));
  dlg.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    save.disabled = true; err.hidden = true;
    try { await onSubmit?.(e.target); dlg.close(); } catch (x) { err.textContent = x.message; err.hidden = false; } finally { save.disabled = false; }
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}
export function confirmBox(title, text, submit = 'Confirm', danger = true) {
  return new Promise((resolve) => {
    let ok = false;
    const dlg = modal(title, h('p', { style: 'margin: 0; line-height: 1.5' }, text), { submit, danger, onSubmit: () => { ok = true; } });
    dlg.addEventListener('close', () => resolve(ok));
  });
}

// Warns before leaving a page with unsaved edits. Edits are any input inside
// `scope` (controls marked data-no-dirty, like sort pickers, don't count).
// In-app links get a Ledger dialog; closing or reloading the tab gets the browser's own prompt.
export function guardUnsaved(scope) {
  let dirty = false;
  const ask = () => confirmBox('Changes not saved', 'You’ve made changes that haven’t been saved. Are you sure you want to leave this page? Your changes will be lost.', 'Leave without saving');
  const mark = (e) => { if (!e.target.closest('dialog, [data-no-dirty]')) dirty = true; };
  scope.addEventListener('input', mark);
  scope.addEventListener('change', mark);
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('click', async (e) => {
    const a = e.target.closest?.('a[href]');
    if (!dirty || !a || a.target === '_blank' || a.getAttribute('href').startsWith('#')) return;
    e.preventDefault();
    e.stopPropagation();
    if (await ask()) { dirty = false; a.click(); }
  }, true);
  return {
    mark() { dirty = true; },
    clear() { dirty = false; },
    // For in-page navigation done in code (e.g. picking another date).
    async leave(href) { if (!dirty || (await ask())) { dirty = false; if (href) go(href); return true; } return false; },
  };
}

// Runs an async action from a button, disabling it meanwhile and reporting errors.
export async function busy(button, fn, okMsg) {
  if (button) button.disabled = true;
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, true); throw e; } finally { if (button) button.disabled = false; }
}

// ---------- Files ----------
export function downloadCSV(filename, rows) {
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
}
export async function uploadDocument(path, file) {
  must(await db.storage.from('documents').upload(path, file, { upsert: true }));
  return path;
}
export async function openDocument(path) {
  const { signedUrl } = must(await db.storage.from('documents').createSignedUrl(path, 60));
  window.open(signedUrl, '_blank', 'noopener');
}

// ---------- Activity ----------
export async function logActivity(me, kind, studentNameText, detail) {
  await db.from('activity_log').insert({ kind, student_name: studentNameText, detail, by_name: me.name });
}

// ---------- Gradebook maths ----------
// Weighted ("adjusted") marks: each evaluation scaled to its weight, summed.
// With absent_counts = 'excluded', an absence drops that evaluation's weight
// and the result is rescaled to the weights the student actually sat.
export function gradebook(evals, students, marks, settings) {
  const key = (e, s) => e + ':' + s;
  const m = new Map(marks.map((x) => [key(x.evaluation_id, x.student_id), x]));
  const excluded = settings?.absent_counts === 'excluded';
  const passMark = Number(settings?.pass_mark ?? 35);
  const totalMax = evals.reduce((a, e) => a + Number(e.max_marks || 0), 0);
  const totalWeight = evals.reduce((a, e) => a + Number(e.weight || 0), 0);
  const rows = students.map((s) => {
    let raw = 0, adj = 0, w = 0, entered = 0;
    const cells = evals.map((e) => {
      const r = m.get(key(e.id, s.id));
      if (!r) return { state: 'none' };
      entered++;
      if (r.absent) { if (!excluded) w += Number(e.weight || 0); return { state: 'absent' }; }
      const v = Number(r.marks);
      raw += v;
      adj += (v / Number(e.max_marks)) * Number(e.weight || 0);
      w += Number(e.weight || 0);
      return { state: 'mark', value: v };
    });
    const adjusted = entered ? (excluded && w ? (adj / w) * totalWeight : adj) : null;
    return { student: s, cells, raw: entered ? raw : null, rawPct: entered && totalMax ? (raw / totalMax) * 100 : null, adjusted };
  });
  const scored = rows.filter((r) => r.adjusted !== null);
  const avg = scored.length ? scored.reduce((a, r) => a + r.adjusted, 0) / scored.length : null;
  const hi = scored.reduce((a, r) => (!a || r.adjusted > a.adjusted ? r : a), null);
  const lo = scored.reduce((a, r) => (!a || r.adjusted < a.adjusted ? r : a), null);
  const passed = scored.filter((r) => r.adjusted >= (passMark * totalWeight) / 100).length;
  return { rows, totalMax, totalWeight, avg, hi, lo, passed, scoredCount: scored.length, passMark };
}

// Stats for one evaluation's marks.
export function testStats(evaluation, roster, marks) {
  const max = Number(evaluation.max_marks) || 0;
  const byStudent = new Map(marks.map((m) => [m.student_id, m]));
  const wrote = roster.filter((s) => { const m = byStudent.get(s.id); return m && !m.absent && m.marks !== null; });
  const absent = roster.filter((s) => byStudent.get(s.id)?.absent);
  const vals = wrote.map((s) => Number(byStudent.get(s.id).marks));
  const passMark = Math.round(max * 0.35);
  if (!vals.length) return { wrote, absent, avg: null, hi: null, lo: null, passPct: null, passMark, passed: 0 };
  const hiV = Math.max(...vals), loV = Math.min(...vals);
  const passed = vals.filter((v) => v >= passMark).length;
  return {
    wrote, absent, passMark, passed,
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    hi: { value: hiV, student: wrote[vals.indexOf(hiV)] },
    lo: { value: loV, student: wrote[vals.indexOf(loV)] },
    passPct: (passed / roster.length) * 100,
  };
}

// Students on a class roster, in roll-number order.
export async function getRoster(classId) {
  const rows = must(await db.from('enrollments').select('student:students(*)').eq('class_id', classId));
  return rows.map((r) => r.student).filter(Boolean).sort((a, b) => (a.roll_no ?? 999) - (b.roll_no ?? 999) || a.full_name.localeCompare(b.full_name));
}
