// Assigning teachers: a type-ahead teacher picker, a multi-class picker
// ("Grade 6 - Mathematics"), a class-teacher field, and the save that applies
// them. Used by Subjects, Invite Staff and the Staff Profile.
import { db, must, h, mount, input, select, field, confirmBox, clearCache } from '../lib.js';

let uid = 0;
const short = (name) => (name || '').replace(/^(Ms|Mr|Mrs|Dr)\.?\s+/i, '');

// A text field that suggests teachers as you type; .teacherId reads the match ('' when blank).
export function teacherPicker(teachers, value, props = {}) {
  const id = 'teachers-' + ++uid;
  const el = input({ list: id, autocomplete: 'off', placeholder: 'Start typing a name', value: teachers.find((t) => t.id === value)?.name || '', ...props });
  const wrap = h('span', { style: 'display: block' }, el, h('datalist', { id }, teachers.map((t) => h('option', { value: t.name }))));
  const find = () => {
    const v = el.value.trim().toLowerCase();
    return v ? teachers.find((t) => t.name.toLowerCase() === v) || teachers.find((t) => short(t.name).toLowerCase() === v) : null;
  };
  Object.defineProperty(wrap, 'teacherId', { get: () => {
    if (!el.value.trim()) return '';
    const t = find();
    if (!t) throw new Error(`No teacher called “${el.value.trim()}”. Pick a name from the list.`);
    return t.id;
  } });
  wrap.input = el;
  return wrap;
}

export const classLabel = (c) => `${c.grade.name} - ${c.subject.name}`;

// Several classes, picked by typing "Grade 6 - Math…"; .picked holds the chosen class ids.
export function classPicker(classes, picked, staffId) {
  const id = 'classes-' + ++uid;
  const chosen = [...picked];
  const label = (c) => classLabel(c) + (c.teacher_id && c.teacher_id !== staffId ? ` (now ${c.teacher?.name || 'another teacher'})` : '');
  const chips = h('div', { class: 'row', style: 'gap: 6px' });
  const draw = () => mount(chips, chosen.length ? chosen.map((cid) => {
    const c = classes.find((x) => x.id === cid);
    return h('span', { class: 'tag' }, classLabel(c), ' ',
      h('button', { type: 'button', style: 'border: 0; background: none; cursor: pointer; padding: 0 2px; font: inherit', 'aria-label': `Remove ${classLabel(c)}`,
        onclick: () => { chosen.splice(chosen.indexOf(cid), 1); draw(); } }, '×'));
  }) : h('span', { class: 'muted small' }, 'No classes yet.'));
  draw();
  const find = input({ list: id, autocomplete: 'off', placeholder: 'Type a grade or subject, e.g. Grade 6 - Math' });
  const add = () => {
    const c = classes.find((x) => label(x) === find.value || classLabel(x) === find.value);
    if (c && !chosen.includes(c.id)) { chosen.push(c.id); draw(); }
    if (c) find.value = '';
  };
  find.addEventListener('change', add);
  find.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const wrap = h('div', { class: 'stack', style: 'gap: 8px' }, chips, find,
    h('datalist', { id }, classes.map((c) => h('option', { value: label(c) }))));
  wrap.picked = chosen;
  return wrap;
}

// "Class teacher?" No/Yes, with the grade when Yes; .gradeId reads it ('' for No).
export function classTeacherField(grades, gradeId) {
  const yes = select([['no', 'No'], ['yes', 'Yes']], gradeId ? 'yes' : 'no');
  const grade = select([['', 'Select grade'], ...grades.map((g) => [g.id, g.name + (g.class_teacher ? ` (now ${g.class_teacher.name})` : '')])], gradeId ?? '');
  const gradeField = field('Class teacher of', grade);
  const sync = () => { gradeField.style.visibility = yes.value === 'yes' ? '' : 'hidden'; };
  yes.addEventListener('change', sync);
  sync();
  const wrap = h('div', { class: 'grid2' }, field('Class teacher?', yes), gradeField);
  Object.defineProperty(wrap, 'gradeId', { get: () => {
    if (yes.value !== 'yes') return '';
    if (!grade.value) throw new Error('Select the grade they are class teacher of.');
    return +grade.value;
  } });
  return wrap;
}

// Ask before replacing another grade's class teacher. Resolves false to stop.
export async function confirmClassTeacher(grades, gradeId, staffId, staffName) {
  const g = grades.find((x) => x.id === gradeId);
  if (!g?.class_teacher_id || g.class_teacher_id === staffId) return true;
  return confirmBox(`Replace ${g.name}’s class teacher?`,
    `${g.class_teacher?.name || 'Another teacher'} is the class teacher of ${g.name}. Making ${staffName} the class teacher removes ${g.class_teacher?.name || 'them'}’s attendance access for ${g.name} and gives it to ${staffName}.`,
    'Yes, replace', false);
}

// Give a teacher exactly these classes this year and (optionally) one homeroom grade.
// Classes taken from them lose their teacher; the timetable plan follows, so
// periods placed from now on carry the new teacher.
export async function saveAssignments({ staffId, classes, picked, grades, gradeId }) {
  const had = classes.filter((c) => c.teacher_id === staffId).map((c) => c.id);
  const add = picked.filter((id) => !had.includes(id));
  const drop = had.filter((id) => !picked.includes(id));
  const setTeacher = async (ids, teacherId) => {
    if (!ids.length) return;
    must(await db.from('classes').update({ teacher_id: teacherId }).in('id', ids));
    for (const c of classes.filter((x) => ids.includes(x.id))) {
      must(await db.from('timetable_plan').update({ teacher_id: teacherId }).eq('year_id', c.year_id).eq('grade_id', c.grade_id).eq('subject_id', c.subject_id));
    }
  };
  await setTeacher(add, staffId);
  await setTeacher(drop, null);
  clearCache();
  if (gradeId === undefined) return;
  const was = grades.filter((g) => g.class_teacher_id === staffId && g.id !== gradeId).map((g) => g.id);
  if (was.length) must(await db.from('grade_levels').update({ class_teacher_id: null }).in('id', was));
  if (gradeId) must(await db.from('grade_levels').update({ class_teacher_id: staffId }).eq('id', gradeId));
}
