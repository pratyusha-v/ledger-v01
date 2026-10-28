// All Classes: find any class by grade, subject, teacher and year.
import { h, mount, param, getYears, getCurrentYear, getClasses, getGrades, getSubjects, getStaff, getClass, className,
  select, field, btn, pageHead, emptyState, card, getRoster } from '../lib.js';
import { gradebookSection } from './gradebook.js';

const RECENT = 'ledger-recent-classes';
function recent() { try { return JSON.parse(localStorage.getItem(RECENT)) || []; } catch { return []; } }
function remember(id) { try { localStorage.setItem(RECENT, JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, 5))); } catch { /* storage off */ } }

export async function render(ctx) {
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
