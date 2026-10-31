-- Every student gets the admission documents on their profile as soon as they
-- are enrolled, marked submitted (with the file, when there is one) from their
-- application. Admins upload the rest later from the student page.
update student_documents set name = 'Transfer certificate (TC)' where name = 'TC / Bonafide';
alter table student_documents add constraint student_documents_student_name_key unique (student_id, name);

create function private.add_required_documents() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  insert into student_documents (student_id, name, submitted, file_path, position)
  select new.id, d.label,
         coalesce(a.documents ->> d.key, 'missing') <> 'missing',
         nullif(nullif(a.documents ->> d.key, 'uploaded'), 'missing'),
         d.pos
  from (values (1, 'birth', 'Birth certificate'), (2, 'tc', 'Transfer certificate (TC)'),
               (3, 'aadhaar', 'Aadhaar (masked)'), (4, 'report', 'Previous report card')) d(pos, key, label)
  left join lateral (select documents from applications where student_id = new.id order by id desc limit 1) a on true
  on conflict (student_id, name) do nothing;
  return new;
end
$$;
revoke execute on function private.add_required_documents() from public, anon, authenticated;
create trigger students_documents after insert on students for each row execute function private.add_required_documents();

-- Existing students.
insert into student_documents (student_id, name, submitted, file_path, position)
select s.id, d.label,
       coalesce(a.documents ->> d.key, 'missing') <> 'missing',
       nullif(nullif(a.documents ->> d.key, 'uploaded'), 'missing'),
       d.pos
from students s
cross join (values (1, 'birth', 'Birth certificate'), (2, 'tc', 'Transfer certificate (TC)'),
                   (3, 'aadhaar', 'Aadhaar (masked)'), (4, 'report', 'Previous report card')) d(pos, key, label)
left join lateral (select documents from applications where student_id = s.id order by id desc limit 1) a on true
on conflict (student_id, name) do nothing;
