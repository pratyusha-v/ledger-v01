// Student search with filters; results link to Student Profile.
import { db, must, h, mount, params, go, getGrades, getCurrentYear, pct, btn, table, pageHead, emptyState, studentName,
  input, select, field, checkbox, downloadCSV } from '../lib.js';

const FIELDS = [['all', 'All fields'], ['name', 'Name'], ['adm', 'Admission no.'], ['apaar', 'APAAR ID'], ['pen', 'PEN']];

export async function render(ctx) {
  const grades = await getGrades();
  const p = Object.fromEntries(params);
  const res = params.getAll('res');
  const flags = params.getAll('flag');
  const hasQuery = ['q', 'grade', 'att', 'promo'].some((k) => p[k]) || res.length || flags.length || p.former;
  const resultsPage = ctx.link('Search').split('?')[0];
  if (hasQuery && ctx.page.endsWith('SearchStart')) return go(resultsPage + location.search);
  if (!hasQuery && ctx.page.endsWith('Search') && !ctx.page.endsWith('SearchStart')) return go(ctx.link('SearchStart'));

  // Side column filters.
  if (ctx.aside) {
    const form = h('form', { action: resultsPage, method: 'get', style: 'display: flex; flex-direction: column; gap: 18px' },
      p.q ? h('input', { type: 'hidden', name: 'q', value: p.q }) : null,
      p.in ? h('input', { type: 'hidden', name: 'in', value: p.in }) : null,
      h('div', { class: 'spread', style: 'align-items: baseline' }, h('h2', { style: 'margin: 0; font-size: 15px' }, 'Filters'), h('a', { href: ctx.link('SearchStart'), style: 'font-size: 13px' }, 'Clear all')),
      field('Class', select([['', 'All classes'], ...grades.map((g) => [g.id, g.name])], p.grade || '', { name: 'grade' })),
      h('fieldset', { class: 'fl', style: 'border: none; margin: 0; padding: 0' }, h('legend', { style: 'padding: 0 0 6px' }, 'Residential status'),
        checkbox('Hostler', res.includes('Hostler'), { name: 'res', value: 'Hostler' }), checkbox('Day scholar', res.includes('Day scholar'), { name: 'res', value: 'Day scholar' })),
      field('Attendance', select([['', 'Any'], ['90', 'Below 90%'], ['75', 'Below 75%']], p.att || '', { name: 'att' })),
      field('Promotion status', select([['', 'Any'], ['Promoted', 'Promoted'], ['undecided', 'Not decided']], p.promo || '', { name: 'promo' })),
      h('fieldset', { class: 'fl', style: 'border: none; margin: 0; padding: 0' }, h('legend', { style: 'padding: 0 0 6px' }, 'Flags'),
        checkbox('Pending documents', flags.includes('docs'), { name: 'flag', value: 'docs' }), checkbox('Health notes', flags.includes('health'), { name: 'flag', value: 'health' }),
        ctx.isAdmin ? checkbox('Include former students', !!p.former, { name: 'former', value: '1' }) : null),
      btn('Apply Filters', { type: 'submit', primary: true }));
    mount(ctx.aside, form);
  }

  const bar = h('form', { action: resultsPage, method: 'get', class: 'row', style: 'flex-wrap: nowrap' },
    select(FIELDS, p.in || 'all', { name: 'in', style: 'width: 150px', 'aria-label': 'Search in' }),
    input({ name: 'q', value: p.q || '', placeholder: 'Search by name, admission no., APAAR ID or PEN', 'aria-label': 'Search students', style: 'flex: 1' }),
    btn('Search', { type: 'submit', primary: true, icon: 'search' }));
  const actions = ctx.isAdmin ? [btn('Export', { icon: 'download', onclick: () => exportRows() }), btn('Add Student', { primary: true, icon: 'plus', href: 'AdminNewApplication.html' })] : [];
  let exportRows = () => {};

  if (!hasQuery) {
    mount(ctx.main, h('div', { class: 'stack' }, pageHead('Student Search', null, actions), bar,
      emptyState('Start searching for a student', 'Type in the search box, or choose filters on the left. Results will show up here.',
        h('div', { class: 'grid3', style: 'text-align: left; max-width: 640px' },
          [['By name', 'Even part of a name works, e.g. “Lakshmi”.'], ['By ID', 'Admission no., APAAR ID or PEN.'], ['By filters', 'Class, residence, attendance.']]
            .map(([t, d], i) => h('div', {}, h('b', {}, `${i + 1}. ${t}`), h('p', { class: 'small', style: 'margin: 4px 0 0' }, d)))), 'search')));
    return;
  }

  let q = db.from('students').select('id, full_name, display_name, admission_no, apaar_id, pen, residential, status, grade_id, profile, grade:grade_levels(name)');
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
  const [att, docs, health] = ids.length ? await Promise.all([
    db.from('attendance').select('student_id, status').in('student_id', ids).gte('on_date', year.starts_on).lte('on_date', year.ends_on).then(must),
    flags.includes('docs') ? db.from('student_documents').select('student_id').eq('submitted', false).in('student_id', ids).then(must) : [],
    flags.includes('health') ? db.from('health_records').select('student_id, remarks').in('student_id', ids).then(must) : [],
  ]) : [[], [], []];
  const attPct = new Map();
  ids.forEach((id) => { const a = att.filter((x) => x.student_id === id); attPct.set(id, a.length ? (a.filter((x) => x.status !== 'A').length / a.length) * 100 : null); });

  if (p.att) rows = rows.filter((r) => attPct.get(r.id) !== null && attPct.get(r.id) < Number(p.att));
  if (p.promo) rows = rows.filter((r) => (p.promo === 'Promoted' ? r.profile?.final?.promotion === 'Promoted' : r.profile?.final?.promotion !== 'Promoted'));
  if (flags.includes('docs')) { const s = new Set(docs.map((d) => d.student_id)); rows = rows.filter((r) => s.has(r.id)); }
  if (flags.includes('health')) {
    const s = new Set(health.filter((x) => x.remarks).map((x) => x.student_id));
    rows = rows.filter((r) => s.has(r.id) || (r.profile?.health_issues && r.profile.health_issues !== '—'));
  }

  const sort = p.sort || 'name';
  rows.sort((a, b) => sort === 'adm' ? String(a.admission_no).localeCompare(String(b.admission_no), undefined, { numeric: true })
    : sort === 'att' ? (attPct.get(a.id) ?? 101) - (attPct.get(b.id) ?? 101) : a.full_name.localeCompare(b.full_name));
  exportRows = () => downloadCSV('students.csv', [['Student', 'Adm. No.', 'Class', 'Residential', 'Attendance', 'Status'],
    ...rows.map((r) => [r.full_name, r.admission_no, r.grade?.name, r.residential, attPct.get(r.id) === null ? '' : pct(attPct.get(r.id)), r.status])]);

  const chips = [p.q && `“${p.q}”`, p.grade && `Class: ${grades.find((g) => g.id === +p.grade)?.name}`, ...res, p.att && `Attendance below ${p.att}%`,
    p.promo && (p.promo === 'Promoted' ? 'Promoted' : 'Not decided'), flags.includes('docs') && 'Pending documents', flags.includes('health') && 'Health notes', p.former && 'Including former'].filter(Boolean);
  const sortSel = select([['name', 'Name (A–Z)'], ['adm', 'Adm. No.'], ['att', 'Attendance']], sort, {
    style: 'width: auto; height: 32px', onchange: (e) => { const u = new URLSearchParams(location.search); u.set('sort', e.target.value); go(resultsPage + '?' + u); },
  });

  mount(ctx.main, h('div', { class: 'stack' }, pageHead('Student Search', null, actions), bar,
    h('div', { class: 'spread', style: 'align-items: center' },
      h('div', { class: 'row' }, h('b', {}, `${rows.length} result${rows.length === 1 ? '' : 's'}`), chips.map((c) => h('span', { class: 'tag' }, c)),
        chips.length ? h('a', { href: ctx.link('SearchStart'), class: 'small', 'aria-label': 'Clear search' }, 'Clear') : null),
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Sort by'), sortSel)),
    table([
      { label: 'Student', th: true, render: (r) => h('a', { href: ctx.link('Student', { id: r.id }) }, r.full_name) },
      { label: 'Adm. No.', render: (r) => r.admission_no || '—' },
      { label: 'Class', render: (r) => r.grade?.name || '—' },
      { label: 'Residential', render: (r) => r.residential || '—' },
      { label: 'Attendance', cls: 'num', render: (r) => pct(attPct.get(r.id)) },
      ...(p.former ? [{ label: 'Status', render: (r) => r.status }] : []),
      { label: 'Action', render: (r) => btn('View profile', { small: true, href: ctx.link('Student', { id: r.id }) }) },
    ], rows, { empty: 'No students match. Try a shorter name or fewer filters.' })));
}
