// A teacher's weekly timetable, view only. Shown on the teacher dashboard;
// the old My Schedule page now sends people there.
import { db, must, h, mount, go, getCurrentYear, getTerms, getPeriods, getSettings, getClasses, emptyState, select, tag, card } from '../lib.js';
import { DAYS, grid, currentTerm } from './scheduling.js';

async function scheduleBody(ctx, termId, periods, days, classes) {
  const status = termId ? must(await db.from('timetable_status').select('*').eq('term_id', termId).maybeSingle()) : null;
  const slots = status?.published
    ? must(await db.from('timetable_slots').select('*, grade:grade_levels(id, name), subject:subjects(id, name), room:rooms(name)').eq('term_id', termId).eq('teacher_id', ctx.me.id))
    : [];
  if (!slots.length) {
    return emptyState(status?.published ? 'No periods assigned' : 'No timetable published yet',
      status?.published ? 'You don’t have any periods in this term’s timetable.' : 'Your timetable will appear here once the school office publishes it for this term.', null, 'cal');
  }
  const classFor = (s) => classes.find((c) => c.grade_id === s.grade_id && c.subject_id === s.subject_id && c.teacher_id === ctx.me.id);
  return h('div', { class: 'stack', style: 'gap: 10px' },
    grid({ periods, days, cellFor: (day, p) => {
      const s = slots.find((x) => x.day === day && x.period_id === p.id);
      if (!s) return '';
      const c = classFor(s);
      const kids = [`${s.grade.name} – ${s.subject.name}`, h('small', {}, s.room?.name || 'No room')];
      return c ? h('a', { class: 'slot me', href: ctx.link('Main', { class: c.id }) }, kids) : h('div', { class: 'slot' }, kids);
    } }),
    h('div', { class: 'row small muted' }, h('span', { class: 'slot me', style: 'min-height: 0; width: auto; padding: 2px 10px' }, 'Your class'),
      h('span', { class: 'slot', style: 'min-height: 0; width: auto; padding: 2px 10px' }, 'Other teaching periods'), 'Empty = free period',
      tag('Published', 'ok'), 'Set by the school office. Click a class to open it.'));
}

// The "My Timetable" card for the teacher dashboard, with a term picker.
export async function scheduleCard(ctx) {
  const year = await getCurrentYear();
  const [terms, periods, settings, classes] = await Promise.all([getTerms(year.id), getPeriods(), getSettings(), getClasses(year.id)]);
  const def = await currentTerm(year);
  const days = DAYS.slice(0, settings.week_days === 'Mon–Fri' ? 5 : 6);
  const body = h('div', {});
  const draw = async (termId) => mount(body, await scheduleBody(ctx, termId, periods, days, classes));
  const termSel = terms.length ? select(terms.map((t) => [t.id, t.name]), def?.id, {
    style: 'width: auto; height: 32px', 'aria-label': 'Term', onchange: (e) => draw(Number(e.target.value)),
  }) : null;
  await draw(def?.id);
  return card(h('span', { class: 'row', style: 'width: 100%; justify-content: space-between' }, 'My Timetable', termSel), body);
}

export function render() {
  go('Dashboard.html');
}
