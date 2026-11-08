// Dashboard: what needs attention today, for a teacher or for the whole school.
import { db, must, h, mount, getCurrentYear, getClasses, getGrades, getSettings, getPeriods, className, gradebook, isoDate, fmtDate, fmtDMY,
  greeting, n1, btn, card, stat, pageHead, studentName, input, emptyState, loading, errorBox, readOpened } from '../lib.js';
import { currentTerm } from './scheduling.js';
import { scheduleCard } from './schedule.js';

const item = (title, sub, action) => h('div', { class: 'item' }, h('div', { class: 'it' }, h('b', {}, title), h('span', {}, sub)), action);
const count = (n) => h('span', { class: 'count tag' }, n);
const section = (title, n, href, items, emptyText) => card(
  h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, h('span', {}, title),
    h('span', { class: 'row' }, n !== null ? count(n) : null, href ? h('a', { href, style: 'font-size: 13px; font-weight: 400' }, 'View all') : null)),
  h('div', {}, items.length ? items : h('p', { class: 'muted small', style: 'margin: 0' }, emptyText)));

async function teacher(ctx) {
  const year = await getCurrentYear();
  const today = isoDate();
  const [classes, grades, settings] = await Promise.all([getClasses(year.id), getGrades(), getSettings()]);
  const own = classes.filter((c) => c.teacher_id === ctx.me.id);
  const homeroom = grades.filter((g) => g.class_teacher_id === ctx.me.id);
  const classIds = own.map((c) => c.id);

  const [evals, enrol] = await Promise.all([
    classIds.length ? db.from('evaluations').select('*').in('class_id', classIds).order('held_on').then(must) : [],
    classIds.length ? db.from('enrollments').select('class_id, student:students(id, full_name, display_name, grade_id, roll_no)').in('class_id', classIds).then(must) : [],
  ]);
  const marks = evals.length ? must(await db.from('marks').select('evaluation_id, student_id, marks, absent').in('evaluation_id', evals.map((e) => e.id))) : [];
  const rosterOf = (cid) => enrol.filter((e) => e.class_id === cid).map((e) => e.student);

  // Grades due: tests on or before today with marks missing for someone on the roster.
  const due = evals.filter((e) => !e.held_on || e.held_on <= today).map((e) => {
    const roster = rosterOf(e.class_id);
    const got = new Set(marks.filter((m) => m.evaluation_id === e.id && (m.absent || m.marks !== null)).map((m) => m.student_id));
    return { e, missing: roster.filter((s) => !got.has(s.id)).length };
  }).filter((x) => x.missing > 0);

  // Tasks: today's attendance, pending documents, tests without notes.
  const tasks = [];
  for (const g of homeroom) {
    const { count: n } = await db.from('attendance').select('student_id', { count: 'exact', head: true }).eq('grade_id', g.id).eq('on_date', today);
    if (!n) tasks.push(item('Take today’s attendance', `${g.name} · Class teacher`, btn('Open', { small: true, href: ctx.link('Attendance', { grade: g.id }) })));
  }
  const studentIds = [...new Set(enrol.map((e) => e.student.id))];
  const docs = studentIds.length ? must(await db.from('student_documents').select('student_id, name').eq('submitted', false).in('student_id', studentIds)) : [];
  const docsBy = docs.reduce((m, d) => m.set(d.student_id, (m.get(d.student_id) || 0) + 1), new Map());
  docsBy.forEach((n, sid) => {
    const s = enrol.find((e) => e.student.id === sid).student;
    tasks.push(item('Pending documents', `${studentName(s)} · ${n} certificate${n > 1 ? 's' : ''} not submitted`, btn('View', { small: true, href: ctx.link('Student', { id: sid }) + '#documents' })));
  });
  own.forEach((c) => {
    const noNotes = evals.filter((e) => e.class_id === c.id && !e.notes).length;
    if (noNotes) tasks.push(item('Add remarks to evaluations', `${className(c)} · ${noNotes} evaluation${noNotes > 1 ? 's' : ''} without notes`, btn('Open', { small: true, href: ctx.link('Main', { class: c.id }) })));
  });

  const search = h('form', { action: ctx.link('Search').split('?')[0], method: 'get', class: 'row', style: 'flex-wrap: nowrap' },
    input({ name: 'q', placeholder: 'Search students by name or adm. no.', 'aria-label': 'Search students', style: 'width: 300px' }),
    btn('Search', { type: 'submit', icon: 'search' }));

  const classCards = own.map((c) => {
    const roster = rosterOf(c.id);
    const ev = evals.filter((e) => e.class_id === c.id);
    const gb = gradebook(ev, roster, marks.filter((m) => ev.some((e) => e.id === m.evaluation_id)), settings);
    return h('a', { href: ctx.link('Main', { class: c.id }), class: 'card', style: 'text-decoration: none; color: inherit' },
      h('div', { class: 'sh' }, className(c)),
      h('div', { class: 'stats' }, stat(roster.length, 'Students'), stat(ev.length, 'Evaluations'), stat(n1(gb.avg), 'Class avg (adjusted)')));
  });

  const announcements = must(await db.from('announcements').select('*').order('posted_at', { ascending: false }).limit(3));
  mount(ctx.main, h('div', { class: 'stack' },
    pageHead(`${greeting()}, ${ctx.me.name}`, `Here’s what needs your attention · Academic Year ${year.name}`, [search]),
    h('div', { class: 'grid3' },
      section('Grades Due', due.length, null, due.map(({ e, missing }) => {
        const c = own.find((x) => x.id === e.class_id);
        return item(e.name, `${className(c)} · Max ${n1(Number(e.max_marks))} · ${missing} student${missing > 1 ? 's' : ''} without marks`, btn('Enter marks', { small: true, href: ctx.link('Marks', { test: e.id }) }));
      }), 'All marks are entered.'),
      section('Tasks', tasks.length, null, tasks, 'Nothing pending.'),
      section('Announcements', null, null, announcements.map((a) => item(a.title, `${a.body} · Posted ${fmtDMY(a.posted_at)}`)), 'No announcements.')),
    await scheduleCard(ctx),
    h('div', { class: 'spread' }, h('h2', { style: 'margin: 0; font-size: 18px' }, 'My Classes'), h('a', { href: ctx.link('AllClassesStart'), style: 'font-size: 13px' }, 'Browse all classes')),
    classCards.length ? h('div', { class: 'grid3' }, classCards) : emptyState('No classes assigned', 'The school office assigns classes to teachers.', null, 'users')));
}

// ---------- Admin dashboard: today's to-dos, today's timetable, recent work ----------

// Substitute cover for absent teachers' periods. Ledger doesn't record cover yet,
// so this MOCK list is empty and every period an absent teacher has is flagged
// "No cover". Shape: { on_date: 'YYYY-MM-DD', grade_id, period_id, teacher_name }.
const MOCK_COVER = [];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hm = (t) => (t ? t.slice(0, 5) : '');
const span = (p) => (p.starts_at ? `${hm(p.starts_at)}–${hm(p.ends_at)}` : '');
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage off */ } };
const recall = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const dateOf = (iso) => new Date(iso + 'T00:00');
const plusDays = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoDate(d); };
const empty = (text, kind) => h('p', { class: 'dash-empty' + (kind ? ' ' + kind : ''), role: 'status' }, text);
const titled = (title, extra) => h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, h('span', {}, title), extra);

// Tabs with the ARIA tab pattern: arrow keys, Home and End move between tabs.
let tabUid = 0;
function tabset(label, items, selected, panelFor, storeKey) {
  const base = 'dtab' + ++tabUid;
  const panel = h('div', { role: 'tabpanel', id: base + '-panel', tabindex: '0', class: 'dash-panel' });
  const buttons = items.map((it) => h('button', { type: 'button', role: 'tab', class: 'tab', id: `${base}-${it.key}`, 'aria-controls': panel.id }, it.label));
  const pick = (key, focus) => {
    items.forEach((it, i) => {
      const on = it.key === key;
      buttons[i].setAttribute('aria-selected', on ? 'true' : 'false');
      buttons[i].tabIndex = on ? 0 : -1;
      buttons[i].classList.toggle('on', on);
      if (on && focus) buttons[i].focus();
    });
    panel.setAttribute('aria-labelledby', `${base}-${key}`);
    mount(panel, panelFor(key));
    if (storeKey) remember(storeKey, String(key));
  };
  buttons.forEach((b, i) => b.addEventListener('click', () => pick(items[i].key)));
  const list = h('div', { class: 'tabs dash-tabs', role: 'tablist', 'aria-label': label });
  list.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    pick(items[(to + buttons.length) % buttons.length].key, true);
  });
  mount(list, buttons);
  pick(items.some((it) => it.key === selected) ? selected : items[0].key);
  return h('div', { class: 'stack', style: 'gap: 12px' }, list, panel);
}

// A card that shows "Loading…" until its contents arrive.
function lazyCard(title, build) {
  const body = h('div', {}, loading());
  const el = card(title, body);
  build().then((kids) => mount(body, kids)).catch((e) => mount(body, errorBox(e)));
  return el;
}

async function admin(ctx) {
  const year = await getCurrentYear();
  const today = isoDate();
  const now = new Date().toTimeString().slice(0, 8);
  const [settings, periods, grades, classes, term] = await Promise.all([getSettings(), getPeriods(), getGrades(), getClasses(year.id), currentTerm(year)]);
  const lastDow = settings.week_days === 'Mon–Fri' ? 5 : 6;
  const isSchoolDay = (iso) => { const d = dateOf(iso).getDay(); return d >= 1 && d <= lastDow; };
  let shown = today;
  while (!isSchoolDay(shown)) shown = plusDays(shown, 1);
  const schoolToday = shown === today;
  const classPeriods = periods.filter((p) => p.kind === 'class');
  const firstPeriod = classPeriods[0];

  // Shared data, loaded once and used by several cards.
  const staffP = db.from('staff').select('id, name, role').eq('status', 'active').order('name').then(must);
  const slotsP = term ? db.from('timetable_slots').select('*, subject:subjects(id, name), teacher:staff(id, name), room:rooms(id, name)').eq('term_id', term.id).then(must) : Promise.resolve([]);
  const absentOn = async (iso) => {
    const [marked, leaves] = await Promise.all([
      db.from('staff_attendance').select('staff_id, remark').eq('on_date', iso).eq('status', 'A').then(must),
      db.from('staff_leaves').select('staff_id, reason').lte('starts_on', iso).gte('ends_on', iso).then(must),
    ]);
    const out = new Map();
    marked.forEach((r) => out.set(r.staff_id, r.remark && r.remark !== 'On leave' ? r.remark : ''));
    leaves.forEach((l) => out.set(l.staff_id, l.reason ? `On leave · ${l.reason}` : 'On leave'));
    return out;
  };
  const absentTodayP = absentOn(today);
  const absentShownP = schoolToday ? absentTodayP : absentOn(shown);
  const covered = (iso, s) => MOCK_COVER.find((c) => c.on_date === iso && c.grade_id === s.grade_id && c.period_id === s.period_id);
  const gradeName = (id) => grades.find((g) => g.id === id)?.name || '—';
  const timetableHref = (gradeId) => `AdminTimetable.html?${new URLSearchParams({ by: 'grade', id: gradeId, ...(term ? { term: term.id } : {}) })}`;

  // 2a. Missing attendance: homeroom attendance for each grade with students.
  const attendanceCard = lazyCard('Missing attendance', async () => {
    if (!schoolToday) return empty(`No school today. Attendance is next due on ${DAY_NAMES[dateOf(shown).getDay()]}, ${fmtDate(shown)}.`, 'ok');
    const [students, att] = await Promise.all([
      db.from('students').select('grade_id').eq('status', 'active').not('roll_no', 'is', null).then(must),
      db.from('attendance').select('grade_id').eq('on_date', today).then(must),
    ]);
    const due = firstPeriod ? `Due by the end of ${firstPeriod.name} (${hm(firstPeriod.ends_at)})` : 'Due at the start of the day';
    if (firstPeriod?.ends_at && now < firstPeriod.ends_at) return empty(`Attendance not due yet. ${due}.`);
    const missing = grades.filter((g) => students.some((s) => s.grade_id === g.id) && !att.some((a) => a.grade_id === g.id));
    if (!missing.length) return empty('All classes have taken attendance today.', 'ok');
    return [
      h('a', { class: 'dash-headline', href: 'AdminAttendance.html' }, `${missing.length} class${missing.length === 1 ? ' hasn’t' : 'es haven’t'} taken attendance yet`),
      h('ul', { class: 'dash-list' }, missing.map((g) => {
        const ct = g.class_teacher;
        return h('li', {}, h('a', { href: `AdminAttendance.html?grade=${g.id}` }, h('b', {}, g.name),
          h('span', {}, ct ? `Class teacher: ${ct.name}` : h('span', { class: 'tag warn' }, 'No class teacher'), ` · ${due}`)));
      })),
    ];
  });

  // 2b. Staff absences today, with the periods they would have taught.
  const absenceCard = lazyCard('Staff absences', async () => {
    const [absent, staff, slots] = await Promise.all([absentTodayP, staffP, slotsP]);
    const away = staff.filter((s) => absent.has(s.id));
    if (!away.length) return empty('All staff present today.', 'ok');
    const dow = dateOf(today).getDay();
    return [
      h('a', { class: 'dash-headline', href: `AdminStaffAttendance.html?date=${today}` }, `${away.length} staff member${away.length === 1 ? '' : 's'} absent today`),
      h('ul', { class: 'dash-list' }, away.map((s) => {
        const subjects = [...new Set(classes.filter((c) => c.teacher_id === s.id).map((c) => c.subject.name))];
        const hit = schoolToday ? slots.filter((x) => x.teacher_id === s.id && x.day === dow)
          .sort((a, b) => periods.findIndex((p) => p.id === a.period_id) - periods.findIndex((p) => p.id === b.period_id)) : [];
        return h('li', {},
          h('a', { href: `AdminStaffProfile.html?id=${s.id}` }, h('b', {}, s.name),
            h('span', {}, [s.role === 'admin' ? 'Admin' : 'Teacher', subjects.join(', '), absent.get(s.id)].filter(Boolean).join(' · '))),
          hit.length ? h('ul', { class: 'dash-sub' }, hit.map((x) => {
            const p = periods.find((q) => q.id === x.period_id);
            const cover = covered(today, x);
            return h('li', {}, h('a', { href: timetableHref(x.grade_id) }, `${gradeName(x.grade_id)} – ${x.subject.name}, ${p?.name || 'Period'}: `,
              cover ? h('span', { class: 'tag ok' }, `Cover: ${cover.teacher_name}`) : h('span', { class: 'tag bad' }, 'No cover')));
          })) : h('span', { class: 'muted small' }, schoolToday ? 'No periods today.' : ''));
      })),
    ];
  });

  // 3. Today's timetable (or the next school day's), one tab per grade.
  const dayLabel = schoolToday ? `Today · ${DAY_NAMES[dateOf(shown).getDay()]}, ${fmtDate(shown)}` : `No school today · showing ${DAY_NAMES[dateOf(shown).getDay()]}, ${fmtDate(shown)}`;
  let ttGrade = null;
  const ttLink = h('a', { href: 'AdminTimetable.html', style: 'font-size: 13px; font-weight: 400' }, 'Open full timetable');
  const timetableCard = lazyCard(titled('Today’s timetable', ttLink), async () => {
    const [slots, absent] = await Promise.all([slotsP, absentShownP]);
    const dow = dateOf(shown).getDay();
    const day = slots.filter((x) => x.day === dow);
    const tabsFor = grades.filter((g) => day.some((x) => x.grade_id === g.id));
    if (!term || !tabsFor.length) return [h('p', { class: 'muted small', style: 'margin: 0' }, dayLabel), empty(term ? 'No periods are scheduled for this day yet.' : 'No term is set up for this year yet.')];
    const panelFor = (gid) => {
      ttGrade = Number(gid);
      ttLink.href = timetableHref(ttGrade);
      ttLink.textContent = `Open full timetable for ${gradeName(ttGrade)}`;
      return h('ol', { class: 'dash-day', 'aria-label': `${gradeName(ttGrade)} periods` }, periods.map((p) => {
        if (p.kind === 'break') return h('li', { class: 'brk' }, h('span', { class: 'pn' }, h('b', {}, p.name), h('small', {}, span(p))));
        const x = day.find((y) => y.grade_id === ttGrade && y.period_id === p.id);
        const live = schoolToday && p.starts_at && now >= p.starts_at && now < p.ends_at;
        const out = x?.teacher_id && absent.has(x.teacher_id);
        const cover = out && covered(shown, x);
        return h('li', { class: [live && 'now', out && !cover && 'hit'].filter(Boolean).join(' '), 'aria-current': live ? 'time' : null },
          h('span', { class: 'pn' }, h('b', {}, p.name), h('small', {}, span(p))),
          x ? h('span', { class: 'what' },
            h('b', {}, x.subject.name, live ? [' ', h('span', { class: 'tag dk' }, 'Now')] : null),
            h('span', {}, x.teacher ? x.teacher.name : h('span', { class: 'tag warn' }, 'Unassigned'), ' · ', x.room?.name || 'No room',
              out ? [' ', cover ? h('span', { class: 'tag ok' }, `Teacher absent · cover: ${cover.teacher_name}`) : h('span', { class: 'tag bad' }, 'Teacher absent · no cover')] : null))
            : h('span', { class: 'what muted' }, 'Free period'));
      }));
    };
    const saved = Number(recall('ledger-dash-grade'));
    return [h('p', { class: 'muted small', style: 'margin: 0' }, dayLabel, term ? ` · ${term.name}` : ''),
      tabset('Grades', tabsFor.map((g) => ({ key: g.id, label: g.name })), saved, panelFor, 'ledger-dash-grade')];
  });

  // 4. Recent activity: admissions, transfers and missing grades in one tabbed card.
  const activityCard = lazyCard('Recent activity', async () => {
    const opened = readOpened();
    const ids = classes.map((c) => c.id);
    const [apps, transfers, evals, enrol] = await Promise.all([
      db.from('applications').select('id, full_name, status, documents, created_at, grade:grade_levels(name)').in('status', ['new', 'in_review', 'accepted']).then(must),
      db.from('transfers').select('*').eq('status', 'pending').then(must),
      ids.length ? db.from('evaluations').select('id, name, class_id, held_on').in('class_id', ids).lte('held_on', today).then(must) : [],
      ids.length ? db.from('enrollments').select('class_id, student_id').in('class_id', ids).then(must) : [],
    ]);
    const marks = evals.length ? must(await db.from('marks').select('evaluation_id, student_id').in('evaluation_id', evals.map((e) => e.id))) : [];
    // Most recently opened first, then most recently created or tested.
    const byRecent = (key, when) => (a, b) => (opened[key(b)] || 0) - (opened[key(a)] || 0) || String(when(b)).localeCompare(String(when(a)));
    const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

    const appStatus = (a) => (Object.values(a.documents || {}).includes('missing') ? ['Documents missing', 'warn']
      : a.status === 'accepted' ? ['Ready to enroll', 'ok'] : a.status === 'in_review' ? ['In review', ''] : ['New application', '']);
    apps.sort(byRecent((a) => 'app:' + a.id, (a) => a.created_at));
    transfers.sort(byRecent((t) => 'transfer:' + t.id, (t) => t.created_at));
    const missing = classes.map((c) => {
      const roster = enrol.filter((e) => e.class_id === c.id).length;
      const pending = evals.filter((e) => e.class_id === c.id && marks.filter((m) => m.evaluation_id === e.id).length < roster);
      return { c, pending, last: pending.map((e) => e.held_on).sort().at(-1) || '' };
    }).filter((x) => x.pending.length).sort(byRecent((x) => 'class:' + x.c.id, (x) => x.last));

    const KIND = { incoming: 'Incoming', outgoing: 'Outgoing', internal: 'Internal' };
    const row = (title, sub, status, action) => h('div', { class: 'item dash-item' },
      h('div', { class: 'it' }, h('b', {}, title, status ? [' ', h('span', { class: 'tag' + (status[1] ? ' ' + status[1] : '') }, status[0])] : null), h('span', {}, sub)), action);
    const viewAll = (text, href) => h('a', { class: 'dash-all', href }, text);
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

    const panels = {
      admissions: () => apps.length ? [apps.slice(0, 5).map((a) => {
        const st = appStatus(a);
        const tr = transfers.find((t) => t.kind === 'incoming' && same(t.student_name, a.full_name));
        return row(a.full_name, [a.grade?.name || 'Grade not set', tr ? [' · Also an incoming transfer from ', tr.from_place || '—', ' · ', h('a', { href: `AdminTransfers.html?id=${tr.id}` }, 'Open transfer')] : null], st,
          btn(a.status === 'accepted' && st[0] !== 'Documents missing' ? 'Enroll' : 'Review', { small: true, primary: st[0] === 'Ready to enroll', href: `AdminApplication.html?id=${a.id}` }));
      }), viewAll(`View all ${plural(apps.length, 'admission', 'admissions')}`, 'AdminAdmissions.html')] : [empty('No applications waiting.', 'ok'), viewAll('View all admissions', 'AdminAdmissions.html')],
      transfers: () => transfers.length ? [transfers.slice(0, 5).map((t) => {
        const app = t.kind === 'incoming' && apps.find((a) => same(a.full_name, t.student_name));
        return row(t.student_name, [`${t.from_place || '—'} → ${t.to_place || '—'}`, app ? [' · Same student as the admission · ', h('a', { href: `AdminApplication.html?id=${app.id}` }, 'Review application')] : null],
          [KIND[t.kind], ''], btn('Open', { small: true, href: `AdminTransfers.html?id=${t.id}` }));
      }), viewAll(`View all ${plural(transfers.length, 'transfer', 'transfers')}`, 'AdminTransfers.html')] : [empty('No transfers in progress.', 'ok'), viewAll('View all transfers', 'AdminTransfers.html')],
      grades: () => missing.length ? [missing.slice(0, 5).map(({ c, pending }) => row(className(c),
        `Not entered: ${pending.map((e) => e.name).slice(0, 3).join(', ')}${pending.length > 3 ? ` and ${pending.length - 3} more` : ''}`, null,
        btn('Open', { small: true, href: `AdminMain.html?class=${c.id}` }))), viewAll(`View all classes (${plural(missing.length, 'class', 'classes')} missing grades)`, 'AdminAllClassesStart.html')]
        : [empty('Every class has its marks entered.', 'ok'), viewAll('View all classes', 'AdminAllClassesStart.html')],
    };
    const items = [
      { key: 'admissions', label: `Admissions (${apps.length})`, n: apps.length },
      { key: 'transfers', label: `Transfers (${transfers.length})`, n: transfers.length },
      { key: 'grades', label: `Missing grades (${missing.length})`, n: missing.length },
    ];
    // The tab picked last time; otherwise the one with the most waiting.
    const most = [...items].sort((a, b) => b.n - a.n)[0].key;
    return tabset('Recent activity', items, recall('ledger-dash-activity') || most, (k) => panels[k](), 'ledger-dash-activity');
  });

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead(`${greeting()}, ${ctx.me.name}`, `${DAY_NAMES[new Date().getDay()]}, ${fmtDate(today)} · Academic Year ${year.name}`),
    h('div', { class: 'cols dash-top' },
      h('section', { class: 'stack', 'aria-labelledby': 'needs-attention' }, h('h2', { id: 'needs-attention', class: 'dash-h2' }, 'Needs attention today'), attendanceCard, absenceCard),
      h('section', { class: 'stack', 'aria-label': 'Timetable' }, h('h2', { class: 'dash-h2' }, 'Schedule'), timetableCard)),
    activityCard));
}

export function render(ctx) {
  return ctx.isAdmin ? admin(ctx) : teacher(ctx);
}
