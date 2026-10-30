-- Subjects per grade. A grade offers a subject when it has a class for it this
-- year (a new class lands in the timetable's Unplaced subjects, see 007).
-- A mandatory class enrols every active student of its grade, now and as they
-- join the grade.
alter table classes add column mandatory boolean not null default false;

-- Enrol the grade's active students when a class is made mandatory.
create function private.enrol_mandatory_class() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.mandatory then
    insert into enrollments (class_id, student_id)
    select new.id, s.id from students s
    where s.grade_id = new.grade_id and s.status = 'active'
      and exists (select 1 from academic_years y where y.id = new.year_id and y.is_current)
    on conflict do nothing;
  end if;
  return new;
end
$$;
revoke execute on function private.enrol_mandatory_class() from public, anon, authenticated;
create trigger classes_mandatory after insert or update of mandatory on classes
for each row execute function private.enrol_mandatory_class();

-- Enrol a student in their grade's mandatory classes when they join a grade.
create function private.enrol_student_mandatory() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.status = 'active' and new.grade_id is not null then
    insert into enrollments (class_id, student_id)
    select c.id, new.id from classes c join academic_years y on y.id = c.year_id and y.is_current
    where c.grade_id = new.grade_id and c.mandatory
    on conflict do nothing;
  end if;
  return new;
end
$$;
revoke execute on function private.enrol_student_mandatory() from public, anon, authenticated;
create trigger students_mandatory after insert or update of grade_id, status on students
for each row execute function private.enrol_student_mandatory();

-- Existing data: academic classes are mandatory.
update classes set mandatory = true
from subjects s where s.id = classes.subject_id and s.academic;

-- Planned extracurriculars become classes too, so they show in My Classes and
-- All Classes. Games and Yoga are for everyone; the rest are optional.
insert into classes (year_id, grade_id, subject_id, teacher_id, mandatory)
select p.year_id, p.grade_id, p.subject_id, p.teacher_id, s.name in ('Games', 'Yoga')
from timetable_plan p
join academic_years y on y.id = p.year_id and y.is_current
join subjects s on s.id = p.subject_id
on conflict (year_id, grade_id, subject_id) do nothing;
