-- Student page rework.
-- Health is kept per academic year (height and weight per term, plus eyesight
-- and other health issues), with ongoing notes any staff member can add.
-- Skills, conduct and feedback move under each subject, and co-curricular
-- details under each activity, inside students.profile.

alter table health_records add column year_id int references academic_years on delete cascade;
update health_records set year_id = (select id from academic_years where is_current);
alter table health_records alter column year_id set not null;
alter table health_records drop constraint health_records_pkey;
alter table health_records add primary key (student_id, year_id, term_no);
create index on health_records (year_id);

create table health_years (
  student_id int not null references students on delete cascade,
  year_id int not null references academic_years on delete cascade,
  eyesight text default '',
  health_issues text default '',
  primary key (student_id, year_id)
);
create index on health_years (year_id);
alter table health_years enable row level security;
create policy "staff read" on health_years for select to authenticated using ((select private.is_staff()));
create policy "admin insert" on health_years for insert to authenticated with check ((select private.is_admin()));
create policy "admin update" on health_years for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete" on health_years for delete to authenticated using ((select private.is_admin()));

insert into health_years (student_id, year_id, eyesight, health_issues)
select s.id, y.id, coalesce(s.profile ->> 'eyesight', ''), coalesce(nullif(s.profile ->> 'health_issues', '—'), '')
from students s, academic_years y
where y.is_current and (s.profile ? 'eyesight' or s.profile ? 'health_issues');

create table health_notes (
  id serial primary key,
  student_id int not null references students on delete cascade,
  noted_on date not null default current_date,
  note text not null,
  author_id uuid references staff on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index on health_notes (student_id);
create index on health_notes (author_id);
alter table health_notes enable row level security;
create policy "staff read" on health_notes for select to authenticated using ((select private.is_staff()));
create policy "staff insert" on health_notes for insert to authenticated
  with check ((select private.is_staff()) and author_id = (select private.my_staff_id()));
create policy "admin or author delete" on health_notes for delete to authenticated
  using ((select private.is_admin()) or author_id = (select private.my_staff_id()));

-- Skills & conduct and teacher feedback, per subject:
-- profile.subjects = { "<subject id>": { skills: [[particular, grade]], teacher_feedback, student_feedback } }
update students s set profile = s.profile || jsonb_build_object('subjects', coalesce((
  select jsonb_object_agg(sub.id::text, jsonb_build_object(
    'skills', coalesce((select jsonb_agg(jsonb_build_array(r ->> 0, r ->> (col.n::int))) from jsonb_array_elements(s.profile -> 'skills' -> 'rows') r), '[]'),
    'teacher_feedback', coalesce((select fb ->> 1 from jsonb_array_elements(s.profile -> 'feedback') fb
      where left(lower(fb ->> 0), 4) = left(lower(sub.name), 4) or (lower(fb ->> 0) = 'science' and sub.name = 'Physical Science') limit 1), ''),
    'student_feedback', ''))
  from jsonb_array_elements_text(s.profile -> 'skills' -> 'columns') with ordinality col(short, n)
  join subjects sub on sub.short_name = col.short), '{}'))
where s.profile ? 'skills';

-- Co-curricular activities: profile.activities = [{ name, level, remarks, competitions, participation, awards }].
-- Seva and Dance are no longer tracked.
update students s set profile = s.profile || jsonb_build_object('activities', coalesce((
  select jsonb_agg(a order by ord) from (
    select 1 as grp, n as ord, jsonb_build_object('name', r ->> 0, 'level', r ->> 1,
      'remarks', case when n = 1 then coalesce((select x ->> 1 from jsonb_array_elements(s.profile -> 'sports') x where x ->> 0 = 'Remarks by in-charge'), '') else '' end,
      'awards', case when n = 1 then coalesce((select x ->> 1 from jsonb_array_elements(s.profile -> 'sports') x where x ->> 0 = 'Awards & certificates'), '') else '' end,
      'competitions', '', 'participation', '') as a
    from jsonb_array_elements(s.profile -> 'sports') with ordinality t(r, n)
    where r ->> 0 not in ('Awards & certificates', 'Remarks by in-charge')
    union all
    select 2, 100 + n, jsonb_build_object('name', r ->> 0, 'level', r ->> 1, 'remarks', r ->> 2, 'awards', '', 'competitions', '', 'participation', '')
    from jsonb_array_elements(s.profile -> 'spiritual') with ordinality t(r, n)
    where lower(r ->> 0) not in ('seva', 'dance')
  ) q), '[]'))
where s.profile ? 'sports' or s.profile ? 'spiritual';

-- Demo: last year's health record and two notes for the first student.
insert into health_records (student_id, year_id, term_no, height_cm, weight_kg, remarks)
select 1, y.id, t.term_no, t.h, t.w, t.r
from academic_years y, (values (1, 145, 45, 'Healthy weight'), (2, 146.5, 46, ''), (3, 148, 47.5, 'Growing well')) t(term_no, h, w, r)
where y.name = '2024–25' and exists (select 1 from students where id = 1);
insert into health_years (student_id, year_id, eyesight, health_issues)
select 1, y.id, '2.0', 'Seasonal cold in December.' from academic_years y
where y.name = '2024–25' and exists (select 1 from students where id = 1);
insert into health_notes (student_id, noted_on, note, author_name)
select 1, d::date, n, 'Shakeera' from (values ('2025-09-12', 'Complained of a headache in the morning. Rested in the sick room and was fine by lunch.'),
  ('2025-10-03', 'Eye check-up booked for next week; parents informed.')) v(d, n)
where exists (select 1 from students where id = 1);
