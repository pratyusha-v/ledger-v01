-- Staff leave: a leave covers one day or a range. Every school day in it is
-- marked absent in staff_attendance automatically, linked back to the leave,
-- so removing the leave clears those days again.
create table staff_leaves (
  id serial primary key,
  staff_id uuid not null references staff on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text default '',
  created_by_name text default '',
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index on staff_leaves (staff_id);

alter table staff_leaves enable row level security;
create policy "admin or self read" on staff_leaves for select to authenticated
  using ((select private.is_admin()) or staff_id = (select private.my_staff_id()));
create policy "admin insert" on staff_leaves for insert to authenticated with check ((select private.is_admin()));
create policy "admin update" on staff_leaves for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete" on staff_leaves for delete to authenticated using ((select private.is_admin()));

alter table staff_attendance add column leave_id int references staff_leaves on delete cascade;
create index on staff_attendance (leave_id);

-- Earlier demo data used a 'Leave' status; turn each into a one-day leave.
with old as (
  select staff_id, on_date from staff_attendance where status = 'Leave'
), made as (
  insert into staff_leaves (staff_id, starts_on, ends_on, reason, created_by_name)
  select staff_id, on_date, on_date, '', 'Shakeera' from old
  returning id, staff_id, starts_on
)
update staff_attendance a set status = 'A', remark = 'On leave', leave_id = made.id
from made where a.staff_id = made.staff_id and a.on_date = made.starts_on;

alter table staff_attendance drop constraint staff_attendance_status_check;
alter table staff_attendance add constraint staff_attendance_status_check check (status in ('P', 'A', 'L'));

-- Mark the leave's school days absent (Mon–Sat, or Mon–Fri per School Settings).
create function private.apply_staff_leave() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  last_dow int := case when (select week_days from school_settings where id = 1) = 'Mon–Fri' then 5 else 6 end;
begin
  delete from staff_attendance where leave_id = new.id;
  insert into staff_attendance (staff_id, on_date, status, remark, leave_id)
  select new.staff_id, d::date, 'A', 'On leave', new.id
  from generate_series(new.starts_on, new.ends_on, '1 day') d
  where extract(isodow from d) <= last_dow
  on conflict (staff_id, on_date) do update set status = 'A', remark = 'On leave', leave_id = excluded.leave_id;
  return new;
end
$$;
revoke execute on function private.apply_staff_leave() from public, anon, authenticated;
create trigger staff_leave_days after insert or update of staff_id, starts_on, ends_on on staff_leaves
for each row execute function private.apply_staff_leave();

-- Demo: a few upcoming leaves.
insert into staff_leaves (staff_id, starts_on, ends_on, reason, created_by_name)
select s.id, v.starts::date, v.ends::date, v.reason, 'Shakeera'
from (values
  ('ravi@example.com', '2026-11-03', '2026-11-05', 'Family function'),
  ('padma@example.com', '2026-11-10', '2026-11-10', 'Medical appointment'),
  ('suresh@example.com', '2026-11-16', '2026-11-21', 'Training workshop')
) as v(email, starts, ends, reason)
join staff s on s.email = v.email;
