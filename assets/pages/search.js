// Student search with filters; results link to Student Profile.
import { db, must, h, mount, params, go, redirect, getGrades, getSubjects, getClasses, getSettings, getCurrentYear, subjectResult, letterGrade,
  pct, btn, table, pageHead, emptyState, studentName, input, select, field, checkbox, downloadCSV } from '../lib.js';

const FIELDS = [['all', 'All fields'], ['name', 'Name'], ['adm', 'Admission no.'], ['apaar', 'APAAR ID'], ['pen', 'PEN']];

export async function render(ctx) {
  const [grades, subjects] = await Promise.all([getGrades(), getSubjects()]);
  const p = Object.fromEntries(params);
  const res = params.getAll('res');
  const flags = params.getAll('flag');
  const filtered = ['q', 'grade', 'subject'].some((k) => p[k]) || res.length || flags.length || p.former;
  // Admins see every current student until they search or filter.
  const hasQuery = filtered || ctx.isAdmin;
  const title = ctx.isAdmin ? 'Students' : 'Student Search';
  const resultsPage = ctx.link('Search').split('?')[0];
  if (!ctx.isAdmin && hasQuery && ctx.page.endsWith('SearchStart')) return redirect(resultsPage + location.search);
  if (!ctx.isAdmin && !hasQuery && ctx.page.endsWith('Search') && !ctx.page.endsWith('SearchStart')) return redirect(ctx.link('SearchStart'));

  // Side column filters.
  if (ctx.aside) {
    const form = h('form', { action: resultsPage, method: 'get', style: 'display: flex; flex-direction: column; gap: 18px' },
      p.q ? h('input', { type: 'hidden', name: 'q', value: p.q }) : null,
      p.in ? h('input', { type: 'hidden', name: 'in', value: p.in }) : null,
      h('div', { class: 'spread', style: 'align-items: baseline' }, h('h2', { style: 'margin: 0; font-size: 15px' }, 'Filters'), h('a', { href: ctx.link('SearchStart'), style: 'font-size: 13px' }, 'Clear all')),
      field('Grade', select([['', 'All grades'], ...grades.map((g) => [g.id, g.name])], p.grade || '', { name: 'grade' })),
      field('Subject', select([['', 'All subjects'], ...subjects.map((x) => [x.id, x.name])], p.subject || '', { name: 'subject' })),
      h('fieldset', { class: 'fl', style: 'border: none; margin: 0; padding: 0' }, h('legend', { style: 'padding: 0 0 6px' }, 'Residential status'),
        checkbox('Hostler', res.includes('Hostler'), { name: 'res', value: 'Hostler' }), checkbox('Day scholar', res.includes('Day scholar'), { name: 'res', value: 'Day scholar' })),
      h('fieldset', { class: 'fl', style: 'border: none; margin: 0; padding: 0' }, h('legend', { style: 'padding: 0 0 6px' }, 'Flags'),
        checkbox('Pending documents', flags.includes('docs'), { name: 'flag', value: 'docs' }),
        ctx.isAdmin ? checkbox('Include former students', !!p.former, { name: 'former', value: '1' }) : null),
      btn('Apply Filters', { type: 'submit', primary: true }));
    mount(ctx.aside, form);
  }

  const bar = h('form', { action: resultsPage, method: 'get', class: 'row', style: 'flex-wrap: nowrap' },
    select(FIELDS, p.in || 'all', { name: 'in', style: 'width: 150px', 'aria-label': 'Search in' }),
    input({ name: 'q', value: p.q || '', placeholder: 'Search by name, admission no., APAAR ID or PEN', 'aria-label': 'Search students', style: 'flex: 1' }),
    btn('Search', { type: 'submit', primary: true, icon: 'search' }));
  const actions = ctx.isAdmin ? [btn('Export View', { icon: 'download', onclick: () => exportRows() })] : [];
  let exportRows = () => {};

  if (!hasQuery) {
    mount(ctx.main, h('div', { class: 'stack' }, pageHead(title, null, actions), bar,
      emptyState('Start searching for a student', 'Type in the search box, or choose filters on the left. Results will show up here.',
        h('div', { class: 'grid3', style: 'text-align: left; max-width: 640px' },
          [['By name', 'Even part of a name works, e.g. “Lakshmi”.'], ['By ID', 'Admission no., APAAR ID or PEN.'], ['By filters', 'Grade, subject, residence.']]
            .map(([t, d], i) => h('div', {}, h('b', {}, `${i + 1}. ${t}`), h('p', { class: 'small', style: 'margin: 4px 0 0' }, d)))), 'search')));
    return;
  }

  let q = db.from('students').select('id, full_name, display_name, admission_no, roll_no, apaar_id, pen, residential, status, grade_id, profile, grade:grade_levels(name)');
  if (!p.former) q = q.eq('status', 'active');
  if (p.grade) q = q.eq('grade_id', p.grade);
  if (res.length) q = q.in('residential', res);
  if (p.q) {
    const term = p.q.replace(/[%,()]/g, ' ').trim();
    const like = `%${term}%`;
    const cols = { name: ['full_name', 'display_name'], adm: ['admission_no'], apaar: ['apaar_id'], pen: ['pen'] }[p.in] || ['full_name', 'display_name', 'admission_no', 'apaar_id', 'pen'];
    q = q.or(cols.map((c) => `${c}.ilike.${like}`).join(','));
  }
  let rows = must(await q.order('full_name'));

  const ids = rows.map((r) => r.id);
  const year = await getCurrentYear();
  const [att, docs] = ids.length ? await Promise.all([
    db.from('attendance').select('student_id, status').in('student_id', ids).gte('on_date', year.starts_on).lte('on_date', year.ends_on).then(must),
    flags.includes('docs') ? db.from('student_documents').select('student_id').eq('submitted', false).in('student_id', ids).then(must) : [],
  ]) : [[], []];
  // The subject filter and each student's total percentage to date
  // (the average of their academic subjects, as on the student page).
  const total = new Map();
  if (ids.length) {
    const [classes, settings] = await Promise.all([getClasses(year.id), getSettings()]);
    const enrol = classes.length ? must(await db.from('enrollments').select('class_id, student_id').in('class_id', classes.map((c) => c.id)).in('student_id', ids)) : [];
    if (p.subject) {
      const inSubject = new Set(enrol.filter((e) => classes.find((c) => c.id === e.class_id)?.subject_id === +p.subject).map((e) => e.student_id));
      rows = rows.filter((r) => inSubject.has(r.id));
    }
    const academic = classes.filter((c) => c.subject.academic !== false);
    const evals = academic.length ? must(await db.from('evaluations').select('id, class_id, max_marks, weight').in('class_id', academic.map((c) => c.id))) : [];
    const marks = evals.length ? must(await db.from('marks').select('evaluation_id, student_id, marks, absent').in('evaluation_id', evals.map((e) => e.id)).in('student_id', ids)) : [];
    rows.forEach((r) => {
      const pcts = academic.filter((c) => enrol.some((e) => e.class_id === c.id && e.student_id === r.id))
        .map((c) => subjectResult(c, evals, marks, settings, r.id).pct).filter((x) => x !== null);
      total.set(r.id, pcts.length ? pcts.reduce((a, x) => a + x, 0) / pcts.length : null);
    });
  }
  const totalText = (r) => (total.get(r.id) === null || total.get(r.id) === undefined ? '—' : `${pct(total.get(r.id))} · ${letterGrade(total.get(r.id))}`);
  const attPct = new Map();
  ids.forEach((id) => { const a = att.filter((x) => x.student_id === id); attPct.set(id, a.length ? (a.filter((x) => x.status !== 'A').length / a.length) * 100 : null); });

  if (flags.includes('docs')) { const s = new Set(docs.map((d) => d.student_id)); rows = rows.filter((r) => s.has(r.id)); }

  const sort = p.sort || 'name';
  const gradePos = (r) => grades.find((g) => g.id === r.grade_id)?.position ?? 999;
  rows.sort((a, b) => sort === 'adm' ? String(a.admission_no).localeCompare(String(b.admission_no), undefined, { numeric: true })
    : sort === 'roll' ? gradePos(a) - gradePos(b) || (a.roll_no ?? 999) - (b.roll_no ?? 999)
    : sort === 'total' ? (total.get(b.id) ?? -1) - (total.get(a.id) ?? -1)
    : sort === 'att' ? (attPct.get(a.id) ?? 101) - (attPct.get(b.id) ?? 101) : a.full_name.localeCompare(b.full_name));
  const chips = [p.q && `“${p.q}”`, p.grade && `Grade: ${grades.find((g) => g.id === +p.grade)?.name}`,
    p.subject && `Subject: ${subjects.find((x) => x.id === +p.subject)?.name}`, ...res,
    flags.includes('docs') && 'Pending documents', p.former && 'Including former'].filter(Boolean);
  // Export the list as filtered and sorted on screen; the file name says which filters were on.
  const slug = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  exportRows = () => downloadCSV(['current-students', ...chips.map(slug)].filter(Boolean).join('_').slice(0, 120) + '.csv', [['Adm. No.', 'Student', 'Grade', 'Roll No.', 'Residential', 'Attendance', 'Total %', 'Grade (letter)', 'Status'],
    ...rows.map((r) => [r.admission_no, r.full_name, r.grade?.name, r.roll_no, r.residential, attPct.get(r.id) === null ? '' : pct(attPct.get(r.id)),
      total.get(r.id) == null ? '' : pct(total.get(r.id)), total.get(r.id) == null ? '' : letterGrade(total.get(r.id)), r.status])]);

  const sortSel = select([['name', 'Name (A–Z)'], ['adm', 'Adm. No.'], ['roll', 'Roll No.'], ['total', 'Total %, high to low'], ['att', 'Attendance']], sort, {
    style: 'width: auto; height: 32px', onchange: (e) => { const u = new URLSearchParams(location.search); u.set('sort', e.target.value); go(resultsPage + '?' + u); },
  });

  mount(ctx.main, h('div', { class: 'stack' }, pageHead(title, null, actions), bar,
    h('div', { class: 'spread', style: 'align-items: center' },
      h('div', { class: 'row' }, h('b', {}, ctx.isAdmin && !filtered ? `${rows.length} current student${rows.length === 1 ? '' : 's'}` : `${rows.length} result${rows.length === 1 ? '' : 's'}`), chips.map((c) => h('span', { class: 'tag' }, c)),
        chips.length ? h('a', { href: ctx.link('SearchStart'), class: 'small', 'aria-label': 'Clear search' }, 'Clear') : null),
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Sort by'), sortSel)),
    table(ctx.isAdmin ? [
      { label: 'Adm. No.', th: true, render: (r) => r.admission_no || '—' },
      { label: 'Student', render: (r) => h('a', { href: ctx.link('Student', { id: r.id }) }, r.full_name) },
      { label: 'Grade', render: (r) => r.grade?.name || '—' },
      { label: 'Roll No.', cls: 'num', render: (r) => r.roll_no ?? '—' },
      { label: 'Residential', render: (r) => r.residential || '—' },
      { label: 'Attendance', cls: 'num', render: (r) => pct(attPct.get(r.id)) },
      { label: 'Total %', cls: 'num', render: totalText },
      ...(p.former ? [{ label: 'Status', render: (r) => r.status }] : []),
    ] : [
      { label: 'Student', th: true, render: (r) => h('a', { href: ctx.link('Student', { id: r.id }) }, r.full_name) },
      { label: 'Adm. No.', render: (r) => r.admission_no || '—' },
      { label: 'Grade', render: (r) => r.grade?.name || '—' },
      { label: 'Roll No.', cls: 'num', render: (r) => r.roll_no ?? '—' },
      { label: 'Residential', render: (r) => r.residential || '—' },
      { label: 'Attendance', cls: 'num', render: (r) => pct(attPct.get(r.id)) },
      { label: 'Total %', cls: 'num', render: totalText },
      ...(p.former ? [{ label: 'Status', render: (r) => r.status }] : []),
      { label: 'Action', render: (r) => btn('View profile', { small: true, href: ctx.link('Student', { id: r.id }) }) },
    ], rows, { empty: 'No students match. Try a shorter name or fewer filters.' })));
}
