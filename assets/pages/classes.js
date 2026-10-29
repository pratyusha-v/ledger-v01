// All Classes: find any class by grade, subject, teacher and year.
import { db, must, h, mount, param, getYears, getCurrentYear, getClasses, getGrades, getSubjects, getStaff, getClass, className,
  select, field, input, btn, table, pageHead, emptyState, card, getRoster } from '../lib.js';
import { gradebookSection } from './gradebook.js';
import { SEARCH_KEY } from './common.js';

const RECENT = 'ledger-recent-classes';
function recent() { try { return JSON.parse(localStorage.getItem(RECENT)) || []; } catch { return []; } }
function remember(id) { try { localStorage.setItem(RECENT, JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, 5))); } catch { /* storage off */ } }

// Teacher view: every class this year in one list, narrowed by grade, subject and teacher as they type.
async function teacherBrowse(ctx) {
  const [current, grades, subjects, staff] = await Promise.all([getCurrentYear(), getGrades(), getSubjects(), getStaff()]);
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
        { label: '', cls: 'r', render: (c) => btn('Open class', { small: true, href: ctx.link(c.teacher_id === ctx.me.id ? 'Main' : 'AllClasses', { class: c.id, from: 'search' }) }) },
      ], rows, { empty: 'No classes match. Try another grade, subject or teacher.' })));
  };
  [gradeSel, subjIn, teachIn].forEach((el) => el.addEventListener('input', draw));
  const clear = btn('Clear', { onclick: () => { gradeSel.value = ''; subjIn.value = ''; teachIn.value = ''; draw(); } });

  mount(ctx.main, h('div', { class: 'stack' },
    pageHead('All Classes', `Every class in the school this year (${current.name}). Other teachers\u2019 classes are view only.`),
    card('Search', h('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px 20px; align-items: end' },
      field('Grade', gradeSel), field('Subject', subjIn), field('Teacher', teachIn), h('div', { class: 'row' }, clear)), subjList, teachList),
    results));
  draw();
}

export async function render(ctx) {
  if (!ctx.isAdmin) return teacherBrowse(ctx);
  const [years, current, grades, subjects, staff] = await Promise.all([getYears(), getCurrentYear(), getGrades(), getSubjects(), getStaff()]);
  const yearId = Number(param('year')) || current.id;
  const classes = await getClasses(yearId);
  const f = { grade: param('grade') || '', subject: param('subject') || '', teacher: param('teacher') || '' };
  const searched = ctx.page.endsWith('Results');
  const resultsPage = ctx.isAdmin ? 'AdminAllClassesResults' : 'AllClassesResults';

  const gradeSel = select([['', 'Select grade'], ...grades.map((g) => [g.id, g.name])], f.grade, { name: 'grade' });
  const subjSel = select([['', 'All subjects'], ...subjects.filter((s) => s.academic).map((s) => [s.id, s.name])], f.subject, { name: 'subject' });
  const teachSel = select([['', 'Any teacher'], ...staff.filter((s) => s.role === 'teacher').map((s) => [s.id, s.name])], f.teacher, { name: 'teacher' });
  const yearSel = select(years.map((y) => [y.id, y.name + (y.is_current ? ' (current)' : '')]), yearId, { name: 'year' });

  const form = h('form', { class: 'card', action: resultsPage + '.html', method: 'get' },
    h('div', { class: 'sh' }, 'Search'),
    h('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px 20px; align-items: end' },
      field('Grade', gradeSel), field('Subject', subjSel), field('Teacher', teachSel), field('Year', yearSel),
      h('div', { class: 'row' }, btn('Clear', { href: ctx.link('AllClassesStart') }), btn('Find Classes', { type: 'submit', primary: true, icon: 'search' }))));

  const intro = ctx.isAdmin
    ? 'Find any class in the school. As an admin you can edit every class, assign teachers and manage rosters.'
    : 'Find any class in the school to view its marks. Other teachers’ classes are view only.';

  if (!searched) {
    const recents = recent().map((id) => classes.find((c) => c.id === id)).filter(Boolean);
    mount(ctx.main, h('div', { class: 'stack' }, pageHead('All Classes', intro), form,
      emptyState('No class selected yet', 'Search above or pick a grade and subject. Matching classes will show up here.',
        recents.length ? h('div', { class: 'row', style: 'justify-content: center' }, h('span', { class: 'muted small' }, 'Recently viewed:'),
          recents.map((c) => btn(className(c), { small: true, href: `${resultsPage}.html?class=${c.id}&year=${c.year_id}` }))) : null, 'search')));
    return;
  }

  const matches = classes.filter((c) => (!f.grade || c.grade_id === +f.grade) && (!f.subject || c.subject_id === +f.subject) && (!f.teacher || c.teacher_id === f.teacher));
  const chosenId = Number(param('class')) || matches[0]?.id;
  const chosen = chosenId ? await getClass(chosenId) : null;
  if (chosen) remember(chosen.id);

  const qs = (extra) => new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), ...extra }).toString();
  const list = h('div', { class: 'row' }, matches.map((c) => btn(`${className(c)} · ${c.teacher?.name || 'No teacher'}`, {
    small: true, href: `${resultsPage}.html?${qs({ class: c.id })}`, class: c.id === chosenId ? 'p' : '',
  })));

  let detail = emptyState('No matching classes', 'Try another grade, subject or teacher.', null, 'search');
  if (chosen) {
    const mine = chosen.teacher_id === ctx.me.id;
    const editable = (ctx.isAdmin || mine) && !chosen.year?.closed;
    const roster = await getRoster(chosen.id);
    detail = card(h('span', {}, className(chosen), h('small', { style: 'margin-left: 10px' }, `Teacher: ${chosen.teacher?.name || 'Not assigned'} · ${roster.length} students`)),
      h('div', { class: 'row' }, editable ? h('span', { class: 'tag ok' }, ctx.isAdmin ? 'Editable' : 'Yours') : h('span', { class: 'tag' }, 'View only'),
        h('span', { class: 'grow' }), btn('Open Gradebook', { small: true, primary: true, href: ctx.link(editable ? 'Main' : 'AllClasses', { class: chosen.id }) })),
      await gradebookSection(ctx, chosen, { compact: true }));
  }

  mount(ctx.main, h('div', { class: 'stack' }, pageHead('All Classes', intro), form,
    matches.length > 1 ? h('div', { class: 'stack', style: 'gap: 8px' }, h('div', { class: 'muted small' }, `${matches.length} classes match`), list) : null,
    detail));
}
