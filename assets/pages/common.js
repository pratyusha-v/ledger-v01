// Pieces shared by several pages: class side columns and class headers.
import { h, mount, getCurrentYear, getClasses, getGrades, getStaff, getSubjects, select, field, className } from '../lib.js';

// Teacher side column: homeroom first, then own classes; or every class when browsing.
export async function teacherSidebar(ctx, { classId, gradeId, browse = false } = {}) {
  if (!ctx.aside) return;
  const year = await getCurrentYear();
  const [classes, grades] = await Promise.all([getClasses(year.id), getGrades()]);
  const homeroom = grades.filter((g) => g.class_teacher_id === ctx.me.id);
  const own = classes.filter((c) => c.teacher_id === ctx.me.id);

  if (browse) {
    const filter = h('input', { class: 'in', placeholder: 'Filter classes', 'aria-label': 'Filter classes', style: 'margin-bottom: 8px' });
    const list = h('div', { style: 'display: flex; flex-direction: column; gap: 2px' });
    const draw = () => {
      const q = filter.value.toLowerCase();
      const groups = grades.map((g) => [g, classes.filter((c) => c.grade_id === g.id && className(c).toLowerCase().includes(q))]).filter(([, cs]) => cs.length);
      mount(list, groups.map(([g, cs]) => [
        h('div', { class: 'side-h', style: 'padding-top: 10px' }, g.name),
        cs.map((c) => {
          const mine = c.teacher_id === ctx.me.id;
          return h('a', { class: 'side-link', href: ctx.link(mine ? 'Main' : 'AllClasses', { class: c.id }), 'aria-current': c.id === classId ? 'true' : undefined },
            h('span', {}, c.subject.name), h('small', {}, mine ? 'Yours' : c.teacher?.name || 'No teacher'));
        }),
      ]));
    };
    filter.addEventListener('input', draw);
    draw();
    mount(ctx.aside, filter, list);
    return;
  }

  // Homeroom attendance lives on the class's own Attendance tab, so only classes are listed.
  const homeroomIds = new Set(homeroom.map((g) => g.id));
  mount(ctx.aside,
    h('div', { class: 'side-h' }, 'My Classes'),
    own.length ? own.map((c) => h('a', { class: 'side-link', href: ctx.link('Main', { class: c.id }), 'aria-current': c.id === classId ? 'true' : undefined },
      h('span', {}, className(c)), h('small', {}, homeroomIds.has(c.grade_id) ? '★ Class teacher' : 'Subject teacher')))
      : h('p', { class: 'muted small', style: 'padding: 0 10px' }, 'No classes assigned yet.'));
}

// Admin side column: filter every class by grade, subject and teacher.
export async function adminSidebar(ctx, { classId } = {}) {
  if (!ctx.aside) return;
  const year = await getCurrentYear();
  const [classes, grades, subjects, staff] = await Promise.all([getClasses(year.id), getGrades(), getSubjects(), getStaff()]);
  const current = classes.find((c) => c.id === classId);
  const g = select([['', 'All grades'], ...grades.map((x) => [x.id, x.name])], current?.grade_id ?? '');
  const s = select([['', 'All subjects'], ...subjects.filter((x) => x.academic).map((x) => [x.id, x.name])], '');
  const t = select([['', 'Any teacher'], ...staff.filter((x) => x.role === 'teacher').map((x) => [x.id, x.name])], '');
  const list = h('div', { style: 'display: flex; flex-direction: column; gap: 2px' });
  const count = h('span', {});
  const draw = () => {
    const rows = classes.filter((c) => (!g.value || c.grade_id === +g.value) && (!s.value || c.subject_id === +s.value) && (!t.value || c.teacher_id === t.value));
    count.textContent = `Matching classes · ${rows.length}`;
    mount(list, rows.map((c) => h('a', { class: 'side-link', href: ctx.link('Main', { class: c.id }), 'aria-current': c.id === classId ? 'true' : undefined },
      h('span', {}, className(c)), h('small', {}, c.teacher?.name || 'No teacher'))));
  };
  [g, s, t].forEach((x) => x.addEventListener('change', draw));
  draw();
  mount(ctx.aside,
    h('div', { class: 'side-h' }, 'Find a class', h('a', { href: 'AdminAllClassesStart.html', style: 'font-size: 12px; text-transform: none; letter-spacing: 0' }, 'Search')),
    field('Grade', g), field('Subject', s), field('Teacher', t),
    h('div', { class: 'side-sep' }), h('div', { class: 'side-h' }, count), list);
}

export function classSidebar(ctx, opts) {
  return ctx.isAdmin ? adminSidebar(ctx, opts) : teacherSidebar(ctx, opts);
}

// Gradebook / Attendance tabs for a class page.
export function classTabs(ctx, cls, active) {
  const items = [['gradebook', 'Gradebook'], ['attendance', 'Attendance']];
  return h('nav', { class: 'tabs', 'aria-label': 'Class sections' }, items.map(([key, label]) => {
    const href = key === 'gradebook'
      ? ctx.link(ctx.isAdmin || cls.teacher_id === ctx.me.id ? 'Main' : 'AllClasses', { class: cls.id })
      : ctx.isAdmin ? ctx.link('Attendance', { grade: cls.grade_id, class: cls.id })
      : cls.grade.class_teacher_id === ctx.me.id ? ctx.link('Attendance', { grade: cls.grade_id, class: cls.id }) : `AttendanceView.html?class=${cls.id}`;
    return h('a', { class: 'tab' + (key === active ? ' on' : ''), href, 'aria-current': key === active ? 'page' : undefined }, label);
  }));
}
