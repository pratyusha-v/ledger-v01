-- Ledger schema: school records for teachers and admins.
-- Access follows the site architecture: every signed-in staff member can read,
-- teachers write only their own classes (marks) and homeroom (attendance),
-- admins write everything. Admissions, transfers, withdrawals and reports are admin-only.

-- ---------- School setup ----------
create table school_settings (
  id int primary key default 1 check (id = 1),
  school_name text not null default '',
  managed_by text default '',
  udise_code text default '',
  school_code text default '',
  recognised_by text default '',
  week_days text not null default 'Mon–Sat' check (week_days in ('Mon–Sat', 'Mon–Fri')),
  pass_mark numeric not null default 35,
  absent_counts text not null default 'zero' check (absent_counts in ('zero', 'excluded')),
  logo_path text
);

create table academic_years (
  id serial primary key,
  name text not null unique,
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  closed boolean not null default false
);
create unique index one_current_year on academic_years (is_current) where is_current;

create table terms (
  id serial primary key,
  year_id int not null references academic_years on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  main_exam text,
  position int not null default 0
);

create table periods (
  id serial primary key,
  name text not null,
  starts_at time,
  ends_at time,
  kind text not null default 'class' check (kind in ('class', 'break')),
  position int not null default 0
);

create table grading_scale (
  id serial primary key,
  grade text not null,
  meaning text default '',
  position int not null default 0
);

create table attendance_codes (
  code text primary key,
  meaning text not null,
  position int not null default 0
);

create table role_permissions (
  role text not null check (role in ('teacher', 'admin')),
  area text not null,
  level text not null check (level in ('hidden', 'view', 'edit_own', 'full')),
  note text default '',
  position int not null default 0,
  primary key (role, area)
);

-- ---------- People ----------
create table staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete set null,
  name text not null,
  email text not null unique,
  phone text default '',
  role text not null default 'teacher' check (role in ('teacher', 'admin')),
  status text not null default 'invited' check (status in ('active', 'invited', 'inactive')),
  notify jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table grade_levels (
  id serial primary key,
  name text not null unique,
  position int not null default 0,
  class_teacher_id uuid references staff on delete set null
);

create table subjects (
  id serial primary key,
  name text not null unique,
  short_name text,
  academic boolean not null default true,
  position int not null default 0
);

create table classes (
  id serial primary key,
  year_id int not null references academic_years on delete cascade,
  grade_id int not null references grade_levels on delete cascade,
  subject_id int not null references subjects on delete cascade,
  teacher_id uuid references staff on delete set null,
  unique (year_id, grade_id, subject_id)
);

create table students (
  id serial primary key,
  admission_no text unique,
  full_name text not null,
  display_name text,
  grade_id int references grade_levels on delete set null,
  roll_no int,
  residential text check (residential in ('Hostler', 'Day scholar')),
  status text not null default 'active' check (status in ('active', 'withdrawn', 'transferred', 'graduated')),
  dob date,
  gender text,
  aadhaar_last4 text,
  apaar_id text,
  pen text,
  location text,
  state text,
  repeating boolean not null default false,
  family_status text,
  blood_group text,
  profile jsonb not null default '{}',
  left_on date,
  left_year text,
  left_grade text,
  left_reason text,
  created_at timestamptz not null default now()
);

create table enrollments (
  class_id int not null references classes on delete cascade,
  student_id int not null references students on delete cascade,
  primary key (class_id, student_id)
);

create table guardians (
  id serial primary key,
  student_id int not null references students on delete cascade,
  relation text not null,
  name text default '',
  occupation text default '',
  phone text default '',
  email text default '',
  position int not null default 0
);

create table health_records (
  student_id int not null references students on delete cascade,
  term_no int not null check (term_no between 1 and 3),
  height_cm numeric,
  weight_kg numeric,
  remarks text,
  primary key (student_id, term_no)
);

create table student_documents (
  id serial primary key,
  student_id int not null references students on delete cascade,
  name text not null,
  submitted boolean not null default false,
  handled_by text default '',
  file_path text,
  position int not null default 0
);

-- ---------- Classes: tests, marks, attendance ----------
create table evaluations (
  id serial primary key,
  class_id int not null references classes on delete cascade,
  name text not null,
  held_on date,
  max_marks numeric check (max_marks > 0),
  weight numeric check (weight >= 0 and weight <= 100),
  syllabus text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

create table marks (
  evaluation_id int not null references evaluations on delete cascade,
  student_id int not null references students on delete cascade,
  marks numeric check (marks >= 0),
  absent boolean not null default false,
  primary key (evaluation_id, student_id)
);

create table attendance (
  student_id int not null references students on delete cascade,
  on_date date not null,
  grade_id int not null references grade_levels on delete cascade,
  status text not null check (status in ('P', 'A', 'L')),
  remark text default '',
  marked_by uuid references staff on delete set null,
  primary key (student_id, on_date)
);
create index attendance_grade_date on attendance (grade_id, on_date);

-- ---------- Enrollment workflows (admin) ----------
create table applications (
  id serial primary key,
  app_no text unique,
  full_name text not null,
  dob date,
  gender text,
  grade_id int references grade_levels on delete set null,
  residential text,
  previous_school text default '',
  aadhaar_last4 text default '',
  status text not null default 'new' check (status in ('draft', 'new', 'in_review', 'accepted', 'rejected', 'enrolled')),
  applied_on date not null default current_date,
  year_name text,
  guardians jsonb not null default '[]',
  documents jsonb not null default '{}',
  student_id int references students on delete set null,
  created_at timestamptz not null default now()
);

create table application_notes (
  id serial primary key,
  application_id int not null references applications on delete cascade,
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create table transfers (
  id serial primary key,
  student_id int references students on delete set null,
  student_name text not null,
  kind text not null check (kind in ('incoming', 'outgoing', 'internal')),
  from_place text default '',
  to_place text default '',
  city text default '',
  reason text default '',
  contact text default '',
  effective_on date,
  carry_records boolean not null default true,
  status text not null default 'pending' check (status in ('draft', 'pending', 'completed', 'cancelled')),
  step int not null default 1,
  created_at timestamptz not null default now()
);

create table withdrawals (
  id serial primary key,
  student_id int references students on delete set null,
  student_name text not null,
  grade_name text,
  reason text not null,
  last_day date,
  notes text default '',
  archive_records boolean not null default true,
  issue_tc boolean not null default false,
  status text not null default 'completed' check (status in ('awaiting_tc', 'completed')),
  year_name text,
  created_at timestamptz not null default now()
);

create table activity_log (
  id serial primary key,
  at date not null default current_date,
  kind text not null,
  student_name text default '',
  detail text default '',
  by_name text default '',
  created_at timestamptz not null default now()
);

-- ---------- Scheduling ----------
create table rooms (
  id serial primary key,
  name text not null unique,
  kind text not null default 'Classroom' check (kind in ('Classroom', 'Laboratory', 'Library', 'Outdoor')),
  capacity int,
  used_by text default ''
);

create table timetable_slots (
  id serial primary key,
  term_id int not null references terms on delete cascade,
  grade_id int not null references grade_levels on delete cascade,
  day smallint not null check (day between 1 and 6),
  period_id int not null references periods on delete cascade,
  subject_id int not null references subjects on delete cascade,
  teacher_id uuid references staff on delete set null,
  room_id int references rooms on delete set null,
  unique (term_id, grade_id, day, period_id)
);

create table timetable_status (
  term_id int primary key references terms on delete cascade,
  published boolean not null default false,
  published_at timestamptz
);

-- ---------- Communication and reports ----------
create table announcements (
  id serial primary key,
  title text not null,
  body text default '',
  posted_by_name text default '',
  posted_at timestamptz not null default now()
);

create table reports (
  id serial primary key,
  name text not null,
  kind text not null check (kind in ('Attendance', 'Grades', 'Enrollment')),
  params jsonb not null default '{}',
  created_by_name text default '',
  created_at timestamptz not null default now()
);

-- ---------- Access helpers ----------
create function my_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from staff where user_id = auth.uid() and status = 'active'
$$;

create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and status = 'active')
$$;

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and status = 'active' and role = 'admin')
$$;

create function teaches_class(cid int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from classes c join staff s on s.id = c.teacher_id
    where c.id = cid and s.user_id = auth.uid() and s.status = 'active'
  )
$$;

create function teaches_evaluation(eid int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from evaluations e join classes c on c.id = e.class_id join staff s on s.id = c.teacher_id
    where e.id = eid and s.user_id = auth.uid() and s.status = 'active'
  )
$$;

create function is_class_teacher(gid int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from grade_levels g join staff s on s.id = g.class_teacher_id
    where g.id = gid and s.user_id = auth.uid() and s.status = 'active'
  )
$$;

-- Links the signed-in user to the staff row with the same email (first sign-in).
create function claim_staff() returns staff
language plpgsql security definer set search_path = public as $$
declare
  me staff;
begin
  update staff
     set user_id = auth.uid(),
         status = case when status = 'invited' then 'active' else status end
   where user_id is null
     and lower(email) = lower(auth.jwt() ->> 'email')
     and status <> 'inactive';
  select * into me from staff where user_id = auth.uid();
  return me;
end
$$;

revoke execute on function claim_staff() from anon, public;
grant execute on function claim_staff() to authenticated;

-- Teachers may edit their own name, phone and notifications, nothing else.
create function guard_staff_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or auth.uid() is null then
    return new;
  end if;
  if new.role is distinct from old.role or new.status is distinct from old.status
     or new.email is distinct from old.email or new.user_id is distinct from old.user_id then
    raise exception 'Only admins can change role, status or email';
  end if;
  return new;
end
$$;

create trigger staff_guard before update on staff
for each row execute function guard_staff_update();

-- ---------- Row level security ----------
do $$
declare
  t text;
begin
  -- Readable by all staff, writable by admins.
  foreach t in array array[
    'school_settings', 'academic_years', 'terms', 'periods', 'grading_scale', 'attendance_codes',
    'role_permissions', 'grade_levels', 'subjects', 'classes', 'students', 'enrollments', 'guardians',
    'health_records', 'student_documents', 'rooms', 'timetable_slots', 'timetable_status', 'announcements'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "staff read" on %I for select to authenticated using ((select is_staff()))', t);
    execute format('create policy "admin insert" on %I for insert to authenticated with check ((select is_admin()))', t);
    execute format('create policy "admin update" on %I for update to authenticated using ((select is_admin())) with check ((select is_admin()))', t);
    execute format('create policy "admin delete" on %I for delete to authenticated using ((select is_admin()))', t);
  end loop;

  -- Admin-only workflows.
  foreach t in array array['applications', 'application_notes', 'transfers', 'withdrawals', 'activity_log', 'reports'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "admin all" on %I for all to authenticated using ((select is_admin())) with check ((select is_admin()))', t);
  end loop;
end
$$;

alter table staff enable row level security;
create policy "staff read" on staff for select to authenticated using ((select is_staff()));
create policy "admin insert" on staff for insert to authenticated with check ((select is_admin()));
create policy "admin or self update" on staff for update to authenticated
  using ((select is_admin()) or user_id = (select auth.uid()))
  with check ((select is_admin()) or user_id = (select auth.uid()));
create policy "admin delete" on staff for delete to authenticated using ((select is_admin()));

alter table evaluations enable row level security;
create policy "staff read" on evaluations for select to authenticated using ((select is_staff()));
create policy "teacher or admin insert" on evaluations for insert to authenticated
  with check ((select is_admin()) or teaches_class(class_id));
create policy "teacher or admin update" on evaluations for update to authenticated
  using ((select is_admin()) or teaches_class(class_id))
  with check ((select is_admin()) or teaches_class(class_id));
create policy "teacher or admin delete" on evaluations for delete to authenticated
  using ((select is_admin()) or teaches_class(class_id));

alter table marks enable row level security;
create policy "staff read" on marks for select to authenticated using ((select is_staff()));
create policy "teacher or admin insert" on marks for insert to authenticated
  with check ((select is_admin()) or teaches_evaluation(evaluation_id));
create policy "teacher or admin update" on marks for update to authenticated
  using ((select is_admin()) or teaches_evaluation(evaluation_id))
  with check ((select is_admin()) or teaches_evaluation(evaluation_id));
create policy "teacher or admin delete" on marks for delete to authenticated
  using ((select is_admin()) or teaches_evaluation(evaluation_id));

alter table attendance enable row level security;
create policy "staff read" on attendance for select to authenticated using ((select is_staff()));
create policy "class teacher or admin insert" on attendance for insert to authenticated
  with check ((select is_admin()) or is_class_teacher(grade_id));
create policy "class teacher or admin update" on attendance for update to authenticated
  using ((select is_admin()) or is_class_teacher(grade_id))
  with check ((select is_admin()) or is_class_teacher(grade_id));
create policy "class teacher or admin delete" on attendance for delete to authenticated
  using ((select is_admin()) or is_class_teacher(grade_id));

-- Helpers are for policies and the app's signed-in users only.
revoke execute on function my_staff_id(), is_staff(), is_admin(), teaches_class(int),
  teaches_evaluation(int), is_class_teacher(int) from anon, public;
grant execute on function my_staff_id(), is_staff(), is_admin(), teaches_class(int),
  teaches_evaluation(int), is_class_teacher(int) to authenticated;

-- Foreign-key indexes used by the app's lookups.
create index on classes (teacher_id);
create index on classes (grade_id);
create index on enrollments (student_id);
create index on evaluations (class_id);
create index on marks (student_id);
create index on students (grade_id);
create index on guardians (student_id);
create index on student_documents (student_id);
create index on terms (year_id);
create index on timetable_slots (teacher_id);
create index on application_notes (application_id);
create index on transfers (student_id);
create index on withdrawals (student_id);

-- ---------- File storage for documents ----------
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "admin read documents" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select is_admin()));
create policy "admin upload documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select is_admin()));
create policy "admin replace documents" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (select is_admin()));
create policy "admin delete documents" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (select is_admin()));
