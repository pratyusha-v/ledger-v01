// All Classes (Current Classes for admins): find any class this year by grade, subject and teacher.
import { db, must, h, mount, param, getCurrentYear, getClasses, getGrades, select, field, input, btn, table, pageHead, card } from '../lib.js';
import { SEARCH_KEY } from './common.js';

// Every class this year in one list, narrowed by grade, subject and teacher as they type.
async function browse(ctx) {
  const [current, grades] = await Promise.all([getCurrentYear(), getGrades()]);
  const classes = await getClasses(current.id);
  const enrol = classes.length ? must(await db.from('enrollments').select('class_id').in('class_id', classes.map((c) => c.id))) : [];
  const count = (c) => enrol.filter((e) => e.class_id === c.id).length;

  // Text fields with suggestions: the browser lists matching names as they type.
  const suggest = (id, label, names, value) => {
    const el = input({ value, list: id, placeholder: label, autocomplete: 'off', 'aria-label': label });
    return [el, h('datalist', { id }, [...new Set(names)].map((n) => h('option', { value: n })))];
  };
  const gradeSel = select([['', 'All grades'], ...grades.map((g) => [g.id, g.name])], param('grade') || '');
  const [subjIn, subjList] = suggest('subject-options', 'Any subject', classes.map((c) => c.subject.name), param('subject') || '');
  const [teachIn, teachList] = suggest('teacher-options', 'Any teacher', classes.map((c) => c.teacher?.name).filter(Boolean), param('teacher') || '');

  const results = h('div', {});
  const draw = () => {
    const subj = subjIn.value.trim().toLowerCase();
    const teach = teachIn.value.trim().toLowerCase();
    const rows = classes.filter((c) => (!gradeSel.value || c.grade_id === +gradeSel.value)
      && (!subj || c.subject.name.toLowerCase().includes(subj))
      && (!teach || (c.teacher?.name || '').toLowerCase().includes(teach)));
    const q = new URLSearchParams(Object.entries({ grade: gradeSel.value, subject: subjIn.value.trim(), teacher: teachIn.value.trim() }).filter(([, v]) => v));
    history.replaceState(null, '', location.pathname + (String(q) ? '?' + q : ''));
    try { sessionStorage.setItem(SEARCH_KEY, String(q) ? '?' + q : ''); } catch { /* storage off */ }
    mount(results, h('div', { class: 'stack', style: 'gap: 8px' },
      h('div', { class: 'muted small' }, `${rows.length} class${rows.length === 1 ? '' : 'es'}`),
      table([
        { label: 'Grade', th: true, render: (c) => c.grade.name },
        { label: 'Subject', render: (c) => c.subject.name },
        { label: 'Teacher', render: (c) => (c.teacher_id === ctx.me.id ? 'You' : c.teacher?.name || 'Not assigned') },
        { label: 'Students', cls: 'num', render: count },
        { label: '', cls: 'r', render: (c) => btn('Open class', { small: true, href: ctx.link(ctx.isAdmin || c.teacher_id === ctx.me.id ? 'Main' : 'AllClasses', { class: c.id, from: 'search' }) }) },
      ], rows, { empty: 'No classes match. Try another grade, subject or teacher.' })));
  };
  [gradeSel, subjIn, teachIn].forEach((el) => el.addEventListener('input', draw));
  const clear = btn('Clear', { onclick: () => { gradeSel.value = ''; subjIn.value = ''; teachIn.value = ''; draw(); } });

  mount(ctx.main, h('div', { class: 'stack' },
    ctx.isAdmin ? pageHead('Current Classes', `Every class in the school this year (${current.name}). Open one to edit it, assign a teacher or manage its roster.`)
      : pageHead('All Classes', `Every class in the school this year (${current.name}). Other teachers\u2019 classes are view only.`),
    card('Search', h('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px 20px; align-items: end' },
      field('Grade', gradeSel), field('Subject', subjIn), field('Teacher', teachIn), h('div', { class: 'row' }, clear)), subjList, teachList),
    results));
  draw();
}

export function render(ctx) {
  return browse(ctx);
}
