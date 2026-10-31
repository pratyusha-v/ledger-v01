-- Teachers edit skills & conduct and feedback for students in the subjects they
-- teach. Profiles are admin-write only, so this goes through a checked function:
-- the caller must be an admin, or teach this year's class of that subject with
-- the student on its roster.
create function public.set_subject_notes(p_student int, p_subject int, p_notes jsonb) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if not (private.is_admin() or exists (
    select 1 from classes c
    join academic_years y on y.id = c.year_id and y.is_current
    join enrollments e on e.class_id = c.id and e.student_id = p_student
    where c.subject_id = p_subject and c.teacher_id = private.my_staff_id()
  )) then
    raise exception 'Only this subject''s teacher or an admin can edit these notes.';
  end if;
  update students
     set profile = coalesce(profile, '{}') || jsonb_build_object('subjects',
       coalesce(profile -> 'subjects', '{}') || jsonb_build_object(p_subject::text, jsonb_build_object(
         'skills', coalesce(p_notes -> 'skills', '[]'),
         'teacher_feedback', coalesce(p_notes ->> 'teacher_feedback', ''),
         'student_feedback', coalesce(p_notes ->> 'student_feedback', ''))))
   where id = p_student;
end
$$;
revoke execute on function public.set_subject_notes(int, int, jsonb) from public, anon;
grant execute on function public.set_subject_notes(int, int, jsonb) to authenticated;
