// Reports (admin): attendance, grades and enrollment, as CSV (opens in Excel) or a printable PDF.
import { db, must, h, mount, getYears, getGrades, getTerms, getClasses, getRoster, getSettings, className, gradebook, fmtDMY, n1, pct,
  btn, card, table, pageHead, select, field, modal, toast, busy, downloadCSV } from '../lib.js';

async function range(years, params) {
  const year = years.find((y) => y.name === params.year) || years[0];
  if (!params.term || params.term === 'All terms') return { year, from: year.starts_on, to: year.ends_on };
  const term = (await getTerms(year.id)).find((t) => t.name === params.term);
  return { year, from: term?.starts_on || year.starts_on, to: term?.ends_on || year.ends_on };
}

const BUILDERS = {
  async Attendance(params, years, grades) {
    const { from, to } = await range(years, params);
    const g = grades.find((x) => x.name === params.grade);
    let q = db.from('students').select('id, full_name, admission_no, grade_id').not('roll_no', 'is', null).order('full_name');
    if (g) q = q.eq('grade_id', g.id);
    const students = must(await q);
    const att = students.length ? must(await db.from('attendance').select('student_id, status').in('student_id', students.map((s) => s.id)).gte('on_date', from).lte('on_date', to)) : [];
    return [['Student', 'Adm. No.', 'Grade', 'Days', 'Present', 'Absent', 'Late', 'Attendance %'], ...students.map((s) => {
      const a = att.filter((x) => x.student_id === s.id);
      const c = (k) => a.filter((x) => x.status === k).length;
      return [s.full_name, s.admission_no, grades.find((x) => x.id === s.grade_id)?.name, a.length, c('P'), c('A'), c('L'), a.length ? pct(((c('P') + c('L')) / a.length) * 100) : '—'];
    })];
  },
  async Grades(params, years, grades) {
    const { year, from, to } = await range(years, params);
    const settings = await getSettings();
    const classes = (await getClasses(year.id)).filter((c) => !params.grade || params.grade === 'All grades' || c.grade.name === params.grade);
    const out = [['Class', 'Teacher', 'Students', 'Evaluations', 'Class average (adjusted)', 'Highest', 'Lowest', 'Pass %']];
    for (const c of classes) {
      const [roster, evals] = await Promise.all([getRoster(c.id), db.from('evaluations').select('*').eq('class_id', c.id).gte('held_on', from).lte('held_on', to).then(must)]);
      const marks = evals.length ? must(await db.from('marks').select('*').in('evaluation_id', evals.map((e) => e.id))) : [];
      const gb = gradebook(evals, roster, marks, settings);
      out.push([className(c), c.teacher?.name || '—', roster.length, evals.length, n1(gb.avg), gb.hi ? n1(gb.hi.adjusted) : '—', gb.lo ? n1(gb.lo.adjusted) : '—', gb.scoredCount ? pct((gb.passed / gb.scoredCount) * 100) : '—']);
    }
    return out;
  },
  async Enrollment(params, years) {
    const { from, to } = await range(years, params);
    const [apps, transfers, withdrawals] = await Promise.all([
      db.from('applications').select('full_name, status, applied_on, grade:grade_levels(name)').gte('applied_on', from).lte('applied_on', to).then(must),
      db.from('transfers').select('student_name, kind, status, effective_on, from_place, to_place').then(must),
      db.from('withdrawals').select('student_name, grade_name, reason, last_day, status').gte('last_day', from).lte('last_day', to).then(must),
    ]);
    const gradeOk = (g) => !params.grade || params.grade === 'All grades' || g === params.grade;
    return [['Type', 'Student', 'Grade', 'Date', 'Status / reason'],
      ...apps.filter((a) => gradeOk(a.grade?.name)).map((a) => ['Admission', a.full_name, a.grade?.name, a.applied_on, a.status]),
      ...transfers.filter((t) => !t.effective_on || (t.effective_on >= from && t.effective_on <= to)).map((t) => [`Transfer (${t.kind})`, t.student_name, t.kind === 'incoming' ? t.to_place : t.from_place, t.effective_on || '', t.status]),
      ...withdrawals.filter((w) => gradeOk(w.grade_name)).map((w) => ['Withdrawal', w.student_name, w.grade_name, w.last_day, w.reason])];
  },
};

function printable(title, rows) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to open the PDF view.', true); return; }
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  w.document.write(`<!doctype html><title>${esc(title)}</title><style>body{font:13px Lato,Arial,sans-serif;color:#2E2430;margin:32px}h1{font-size:20px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #E6E2DE;padding:6px 8px;text-align:left}th{color:#6E5A70}</style>
    <h1>${esc(title)}</h1><p>Generated ${esc(new Date().toLocaleString())}</p><table><thead><tr>${rows[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
  w.document.close();
  w.focus();
  w.print();
}

export async function render(ctx) {
  const [years, grades] = await Promise.all([getYears(), getGrades()]);
  const current = years.find((y) => y.is_current) || years[0];
  const terms = await getTerms(current.id);
  const recent = must(await db.from('reports').select('*').order('created_at', { ascending: false }).limit(10));

  const output = async (kind, params) => {
    const rows = await BUILDERS[kind](params, years, grades);
    const title = `${kind} – ${params.grade} – ${params.term} – ${params.year}`;
    if (params.format === 'PDF') printable(title, rows); else downloadCSV(`${title.replace(/[^\w–-]+/g, ' ').trim()}.csv`, rows);
    return title;
  };

  const generator = (kind, desc) => {
    const year = select(years.map((y) => y.name), current.name);
    const grade = select(['All grades', ...grades.map((g) => g.name)], 'All grades');
    const term = select(['All terms', ...terms.map((t) => t.name)], 'All terms');
    const format = select([['Excel', 'Excel (CSV)'], ['PDF', 'PDF']], 'Excel');
    const params = () => ({ year: year.value, grade: grade.value, term: term.value, format: format.value });
    const preview = btn('Preview', { onclick: () => busy(preview, async () => {
      const rows = await BUILDERS[kind](params(), years, grades);
      modal(`${kind} preview`, h('div', { class: 'scroll' }, table(rows[0].map((l, i) => ({ label: l, render: (r) => r[i] })), rows.slice(1).slice(0, 50), { empty: 'No data for these filters.' }),
        rows.length > 51 ? h('p', { class: 'muted small' }, `Showing 50 of ${rows.length - 1} rows.`) : null), { submit: 'Close' });
    }).catch(() => {}) });
    const generate = btn('Generate', { primary: true, onclick: () => busy(generate, async () => {
      const p = params();
      const name = await output(kind, p);
      must(await db.from('reports').insert({ name, kind, params: p, created_by_name: ctx.me.name }));
      render(ctx);
    }).catch(() => {}) });
    return card(kind, h('p', { class: 'muted small', style: 'margin: 0' }, desc),
      h('div', { class: 'grid2' }, field('Year', year), field('Grade', grade), field('Term', term), field('Format', format)), h('div', { class: 'row' }, preview, generate));
  };

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead('Reports', 'Look back over recorded attendance, grades and enrollment.'),
    h('div', { class: 'grid3' },
      generator('Attendance', 'Days present and absent by student, class or grade.'),
      generator('Grades', 'Marks, averages and pass percentages by class.'),
      generator('Enrollment', 'Admissions, transfers and withdrawals over time.')),
    card('Recent reports', table([
      { label: 'Report', th: true, key: 'name' }, { label: 'Type', key: 'kind' }, { label: 'Created by', key: 'created_by_name' },
      { label: 'Date', render: (r) => fmtDMY(r.created_at) },
      { label: '', render: (r) => btn('Download', { small: true, icon: 'download', onclick: (e) => busy(e.currentTarget, () => output(r.kind, r.params)).catch(() => {}) }) },
    ], recent, { empty: 'No reports generated yet.' }))));
}
