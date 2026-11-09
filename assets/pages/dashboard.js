// Dashboard: what needs attention today, for a teacher or for the whole school.
import { db, must, h, mount, getCurrentYear, getClasses, getGrades, getSettings, getPeriods, className, gradebook, isoDate, fmtDate, fmtDMY,
  greeting, n1, btn, card, stat, pageHead, emptyState, loading, errorBox, readOpened } from '../lib.js';
import { currentTerm } from './scheduling.js';
import { scheduleCard } from './schedule.js';

const item = (title, sub, action) => h('div', { class: 'item' }, h('div', { class: 'it' }, h('b', {}, title), h('span', {}, sub)), action);

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

  // Today's attendance for each grade this teacher is class teacher of.
  const attendance = await Promise.all(homeroom.map(async (g) => {
    const [{ count: marked }, { count: total }] = await Promise.all([
      db.from('attendance').select('student_id', { count: 'exact', head: true }).eq('grade_id', g.id).eq('on_date', today),
      db.from('students').select('id', { count: 'exact', head: true }).eq('grade_id', g.id).eq('status', 'active').not('roll_no', 'is', null),
    ]);
    const open = (label) => btn(label, { small: true, primary: true, href: ctx.link('Attendance', { grade: g.id }) });
    if (!marked) return item(g.name, 'Attendance hasn’t been taken yet today.', open('Take attendance'));
    if (marked < total) return item(g.name, `Attendance is incomplete: ${marked} of ${total} students marked.`, open('Finish attendance'));
    return item(g.name, 'Attendance has been taken today. You’re all set.', h('span', { class: 'tag ok' }, 'Done'));
  }));

  const classCards = own.map((c) => {
    const roster = rosterOf(c.id);
    const ev = evals.filter((e) => e.class_id === c.id);
    const gb = gradebook(ev, roster, marks.filter((m) => ev.some((e) => e.id === m.evaluation_id)), settings);
    return h('a', { href: ctx.link('Main', { class: c.id }), class: 'card', style: 'text-decoration: none; color: inherit' },
      h('div', { class: 'sh' }, className(c)),
      h('div', { class: 'stats' }, stat(roster.length, 'Students'), stat(ev.length, 'Evaluations'), stat(n1(gb.avg), 'Class avg (adjusted)')));
  });

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead(`${greeting()}, ${ctx.me.name}`, `Academic Year ${year.name}`),
    attendance.length ? card(`Today’s Attendance · ${fmtDMY(today)}`, h('div', {}, attendance)) : null,
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
const more = (text, href) => h('a', { href, style: 'font-size: 13px; font-weight: 400' }, text);
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
  const attendanceCard = lazyCard(titled('Missing attendance', more('Open attendance', 'AdminAttendance.html')), async () => {
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

  // 2b. Staff absences: once today's staff register is taken, who is away and the periods they'd teach.
  const registerHref = `AdminStaffAttendance.html?date=${today}`;
  const absenceCard = lazyCard(titled('Staff absences', more('Open staff register', registerHref)), async () => {
    if (!schoolToday) return empty('No school today.', 'ok');
    const [absent, staff, slots, taken] = await Promise.all([absentTodayP, staffP, slotsP,
      db.from('staff_attendance').select('staff_id', { count: 'exact', head: true }).eq('on_date', today).is('leave_id', null)]);
    const away = staff.filter((s) => absent.has(s.id));
    const dow = dateOf(today).getDay();
    const entry = (s) => {
      const subjects = [...new Set(classes.filter((c) => c.teacher_id === s.id).map((c) => c.subject.name))];
      const hit = slots.filter((x) => x.teacher_id === s.id && x.day === dow)
        .sort((a, b) => periods.findIndex((p) => p.id === a.period_id) - periods.findIndex((p) => p.id === b.period_id));
      return h('li', {},
        h('a', { href: `AdminStaffProfile.html?id=${s.id}` }, h('b', {}, s.name),
          h('span', {}, [s.role === 'admin' ? 'Admin' : 'Teacher', subjects.join(', '), absent.get(s.id)].filter(Boolean).join(' · '))),
        hit.length ? h('ul', { class: 'dash-sub' }, hit.map((x) => {
          const p = periods.find((q) => q.id === x.period_id);
          const cover = covered(today, x);
          return h('li', {}, h('a', { href: timetableHref(x.grade_id) }, `${gradeName(x.grade_id)} – ${x.subject.name}, ${p?.name || 'Period'}: `,
            cover ? h('span', { class: 'tag ok' }, `Cover: ${cover.teacher_name}`) : h('span', { class: 'tag bad' }, 'No cover')));
        })) : h('span', { class: 'muted small' }, 'No periods today.'));
    };
    // Staff on leave are marked automatically; anything else means the register was taken.
    if (!taken.count) {
      return [
        h('p', { style: 'margin: 0; font-size: 14px' }, 'Today’s staff attendance hasn’t been taken yet.'),
        btn('Take Attendance', { primary: true, href: registerHref }),
        away.length ? [h('p', { class: 'muted small', style: 'margin: 12px 0 0' }, 'Already on leave today'), h('ul', { class: 'dash-list' }, away.map(entry))] : null,
      ];
    }
    if (!away.length) return empty('Everyone is present today.', 'ok');
    return [
      h('a', { class: 'dash-headline', href: registerHref }, `${away.length} staff member${away.length === 1 ? '' : 's'} absent today`),
      h('ul', { class: 'dash-list' }, away.map(entry)),
    ];
  });

  // 3. Today's timetable (or the next school day's), one tab per grade.
  const dayLabel = schoolToday ? `Today · ${DAY_NAMES[dateOf(shown).getDay()]}, ${fmtDate(shown)}` : `No school today · showing ${DAY_NAMES[dateOf(shown).getDay()]}, ${fmtDate(shown)}`;
  let ttGrade = null;
  const ttLink = more('Open full timetable', 'AdminTimetable.html');
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

  // 4. Pending admissions and transfers, most recently opened (then newest) first.
  const opened = readOpened();
  const byRecent = (key) => (a, b) => (opened[key(b)] || 0) - (opened[key(a)] || 0) || String(b.created_at).localeCompare(String(a.created_at));
  const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const appsP = db.from('applications').select('id, full_name, status, documents, created_at, grade:grade_levels(name)').in('status', ['new', 'in_review', 'accepted']).then(must)
    .then((rows) => rows.sort(byRecent((a) => 'app:' + a.id)));
  const transfersP = db.from('transfers').select('*').eq('status', 'pending').then(must).then((rows) => rows.sort(byRecent((t) => 'transfer:' + t.id)));
  const row = (title, sub, status, action) => h('div', { class: 'item dash-item' },
    h('div', { class: 'it' }, h('b', {}, title, status ? [' ', h('span', { class: 'tag' + (status[1] ? ' ' + status[1] : '') }, status[0])] : null), h('span', {}, sub)), action);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const countTag = (p) => { const t = h('span', { class: 'count tag' }, '…'); p.then((rows) => { t.textContent = rows.length; }).catch(() => {}); return t; };
  const heading = (title, p, href, what) => {
    const link = more('View all', href);
    p.then((rows) => { link.textContent = `View all ${plural(rows.length, what, what + 's')}`; }).catch(() => {});
    return titled(h('span', { class: 'row' }, title, countTag(p)), link);
  };

  const appStatus = (a) => (Object.values(a.documents || {}).includes('missing') ? ['Documents missing', 'warn']
    : a.status === 'accepted' ? ['Ready to enroll', 'ok'] : a.status === 'in_review' ? ['In review', ''] : ['New application', '']);
  const admissionsCard = lazyCard(heading('Admissions', appsP, 'AdminAdmissions.html', 'admission'), async () => {
    const [apps, transfers] = await Promise.all([appsP, transfersP]);
    if (!apps.length) return empty('No applications waiting.', 'ok');
    return apps.slice(0, 5).map((a) => {
      const st = appStatus(a);
      const tr = transfers.find((t) => t.kind === 'incoming' && same(t.student_name, a.full_name));
      return row(a.full_name, [a.grade?.name || 'Grade not set', tr ? [' · Also an incoming transfer from ', tr.from_place || '—', ' · ', h('a', { href: `AdminTransfers.html?id=${tr.id}` }, 'Open transfer')] : null], st,
        btn(st[0] === 'Ready to enroll' ? 'Enroll' : 'Review', { small: true, primary: st[0] === 'Ready to enroll', href: `AdminApplication.html?id=${a.id}` }));
    });
  });

  const KIND = { incoming: 'Incoming', outgoing: 'Outgoing', internal: 'Internal' };
  const transfersCard = lazyCard(heading('Transfers', transfersP, 'AdminTransfers.html', 'transfer'), async () => {
    const [apps, transfers] = await Promise.all([appsP, transfersP]);
    if (!transfers.length) return empty('No transfers in progress.', 'ok');
    return transfers.slice(0, 5).map((t) => {
      const app = t.kind === 'incoming' && apps.find((a) => same(a.full_name, t.student_name));
      return row(t.student_name, [`${t.from_place || '—'} → ${t.to_place || '—'}`, app ? [' · Same student as the admission · ', h('a', { href: `AdminApplication.html?id=${app.id}` }, 'Review application')] : null],
        [KIND[t.kind], ''], btn('Open', { small: true, href: `AdminTransfers.html?id=${t.id}` }));
    });
  });

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead(`${greeting()}, ${ctx.me.name}`, `${DAY_NAMES[new Date().getDay()]}, ${fmtDate(today)} · Academic Year ${year.name}`),
    h('div', { class: 'cols' }, h('div', { class: 'stack' }, attendanceCard, absenceCard), timetableCard),
    h('div', { class: 'cols' }, admissionsCard, transfersCard)));
}

export function render(ctx) {
  return ctx.isAdmin ? admin(ctx) : teacher(ctx);
}
