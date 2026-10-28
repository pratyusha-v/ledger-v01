// My Schedule (teacher): this term's published timetable, view only.
import { db, must, h, mount, param, go, getCurrentYear, getTerms, getPeriods, getSettings, getClasses, btn, pageHead, emptyState, select, tag } from '../lib.js';
import { DAYS, grid, currentTerm } from './scheduling.js';

export async function render(ctx) {
  const year = await getCurrentYear();
  const [terms, periods, settings, classes] = await Promise.all([getTerms(year.id), getPeriods(), getSettings(), getClasses(year.id)]);
  const def = await currentTerm(year);
  const termId = Number(param('term')) || def?.id;
  const term = terms.find((t) => t.id === termId);
  const days = DAYS.slice(0, settings.week_days === 'Mon–Fri' ? 5 : 6);
  const status = termId ? must(await db.from('timetable_status').select('*').eq('term_id', termId).maybeSingle()) : null;
  const slots = status?.published
    ? must(await db.from('timetable_slots').select('*, grade:grade_levels(id, name), subject:subjects(id, name), room:rooms(name)').eq('term_id', termId).eq('teacher_id', ctx.me.id))
    : [];
  const termSel = terms.length ? select(terms.map((t) => [t.id, t.name]), termId, { style: 'width: auto', onchange: (e) => go('MySchedule.html?term=' + e.target.value) }) : null;

  const head = pageHead('My Schedule', `Your weekly timetable · ${term?.name || '—'} · Set by the school office`,
    [termSel, btn('Download PDF', { icon: 'download', onclick: () => window.print() })]);
  if (!slots.length) {
    mount(ctx.main, h('div', { class: 'stack' }, head, emptyState(status?.published ? 'No periods assigned' : 'No timetable published yet',
      status?.published ? 'You don’t have any periods in this term’s timetable.' : 'Your schedule will appear here once the school office publishes the timetable for this term.', null, 'cal')));
    return;
  }
  const classFor = (s) => classes.find((c) => c.grade_id === s.grade_id && c.subject_id === s.subject_id && c.teacher_id === ctx.me.id);
  mount(ctx.main, h('div', { class: 'stack' }, head,
    h('div', { class: 'note' }, 'View only. To change your timetable, contact the school office. Click a class to open it.'),
    grid({ periods, days, cellFor: (day, p) => {
      const s = slots.find((x) => x.day === day && x.period_id === p.id);
      if (!s) return '';
      const c = classFor(s);
      const kids = [`${s.grade.name} – ${s.subject.name}`, h('small', {}, s.room?.name || 'No room')];
      return c ? h('a', { class: 'slot me', href: `Main.html?class=${c.id}` }, kids) : h('div', { class: 'slot' }, kids);
    } }),
    h('div', { class: 'row small muted' }, h('span', { class: 'slot me', style: 'min-height: 0; width: auto; padding: 2px 10px' }, 'Your class'),
      h('span', { class: 'slot', style: 'min-height: 0; width: auto; padding: 2px 10px' }, 'Other teaching periods'), 'Empty = free period',
      tag(`Published`, 'ok'))));
}
