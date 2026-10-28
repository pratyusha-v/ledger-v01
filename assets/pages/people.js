// Permissions (admin): staff directory, roles and permissions, school settings.
import { db, must, h, mount, param, go, getYears, getGrades, getCurrentYear, getClasses, className, btn, card, table, tabs, tag,
  pageHead, emptyState, input, select, field, checkbox, modal, toast, busy, confirmBox, downloadCSV } from '../lib.js';

const STATUS_TAG = { active: ['Active', 'ok'], invited: ['Invited', 'warn'], inactive: ['Inactive', 'bad'] };
const setupNote = (email) => h('p', { class: 'small', style: 'margin: 0; line-height: 1.5' },
  `Ask them to open Ledger’s sign-in page, choose “Set up your account” and use ${email}. They get access as soon as they sign in.`);

async function staffPage(ctx) {
  const tab = param('tab') || 'all';
  const status = param('status') || '';
  const year = await getCurrentYear();
  const [staff, classes, grades] = await Promise.all([db.from('staff').select('*').order('name').then(must), getClasses(year.id), getGrades()]);
  const rows = staff.filter((s) => (tab === 'all' || s.role === (tab === 'teachers' ? 'teacher' : 'admin')) && (!status || s.status === status));
  const url = (q) => 'AdminStaff.html?' + new URLSearchParams({ tab, status, ...q });
  const classesOf = (s) => [...grades.filter((g) => g.class_teacher_id === s.id).map((g) => `★ ${g.name}`), ...classes.filter((c) => c.teacher_id === s.id).map(className)];

  const invite = () => {
    const name = input({ placeholder: 'e.g. Ms. Lakshmi' });
    const email = input({ type: 'email', placeholder: 'name@school.org' });
    const role = select([['teacher', 'Teacher'], ['admin', 'Admin']], 'teacher');
    modal('Invite staff', [h('div', { class: 'grid2' }, field('Name', name), field('Email', email), field('Role', role))], {
      submit: 'Invite',
      onSubmit: async () => {
        if (!name.value.trim() || !email.value.trim()) throw new Error('Name and email are required.');
        must(await db.from('staff').insert({ name: name.value.trim(), email: email.value.trim().toLowerCase(), role: role.value, status: 'invited' }));
        staffPage(ctx);
        modal('Invitation added', setupNote(email.value.trim()), { submit: 'Done' });
      },
    });
  };

  const edit = (s) => {
    const name = input({ value: s.name });
    const email = input({ type: 'email', value: s.email, disabled: !!s.user_id });
    const phone = input({ value: s.phone || '' });
    const role = select([['teacher', 'Teacher'], ['admin', 'Admin']], s.role, { disabled: s.id === ctx.me.id });
    const st = select([['active', 'Active'], ['invited', 'Invited'], ['inactive', 'Inactive']], s.status, { disabled: s.id === ctx.me.id });
    const homeroom = select([['', 'None'], ...grades.map((g) => [g.id, g.name])], grades.find((g) => g.class_teacher_id === s.id)?.id ?? '');
    modal(s.name, [h('div', { class: 'grid2' }, field('Name', name), field('Email', email), field('Phone', phone), field('Role', role), field('Status', st), field('Class teacher of', homeroom)),
      s.user_id ? h('p', { class: 'muted small', style: 'margin: 0' }, 'Signed in at least once, so the email is locked to their sign-in account.') : setupNote(s.email),
      h('div', {}, h('b', { class: 'small' }, 'Classes: '), h('span', { class: 'small' }, classesOf(s).join('; ') || 'None — assign from a class page'))], {
      onSubmit: async () => {
        must(await db.from('staff').update({ name: name.value.trim(), email: email.value.trim().toLowerCase(), phone: phone.value, role: role.value, status: st.value }).eq('id', s.id));
        const was = grades.find((g) => g.class_teacher_id === s.id);
        if (was && String(was.id) !== homeroom.value) must(await db.from('grade_levels').update({ class_teacher_id: null }).eq('id', was.id));
        if (homeroom.value && String(was?.id) !== homeroom.value) must(await db.from('grade_levels').update({ class_teacher_id: s.id }).eq('id', +homeroom.value));
        toast('Saved'); go(location.href);
      },
    });
  };

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead('Staff Directory', 'Teachers and admins, their roles and assigned classes.', [
      btn('Export', { icon: 'download', onclick: () => downloadCSV('staff.csv', [['Name', 'Role', 'Classes', 'Email', 'Status'], ...staff.map((s) => [s.name, s.role, classesOf(s).join('; '), s.email, s.status])]) }),
      btn('Invite Staff', { primary: true, icon: 'plus', onclick: invite })]),
    tabs([['all', 'All', staff.length], ['teachers', 'Teachers', staff.filter((s) => s.role === 'teacher').length], ['admins', 'Admins', staff.filter((s) => s.role === 'admin').length]], tab, null, { hrefFor: (k) => url({ tab: k }) }),
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Status'), select([['', 'All'], ['active', 'Active'], ['invited', 'Invited'], ['inactive', 'Inactive']], status, { style: 'width: auto', onchange: (e) => go(url({ status: e.target.value })) })),
    staff.length ? table([
      { label: 'Name', th: true, key: 'name' },
      { label: 'Role', render: (s) => (s.role === 'admin' ? 'Admin' : `Teacher${grades.some((g) => g.class_teacher_id === s.id) ? ' · Class teacher' : ''}`) },
      { label: 'Classes', cls: 'wrap', render: (s) => classesOf(s).join('; ') || '—' },
      { label: 'Email', key: 'email' }, { label: 'Status', render: (s) => tag(...STATUS_TAG[s.status]) },
      { label: '', render: (s) => h('span', { class: 'row' }, btn('View', { small: true, onclick: () => edit(s) }),
        s.status === 'invited' ? btn('Resend', { small: true, onclick: () => modal('Set-up instructions', setupNote(s.email), { submit: 'Done' }) }) : null) },
    ], rows, { empty: 'No staff match.' })
      : emptyState('No staff yet', 'Invite teachers and admins to give them access to Ledger.', btn('Invite Staff', { primary: true, icon: 'plus', onclick: invite }), 'users')));
}

const LEVELS = [['hidden', 'Hidden'], ['view', 'View'], ['edit_own', 'View + edit own'], ['full', 'Full access']];
async function rolesPage(ctx) {
  const [perms, staff] = await Promise.all([db.from('role_permissions').select('*').order('position').then(must), db.from('staff').select('role, status').then(must)]);
  const areas = [...new Set(perms.map((p) => p.area))];
  const sel = new Map(perms.map((p) => [p.role + ':' + p.area, select(LEVELS, p.level, { style: 'height: 34px' })]));
  const save = btn('Save Changes', { primary: true, onclick: () => busy(save, async () => {
    must(await db.from('role_permissions').upsert(perms.map((p) => ({ ...p, level: sel.get(p.role + ':' + p.area).value }))));
  }, 'Saved').catch(() => {}) });
  const people = (r) => staff.filter((s) => s.role === r && s.status !== 'inactive').length;
  mount(ctx.main, h('div', { class: 'stack' },
    pageHead('Roles and Permissions', 'What each role can see and edit. Edit controls only appear where a role has edit rights.', [save]),
    h('div', { class: 'row' }, tag(`Teacher · ${people('teacher')} people`), tag(`Admin · ${people('admin')} people`),
      h('span', { class: 'muted small' }, 'Class teachers are Teachers with a homeroom assigned in Staff Directory.')),
    table([
      { label: 'Area', th: true, render: (a) => a },
      ...['teacher', 'admin'].map((r) => ({ label: r === 'teacher' ? 'Teacher' : 'Admin', render: (a) => {
        const p = perms.find((x) => x.role === r && x.area === a);
        return p ? h('div', { class: 'stack', style: 'gap: 4px; padding: 6px 0' }, sel.get(r + ':' + a), h('span', { class: 'muted small' }, p.note)) : '—';
      } })),
    ], areas),
    h('div', { class: 'note' }, 'These settings document each role’s access. The database enforces the same rules for every request, so a change here needs a matching change to Ledger’s access rules to take effect.')));
}

async function settingsPage(ctx) {
  const tab = param('tab') || 'profile';
  const [settings, years, scale, codes] = await Promise.all([
    db.from('school_settings').select('*').eq('id', 1).maybeSingle().then(must), getYears(),
    db.from('grading_scale').select('*').order('position').then(must), db.from('attendance_codes').select('*').order('position').then(must)]);
  const s = settings || { id: 1 };
  let save = () => {};
  let body;
  if (tab === 'profile') {
    const f = Object.fromEntries(['school_name', 'managed_by', 'udise_code', 'school_code', 'recognised_by'].map((k) => [k, input({ value: s[k] || '' })]));
    const year = select(years.map((y) => [y.id, y.name]), years.find((y) => y.is_current)?.id);
    const week = select(['Mon–Sat', 'Mon–Fri'], s.week_days);
    body = card('School Profile', h('div', { class: 'grid2' }, field('School name', f.school_name), field('Managed by', f.managed_by), field('UDISE code', f.udise_code),
      field('School code', f.school_code), field('Recognised by', f.recognised_by), field('Current academic year', year), field('Week', week)),
    h('div', { class: 'row' }, h('img', { src: 'assets/logo.svg', alt: 'School logo', width: 64, height: 64, class: 'brand-logo' }),
      h('p', { class: 'muted small', style: 'margin: 0' }, 'The logo comes from assets/logo.svg in the site files. Replace that file to change it everywhere.')));
    save = async () => {
      must(await db.from('school_settings').upsert({ ...s, ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])), week_days: week.value }));
      const cur = years.find((y) => y.is_current);
      if (String(cur?.id) !== year.value) {
        if (cur) must(await db.from('academic_years').update({ is_current: false }).eq('id', cur.id));
        must(await db.from('academic_years').update({ is_current: true, closed: false }).eq('id', +year.value));
      }
    };
  } else if (tab === 'years') {
    const rows = years.map((y) => ({ y, closed: checkbox('Closed (read-only archive)', y.closed, { disabled: y.is_current }) }));
    const name = input({ placeholder: 'e.g. 2026–27' }), start = input({ type: 'date' }), end = input({ type: 'date' });
    body = h('div', { class: 'stack' },
      card('Academic years', table([{ label: 'Year', th: true, render: (r) => r.y.name + (r.y.is_current ? ' (current)' : '') }, { label: 'Starts', render: (r) => r.y.starts_on || '—' },
        { label: 'Ends', render: (r) => r.y.ends_on || '—' }, { label: 'Archive', render: (r) => r.closed }], rows),
      h('a', { href: 'AdminTerms.html', class: 'small' }, 'Edit terms and periods for the current year')),
      card('Add academic year', h('div', { class: 'grid3' }, field('Name', name), field('Starts', start), field('Ends', end))));
    save = async () => {
      for (const r of rows) { const c = r.closed.querySelector('input').checked; if (c !== r.y.closed) must(await db.from('academic_years').update({ closed: c }).eq('id', r.y.id)); }
      if (name.value.trim()) must(await db.from('academic_years').insert({ name: name.value.trim(), starts_on: start.value || null, ends_on: end.value || null }));
    };
  } else if (tab === 'grading') {
    const pass = input({ type: 'number', min: 0, max: 100, value: s.pass_mark });
    const absent = select([['zero', '0 marks'], ['excluded', 'Excluded from the average']], s.absent_counts);
    const draft = scale.map((g) => ({ ...g }));
    const box = h('div', {});
    const draw = () => mount(box, table([{ label: 'Grade', render: (g) => input({ value: g.grade, style: 'height: 34px', oninput: (e) => { g.grade = e.target.value; } }) },
      { label: 'Meaning', render: (g) => input({ value: g.meaning || '', style: 'height: 34px', oninput: (e) => { g.meaning = e.target.value; } }) },
      { label: '', render: (g) => btn('Remove', { small: true, danger: true, onclick: () => { draft.splice(draft.indexOf(g), 1); draw(); } }) }], draft),
    btn('Add grade', { small: true, icon: 'plus', onclick: () => { draft.push({ grade: '', meaning: '' }); draw(); } }));
    draw();
    body = card('Grading', h('div', { class: 'grid2' }, field('Pass mark (adjusted, out of 100)', pass), field('Absent counts as', absent)), box);
    save = async () => {
      must(await db.from('school_settings').upsert({ ...s, pass_mark: Number(pass.value) || 0, absent_counts: absent.value }));
      const keep = draft.filter((g) => g.id).map((g) => g.id);
      const gone = scale.filter((g) => !keep.includes(g.id)).map((g) => g.id);
      if (gone.length) must(await db.from('grading_scale').delete().in('id', gone));
      for (const [i, g] of draft.entries()) {
        if (!g.grade.trim()) continue;
        const row = { grade: g.grade.trim(), meaning: g.meaning, position: i + 1 };
        must(g.id ? await db.from('grading_scale').update(row).eq('id', g.id) : await db.from('grading_scale').insert(row));
      }
    };
  } else {
    const draft = codes.map((c) => ({ ...c, el: input({ value: c.meaning, style: 'height: 34px' }) }));
    body = card('Attendance codes', table([{ label: 'Code', th: true, key: 'code' }, { label: 'Meaning', render: (c) => c.el }], draft),
      h('p', { class: 'muted small', style: 'margin: 0' }, 'Ledger records P, A and L. You can rename what each code means here.'));
    save = async () => { for (const c of draft) must(await db.from('attendance_codes').update({ meaning: c.el.value }).eq('code', c.code)); };
  }
  const saveBtn = btn('Save Changes', { primary: true, onclick: () => busy(saveBtn, async () => { await save(); go(location.href); }, 'Saved').catch(() => {}) });
  mount(ctx.main, h('div', { class: 'stack', style: 'max-width: 960px' },
    pageHead('School Settings', 'Defaults used across Ledger, like the grading scale in Gradebook and codes in Attendance.', [saveBtn]),
    tabs([['profile', 'School Profile'], ['years', 'Academic Year and Terms'], ['grading', 'Grading Scales'], ['codes', 'Attendance Codes']], tab, null, { hrefFor: (k) => 'AdminSettings.html?tab=' + k }),
    body));
}

export function render(ctx) {
  if (ctx.page === 'AdminRoles') return rolesPage(ctx);
  if (ctx.page === 'AdminSettings') return settingsPage(ctx);
  return staffPage(ctx);
}
