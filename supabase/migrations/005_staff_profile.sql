-- Staff profile details and staff attendance, for the admin's Staff Directory.
alter table staff
  add column dob date,
  add column joined_on date,
  add column photo_path text;

create table staff_attendance (
  staff_id uuid not null references staff on delete cascade,
  on_date date not null,
  status text not null check (status in ('P', 'A', 'L', 'Leave')),
  remark text default '',
  primary key (staff_id, on_date)
);

-- Admins see and record everyone's attendance; staff can see only their own.
alter table staff_attendance enable row level security;
create policy "admin or self read" on staff_attendance for select to authenticated
  using ((select private.is_admin()) or staff_id = (select private.my_staff_id()));
create policy "admin insert" on staff_attendance for insert to authenticated with check ((select private.is_admin()));
create policy "admin update" on staff_attendance for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete" on staff_attendance for delete to authenticated using ((select private.is_admin()));

-- Demo details.
update staff set dob = v.dob::date, joined_on = v.joined::date
from (values
  ('vineetha@example.com', '1988-04-12', '2016-06-01'),
  ('shakeera@example.com', '1985-09-03', '2014-06-02'),
  ('ravi@example.com', '1990-01-25', '2019-06-03'),
  ('padma@example.com', '1983-11-08', '2012-06-04'),
  ('suresh@example.com', '1987-07-19', '2017-06-05'),
  ('kavitha@example.com', '1992-03-30', '2021-06-01'),
  ('anitha@example.com', '1994-12-14', '2026-10-01')
) as v(email, dob, joined)
where staff.email = v.email;

-- Demo attendance for active staff, Mon–Sat school days of the current year so far.
insert into staff_attendance (staff_id, on_date, status)
select s.id, d::date,
  case when abs(hashtext(s.email || d::text)) % 100 < 2 then 'Leave'
       when abs(hashtext(s.email || d::text)) % 100 < 4 then 'A'
       when abs(hashtext(s.email || d::text)) % 100 < 7 then 'L'
       else 'P' end
from staff s
cross join generate_series('2025-06-02'::date, '2026-02-27'::date, '1 day') d
where s.status = 'active'
  and extract(isodow from d) < 7
  and d::date not in ('2025-08-15', '2025-10-02', '2025-10-20', '2025-12-25', '2026-01-14', '2026-01-15', '2026-01-26');

-- Demo phone numbers (fictional).
update staff set phone = '90000 1' || lpad((row_number)::text, 4, '0')
from (select id, row_number() over (order by created_at, name) from staff) r
where r.id = staff.id and coalesce(staff.phone, '') = '';
