-- How many periods a week each grade needs of each subject. The timetable's
-- "Unplaced subjects" are these needs minus the periods already placed.
create table timetable_plan (
  id serial primary key,
  year_id int not null references academic_years on delete cascade,
  grade_id int not null references grade_levels on delete cascade,
  subject_id int not null references subjects on delete cascade,
  teacher_id uuid references staff on delete set null,
  room_id int references rooms on delete set null,
  periods_per_week int not null default 5 check (periods_per_week between 0 and 48),
  unique (year_id, grade_id, subject_id)
);
create index on timetable_plan (teacher_id);
create index on timetable_plan (room_id);
create index on timetable_plan (grade_id);
create index on timetable_plan (subject_id);

alter table timetable_plan enable row level security;
create policy "staff read" on timetable_plan for select to authenticated using ((select private.is_staff()));
create policy "admin insert" on timetable_plan for insert to authenticated with check ((select private.is_admin()));
create policy "admin update" on timetable_plan for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete" on timetable_plan for delete to authenticated using ((select private.is_admin()));

-- A new class lands in the plan, so it shows up as unplaced until someone schedules it.
create function private.plan_new_class() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  insert into timetable_plan (year_id, grade_id, subject_id, teacher_id, periods_per_week)
  values (new.year_id, new.grade_id, new.subject_id, new.teacher_id, 5)
  on conflict (year_id, grade_id, subject_id) do nothing;
  return new;
end
$$;
revoke execute on function private.plan_new_class() from public, anon, authenticated;
create trigger classes_plan after insert on classes for each row execute function private.plan_new_class();

-- Demo plan: what Grade 6 already has, plus a few periods still to place.
insert into timetable_plan (year_id, grade_id, subject_id, teacher_id, room_id, periods_per_week)
select tm.year_id, t.grade_id, t.subject_id, min(t.teacher_id::text)::uuid, min(t.room_id), count(*)
from timetable_slots t join terms tm on tm.id = t.term_id
where tm.name = 'Term 2'
group by tm.year_id, t.grade_id, t.subject_id;

update timetable_plan p set periods_per_week = periods_per_week + 1
from subjects s, grade_levels g
where s.id = p.subject_id and g.id = p.grade_id and g.name = 'Grade 6' and s.name in ('Physical Science', 'Games');

insert into timetable_plan (year_id, grade_id, subject_id, teacher_id, room_id, periods_per_week)
select y.id, g.id, s.id, st.id, r.id, 2
from academic_years y, grade_levels g, subjects s, staff st, rooms r
where y.is_current and g.name = 'Grade 6' and s.name = 'Art' and st.email = 'kavitha@example.com' and r.name = 'Room 6';

-- Grade 7 and 8 classes need four periods a week each.
insert into timetable_plan (year_id, grade_id, subject_id, teacher_id, room_id, periods_per_week)
select c.year_id, c.grade_id, c.subject_id, c.teacher_id, r.id, 4
from classes c
join academic_years y on y.id = c.year_id and y.is_current
join grade_levels g on g.id = c.grade_id and g.name in ('Grade 7', 'Grade 8')
left join rooms r on r.name = replace(g.name, 'Grade', 'Room')
on conflict (year_id, grade_id, subject_id) do update set periods_per_week = 4, room_id = excluded.room_id;

-- Place three of each Grade 7 class's four periods where the teacher and grade are free.
do $$
declare
  p record;
  slot record;
  placed int;
  v_term int := (select id from terms where name = 'Term 2');
begin
  for p in
    select tp.* from timetable_plan tp join grade_levels g on g.id = tp.grade_id
    where g.name = 'Grade 7' order by tp.subject_id
  loop
    placed := 0;
    for slot in
      select d.day, pr.id as period_id
      from generate_series(1, 6) d(day) cross join periods pr
      where pr.kind = 'class'
      order by (d.day * 7 + pr.position * 3 + p.subject_id) % 11, d.day, pr.position
    loop
      exit when placed >= 3;
      if not exists (select 1 from timetable_slots s where s.term_id = v_term and s.day = slot.day and s.period_id = slot.period_id
                       and (s.grade_id = p.grade_id or s.teacher_id = p.teacher_id or s.room_id = p.room_id)) then
        insert into timetable_slots (term_id, grade_id, day, period_id, subject_id, teacher_id, room_id)
        values (v_term, p.grade_id, slot.day, slot.period_id, p.subject_id, p.teacher_id, p.room_id);
        placed := placed + 1;
      end if;
    end loop;
  end loop;
end
$$;
