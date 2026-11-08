-- Every made-up student, applicant and staff name in the demo data is a female
-- name. Each old name is swapped wherever it was written down (profiles,
-- applications, transfers, withdrawals, the activity log, "Parent of …" labels).
create temp table renames (old text, new text, ord int);
insert into renames values
  ('Sai Kiran M.', 'Sai Keerthana M.', 1), ('Sai Teja R.', 'Sai Tejaswini R.', 1),
  ('Arjun T.', 'Anjali T.', 2), ('Ganesh P.', 'Gayathri P.', 2), ('Nikhil S.', 'Nikitha S.', 2),
  ('Arvind K.', 'Aruna K.', 2), ('Harsha V.', 'Harshini V.', 2), ('Vamsi Krishna', 'Vaishnavi Krishna', 2),
  ('Manoj K.', 'Madhuri K.', 2), ('Tarun M.', 'Tanvi M.', 2), ('Rohith N.', 'Rohini N.', 2),
  ('Yaswanth A.', 'Yamini A.', 2), ('Naveen S.', 'Navya S.', 2), ('Charan Teja', 'Charitha Teja', 2),
  ('Karthik M.', 'Kavya M.', 2), ('Farhan Ali', 'Farah Ali', 2),
  ('Mr. Suresh B.', 'Ms. Sujatha B.', 2), ('Mr. Ravi Kumar', 'Ms. Revathi Kumar', 2);

create function pg_temp.swap(t text) returns text language plpgsql as $$
declare r record;
begin
  if t is null then return null; end if;
  for r in select * from renames order by ord loop t := replace(t, r.old, r.new); end loop;
  return t;
end $$;

update students set full_name = pg_temp.swap(full_name), display_name = pg_temp.swap(display_name), gender = 'Female'
  where full_name in (select old from renames) or gender = 'Male';
update applications set full_name = pg_temp.swap(full_name), guardians = pg_temp.swap(guardians::text)::jsonb, gender = 'Female'
  where full_name in (select old from renames) or gender = 'Male' or guardians::text ~ 'Parent of';
update transfers set student_name = pg_temp.swap(student_name);
update withdrawals set student_name = pg_temp.swap(student_name);
update activity_log set student_name = pg_temp.swap(student_name);
update guardians set name = pg_temp.swap(name) where name like 'Parent of %';
update staff set name = pg_temp.swap(name);
update staff set email = 'sujatha@example.com' where email = 'suresh@example.com';
update staff set email = 'revathi@example.com' where email = 'ravi@example.com';
