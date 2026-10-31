-- Teachers can add students to the rosters of classes they teach.
create policy "teacher insert" on enrollments for insert to authenticated
  with check ((select private.teaches_class(class_id)));
