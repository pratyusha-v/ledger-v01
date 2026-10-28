-- Demo data mirroring the wireframes. Identity numbers, phone numbers and
-- family details are fictional placeholders, not real records.

insert into school_settings (id, school_name, managed_by, udise_code, school_code, recognised_by, week_days, pass_mark, absent_counts)
values (1, '[School name]', 'Sai Seva Sangh', '[UDISE code]', '[School code]', '[Board]', 'Mon–Sat', 35, 'zero');

insert into academic_years (name, starts_on, ends_on, is_current, closed) values
  ('2025–26', '2025-06-01', '2026-04-30', true, false),
  ('2024–25', '2024-06-01', '2025-04-30', false, true),
  ('2023–24', '2023-06-01', '2024-04-30', false, true),
  ('2022–23', '2022-06-01', '2023-04-30', false, true);

insert into terms (year_id, name, starts_on, ends_on, main_exam, position)
select y.id, t.name, t.s::date, t.e::date, t.exam, t.pos
from academic_years y,
  (values ('Term 1', '2025-06-01', '2025-09-30', 'Term 1 Exam', 1),
          ('Term 2', '2025-10-01', '2026-01-31', 'Term 2 Exam', 2),
          ('Term 3', '2026-02-01', '2026-04-30', 'Final Exam', 3)) as t(name, s, e, exam, pos)
where y.name = '2025–26';

insert into periods (name, starts_at, ends_at, kind, position) values
  ('Period 1', '08:45', '09:30', 'class', 1),
  ('Period 2', '09:30', '10:15', 'class', 2),
  ('Period 3', '10:15', '11:00', 'class', 3),
  ('Period 4', '11:15', '12:00', 'class', 4),
  ('Lunch',    '12:00', '12:45', 'break', 5),
  ('Period 5', '12:45', '13:30', 'class', 6),
  ('Period 6', '13:30', '14:15', 'class', 7);

insert into grading_scale (grade, meaning, position) values
  ('A+', '90–100%', 1), ('A', '75–89%', 2), ('B', '60–74%', 3), ('C', '35–59%', 4),
  ('O', 'Outstanding (co-curricular)', 5);

insert into attendance_codes (code, meaning, position) values
  ('P', 'Present', 1), ('A', 'Absent', 2), ('L', 'Late', 3);

insert into role_permissions (role, area, level, note, position) values
  ('teacher', 'Dashboard', 'edit_own', 'Own tasks and deadlines', 1),
  ('admin',   'Dashboard', 'full', 'School-wide alerts and tasks', 1),
  ('teacher', 'My Classes', 'edit_own', 'View and edit own classes', 2),
  ('admin',   'My Classes', 'hidden', 'Not shown (uses All Classes)', 2),
  ('teacher', 'All Classes', 'view', 'View only', 3),
  ('admin',   'All Classes', 'full', 'View and edit every class', 3),
  ('teacher', 'Student Search & Profile', 'view', 'View; edit marks in own classes', 4),
  ('admin',   'Student Search & Profile', 'full', 'View and edit everything', 4),
  ('teacher', 'Admissions', 'hidden', 'Hidden', 5),
  ('admin',   'Admissions', 'full', 'Full access', 5),
  ('teacher', 'Transfers', 'hidden', 'Hidden', 6),
  ('admin',   'Transfers', 'full', 'Full access', 6),
  ('teacher', 'Scheduling', 'view', 'View own timetable', 7),
  ('admin',   'Scheduling', 'full', 'Build and edit timetable', 7),
  ('teacher', 'Staff', 'hidden', 'Hidden', 8),
  ('admin',   'Staff', 'full', 'Full access', 8),
  ('teacher', 'Settings', 'edit_own', 'Own account only', 9),
  ('admin',   'Settings', 'full', 'School-wide settings', 9);

-- Sign-in accounts link to these rows by email on first sign-in.
insert into staff (name, email, phone, role, status, notify) values
  ('Ms. Vineetha', 'vineetha@example.com', '', 'teacher', 'active', '{"grades_due": true, "attendance": true, "weekly": false}'),
  ('Shakeera', 'shakeera@example.com', '', 'admin', 'active', '{"admissions": true, "transfers": true, "conflicts": true, "weekly": true}'),
  ('Mr. Ravi Kumar', 'ravi@example.com', '', 'teacher', 'active', '{}'),
  ('Ms. Padma S.', 'padma@example.com', '', 'teacher', 'active', '{}'),
  ('Mr. Suresh B.', 'suresh@example.com', '', 'teacher', 'active', '{}'),
  ('Ms. Kavitha M.', 'kavitha@example.com', '', 'teacher', 'active', '{}'),
  ('Ms. Anitha R.', 'anitha@example.com', '', 'teacher', 'invited', '{}');

insert into grade_levels (name, position) values
  ('Grade 6', 6), ('Grade 7', 7), ('Grade 8', 8), ('Grade 9', 9), ('Grade 10', 10);
update grade_levels set class_teacher_id = (select id from staff where email = 'vineetha@example.com') where name = 'Grade 6';

insert into subjects (name, short_name, academic, position) values
  ('Telugu', 'Tel', true, 1), ('Hindi', 'Hin', true, 2), ('English', 'Eng', true, 3),
  ('Mathematics', 'Math', true, 4), ('Physical Science', 'Phy', true, 5),
  ('Biological Science', 'Bio', true, 6), ('Social Studies', 'Soc', true, 7),
  ('Yoga', 'Yoga', false, 8), ('Games', 'Games', false, 9), ('Library', 'Lib', false, 10),
  ('Veda Chanting', 'Veda', false, 11), ('Art', 'Art', false, 12);

-- Classes for the current year, then a few archived ones.
insert into classes (year_id, grade_id, subject_id, teacher_id)
select y.id, g.id, s.id, st.id
from (values
  ('Grade 6', 'Telugu', 'padma@example.com'),
  ('Grade 6', 'Hindi', 'padma@example.com'),
  ('Grade 6', 'English', 'suresh@example.com'),
  ('Grade 6', 'Mathematics', 'vineetha@example.com'),
  ('Grade 6', 'Physical Science', 'ravi@example.com'),
  ('Grade 6', 'Biological Science', 'kavitha@example.com'),
  ('Grade 6', 'Social Studies', 'suresh@example.com'),
  ('Grade 7', 'Mathematics', 'ravi@example.com'),
  ('Grade 7', 'English', 'suresh@example.com'),
  ('Grade 7', 'Social Studies', 'suresh@example.com'),
  ('Grade 8', 'Mathematics', 'vineetha@example.com')
) as c(grade, subject, email)
join grade_levels g on g.name = c.grade
join subjects s on s.name = c.subject
join staff st on st.email = c.email
cross join academic_years y where y.name = '2025–26';

insert into classes (year_id, grade_id, subject_id, teacher_id)
select y.id, g.id, s.id, st.id
from (values
  ('Grade 6', 'Mathematics', 'vineetha@example.com'),
  ('Grade 6', 'English', 'suresh@example.com'),
  ('Grade 7', 'Mathematics', 'ravi@example.com'),
  ('Grade 7', 'Social Studies', 'suresh@example.com')
) as c(grade, subject, email)
join grade_levels g on g.name = c.grade
join subjects s on s.name = c.subject
join staff st on st.email = c.email
cross join academic_years y where y.name = '2024–25';

-- ---------- Students ----------
insert into students (admission_no, full_name, display_name, grade_id, roll_no, residential, status, dob, gender,
                      aadhaar_last4, apaar_id, pen, location, state, family_status, blood_group, profile)
select v.adm, v.full_name, v.display_name, g.id, v.roll, v.res, v.status, v.dob::date, v.gender,
       v.aadhaar, v.apaar, v.pen, v.loc, 'Andhra Pradesh', v.family, v.blood, '{}'::jsonb
from (values
  ('701', 'Korrapati Lakshmi Hansika', 'Lakshmi Hansika K.', 'Grade 6', 1, 'Hostler', 'active', '2010-08-23', 'Female', '0001', '000000000701', '00000000701', 'Ongole', 'Single parent', 'O+'),
  ('702', 'Bhavya S.', 'Bhavya S.', 'Grade 6', 2, 'Day scholar', 'active', '2013-03-11', 'Female', '0002', '000000000702', '00000000702', 'Ongole', 'Both parents', 'B+'),
  ('703', 'Divya Sri P.', 'Divya Sri P.', 'Grade 6', 3, 'Hostler', 'active', '2013-07-02', 'Female', '0003', '000000000703', '00000000703', 'Guntur', 'Both parents', 'A+'),
  ('704', 'Mahima C.', 'Mahima C.', 'Grade 6', 4, 'Day scholar', 'active', '2013-01-19', 'Female', '0004', '000000000704', '00000000704', 'Ongole', 'Both parents', 'O+'),
  ('705', 'Sneha Varma', 'Sneha Varma', 'Grade 6', 5, 'Hostler', 'active', '2012-11-30', 'Female', '0005', '000000000705', '00000000705', 'Nellore', 'Both parents', 'AB+'),
  ('711', 'Arjun T.', 'Arjun T.', 'Grade 7', 1, 'Day scholar', 'active', '2012-05-14', 'Male', '0011', '000000000711', '00000000711', 'Ongole', 'Both parents', 'B+'),
  ('712', 'Keerthi V.', 'Keerthi V.', 'Grade 7', 2, 'Hostler', 'active', '2012-09-08', 'Female', '0012', '000000000712', '00000000712', 'Kavali', 'Both parents', 'O-'),
  ('721', 'Sai Kiran M.', 'Sai Kiran M.', 'Grade 8', 1, 'Hostler', 'active', '2011-02-21', 'Male', '0021', '000000000721', '00000000721', 'Chirala', 'Both parents', 'A+'),
  ('722', 'Ganesh P.', 'Ganesh P.', 'Grade 8', 2, 'Day scholar', 'active', '2011-06-17', 'Male', '0022', '000000000722', '00000000722', 'Ongole', 'Both parents', 'B+'),
  ('801', 'Sai Teja R.', 'Sai Teja R.', 'Grade 6', null, 'Day scholar', 'active', '2014-04-04', 'Male', '0801', '', '', 'Ongole', 'Both parents', ''),
  ('631', 'Pooja N.', 'Pooja N.', 'Grade 9', null, 'Hostler', 'withdrawn', '2010-10-10', 'Female', '0631', '', '', 'Ongole', 'Both parents', ''),
  ('641', 'Nikhil S.', 'Nikhil S.', 'Grade 8', null, 'Day scholar', 'transferred', '2011-12-01', 'Male', '0641', '', '', 'Ongole', 'Both parents', ''),
  ('651', 'Arvind K.', 'Arvind K.', 'Grade 7', null, 'Day scholar', 'withdrawn', '2012-08-15', 'Male', '0651', '', '', 'Ongole', 'Both parents', ''),
  ('561', 'Harsha V.', 'Harsha V.', 'Grade 10', null, 'Hostler', 'graduated', '2009-01-26', 'Male', '0561', '', '', 'Ongole', 'Both parents', '')
) as v(adm, full_name, display_name, grade, roll, res, status, dob, gender, aadhaar, apaar, pen, loc, family, blood)
join grade_levels g on g.name = v.grade;

update students set left_on = '2025-12-31', left_year = '2025–26', left_grade = 'Grade 9', left_reason = 'Withdrawn' where admission_no = '631';
update students set left_on = '2026-02-15', left_year = '2025–26', left_grade = 'Grade 8', left_reason = 'Transferred' where admission_no = '641';
update students set left_on = '2025-11-15', left_year = '2025–26', left_grade = 'Grade 7', left_reason = 'Withdrawn' where admission_no = '651';
update students set left_on = '2025-04-30', left_year = '2024–25', left_grade = 'Grade 10', left_reason = 'Graduated' where admission_no = '561';

-- The richer profile sections shown on Student Profile.
update students set profile = $json${
  "siblings": "1 younger sister, 1 younger brother",
  "sibling_at_school": "Yes — 1 sibling (Achievers)",
  "parents_health": "Not working",
  "guardian_behaviour": "—",
  "eyesight": "2.5",
  "health_issues": "—",
  "warden_remarks": "Good at hostel.",
  "attendance_remarks": "—",
  "ptm": [true, false, false, false],
  "skills": {
    "columns": ["Tel", "Hin", "Eng", "Math", "Phy", "Bio", "Soc"],
    "rows": [
      ["Behaviour in class", "A+", "A+", "A", "A", "A", "A", "A+"],
      ["Projects", "A+", "A+", "A", "A", "A+", "A+", "A+"],
      ["Reflection", "A+", "A", "A", "A", "A+", "A+", "A+"],
      ["Reading skills", "A+", "A", "A", "A", "A", "A", "A+"],
      ["Comprehension", "A", "A", "A", "A", "A", "A", "A+"],
      ["Handwriting", "A", "A", "A", "A", "A+", "A+", "A+"],
      ["Homework", "A", "A", "A", "A", "A", "A", "A+"],
      ["Classwork completion", "A", "A", "A", "A", "A", "A", "A+"],
      ["Books maintenance", "A+", "A+", "A", "A", "A", "A", "A+"]
    ]
  },
  "feedback": [
    ["Telugu", "Not attending the classes"],
    ["Hindi", "60% — hard working girl"],
    ["English", "63% — can do better"],
    ["Maths", "Above 80% — can do even better"],
    ["Science", "40% — needs concentration"],
    ["Biology", "90% — good"],
    ["Social", "Above 80% — very sincere and hard working"]
  ],
  "student_feedback": "",
  "sports": [
    ["Karate", "Black Belt (II Dan)"],
    ["Weapons handling", "Nunchaku, stick, gun shooting, sword"],
    ["Awards & certificates", "II Dan, 4 medals in karate, medals in nunchaku"],
    ["Remarks by in-charge", "Best student — she can pick up any game"]
  ],
  "physical": "",
  "spiritual": [
    ["Veda chanting", "O", "Good"],
    ["Bhagavad Gita", "O", "Excellent"],
    ["Bhajans & slokas", "O", "Good"]
  ],
  "dance": "",
  "competitions": "Yes",
  "seva": [false, false, false, false],
  "participation": "Maths Olympiad, Adhira, FIITJEE and sports",
  "documents_checked": "Checked",
  "final": {
    "promotion": "Promoted",
    "decision": "",
    "remarks": "",
    "open_school": "",
    "checked_by": "",
    "designation": ""
  }
}$json$::jsonb
where admission_no = '701';

insert into guardians (student_id, relation, name, occupation, phone, position)
select s.id, g.relation, g.name, g.occupation, g.phone, g.pos
from students s,
  (values ('Father', 'K. Ramesh', 'NA', 'NA', 1),
          ('Mother', 'K. Sunitha', 'NA', 'NA', 2),
          ('Guardian', '—', 'IT', '90000 00701', 3)) as g(relation, name, occupation, phone, pos)
where s.admission_no = '701';

insert into guardians (student_id, relation, name, occupation, phone, position)
select s.id, 'Father', 'Parent of ' || s.display_name, '', '90000 00' || s.admission_no, 1
from students s where s.admission_no in ('702', '703', '704', '705', '711', '712', '721', '722', '801');

insert into health_records (student_id, term_no, height_cm, weight_kg, remarks)
select id, 1, 151, 50, 'Healthy weight' from students where admission_no = '701';

insert into student_documents (student_id, name, submitted, handled_by, position)
select s.id, d.name, d.ok, d.who, d.pos
from students s,
  (values ('Birth certificate', false, 'Ms. Vineetha', 1),
          ('Caste certificate', false, 'Ms. Vineetha', 2),
          ('Income certificate', false, 'Ms. Vineetha', 3),
          ('TC / Bonafide', true, 'Shakeera', 4)) as d(name, ok, who, pos)
where s.admission_no = '701';

-- ---------- Rosters ----------
insert into enrollments (class_id, student_id)
select c.id, s.id
from classes c
join academic_years y on y.id = c.year_id and y.name = '2025–26'
join students s on s.grade_id = c.grade_id and s.status = 'active' and s.roll_no is not null;

-- ---------- Evaluations and marks ----------
-- Grade 6 Mathematics: the gradebook exactly as wireframed.
insert into evaluations (class_id, name, held_on, max_marks, weight)
select c.id, e.name, e.d::date, e.mx, e.wt
from classes c
join academic_years y on y.id = c.year_id and y.name = '2025–26'
join grade_levels g on g.id = c.grade_id and g.name = 'Grade 6'
join subjects s on s.id = c.subject_id and s.name = 'Mathematics',
  (values ('Test 01', '2025-07-10', 25, 5), ('Test 02', '2025-08-07', 25, 5), ('Test 03', '2025-08-28', 15, 5),
          ('Test 04', '2025-09-11', 15, 5), ('Term 1 Exam', '2025-09-22', 80, 20), ('Project', '2025-11-14', 20, 10),
          ('Test 05', '2025-12-04', 15, 5), ('Test 06', '2026-01-08', 15, 5), ('Term 2 Exam', '2026-02-02', 80, 20),
          ('Final Exam', '2026-03-09', 100, 20)) as e(name, d, mx, wt);

with m(adm, vals) as (values
  ('701', array[null, null, 11.5, 9.5, 62, 17, 12, 14, 66, 81]::numeric[]),
  ('702', array[21, 19, 13, 12, 71, 18, 13.5, 12, 74, 88]::numeric[]),
  ('703', array[18, 20, 10, 11.5, 58, 15, 11, 10.5, 61, 72]::numeric[]),
  ('704', array[23, 22, 14, 14.5, 76, 19, 14, 13.5, 78, 92]::numeric[]),
  ('705', array[15, 17, 9, 8.5, 49, 14, 9.5, 10, 52, 63]::numeric[])
), ev as (
  select e.id, row_number() over (order by e.held_on) as n
  from evaluations e
  join classes c on c.id = e.class_id
  join academic_years y on y.id = c.year_id and y.name = '2025–26'
  join grade_levels g on g.id = c.grade_id and g.name = 'Grade 6'
  join subjects s on s.id = c.subject_id and s.name = 'Mathematics'
)
insert into marks (evaluation_id, student_id, marks, absent)
select ev.id, st.id, m.vals[ev.n::int], m.vals[ev.n::int] is null
from m join students st on st.admission_no = m.adm join ev on true;

-- Other Grade 6 subjects: nine tests (Test 01–02 out of 25, Test 03–09 out of 15).
insert into evaluations (class_id, name, held_on, max_marks, weight)
select c.id, e.name, e.d::date, e.mx, e.wt
from classes c
join academic_years y on y.id = c.year_id and y.name = '2025–26'
join grade_levels g on g.id = c.grade_id and g.name = 'Grade 6'
join subjects s on s.id = c.subject_id and s.name <> 'Mathematics',
  (values ('Test 01', '2025-06-26', 25, 10), ('Test 02', '2025-07-17', 25, 10), ('Test 03', '2025-08-14', 15, 10),
          ('Test 04', '2025-09-04', 15, 10), ('Test 05', '2025-10-16', 15, 10), ('Test 06', '2025-11-20', 15, 10),
          ('Test 07', '2025-12-11', 15, 10), ('Test 08', '2026-01-22', 15, 15), ('Test 09', '2026-02-12', 15, 15)) as e(name, d, mx, wt);

-- Lakshmi's marks as shown on her profile; classmates get steady demo marks.
with lk(subject, vals) as (values
  ('Telugu', array[null, null, 13.5, 13, 12.5, 8.5, 11, 9, 14]::numeric[]),
  ('Hindi', array[null, null, 16.5, 10.5, 12.5, 12, 14, 12.5, 14.5]::numeric[]),
  ('English', array[null, null, 11, 11.5, 9.5, 10, 11, 8, 12]::numeric[]),
  ('Physical Science', array[null, null, 13.5, 15, 15, 9, 6, 14.5, 14]::numeric[]),
  ('Biological Science', array[null, null, 14, 14.5, 15, 10, 12, 12.5, 14]::numeric[]),
  ('Social Studies', array[null, null, 10, 9.5, 11.5, 10.5, 12, 11, 13.5]::numeric[])
), ev as (
  select e.id, e.max_marks, s.name as subject, c.id as class_id,
         row_number() over (partition by c.id order by e.held_on) as n
  from evaluations e
  join classes c on c.id = e.class_id
  join academic_years y on y.id = c.year_id and y.name = '2025–26'
  join grade_levels g on g.id = c.grade_id and g.name = 'Grade 6'
  join subjects s on s.id = c.subject_id and s.name <> 'Mathematics'
)
insert into marks (evaluation_id, student_id, marks, absent)
select ev.id, st.id,
  case when st.admission_no = '701' then (select vals[ev.n::int] from lk where lk.subject = ev.subject)
       else round((ev.max_marks * (0.55 + (abs(hashtext(st.admission_no || ev.id::text)) % 40) / 100.0)) * 2) / 2 end,
  st.admission_no = '701' and (select vals[ev.n::int] from lk where lk.subject = ev.subject) is null
from ev
join enrollments en on en.class_id = ev.class_id
join students st on st.id = en.student_id;

-- Grade 7 and 8 classes: a few recent tests each.
insert into evaluations (class_id, name, held_on, max_marks, weight)
select c.id, e.name, e.d::date, e.mx, e.wt
from classes c
join academic_years y on y.id = c.year_id and y.name = '2025–26'
join grade_levels g on g.id = c.grade_id and g.name in ('Grade 7', 'Grade 8'),
  (values ('Test 01', '2025-07-15', 25, 20), ('Term 1 Exam', '2025-09-23', 80, 40), ('Test 02', '2025-12-09', 25, 40)) as e(name, d, mx, wt);

insert into marks (evaluation_id, student_id, marks, absent)
select e.id, st.id, round((e.max_marks * (0.5 + (abs(hashtext(st.admission_no || e.id::text)) % 45) / 100.0)) * 2) / 2, false
from evaluations e
join classes c on c.id = e.class_id
join academic_years y on y.id = c.year_id and y.name = '2025–26'
join grade_levels g on g.id = c.grade_id and g.name in ('Grade 7', 'Grade 8')
join enrollments en on en.class_id = c.id
join students st on st.id = en.student_id;

-- Archived 2024–25 classes: evaluations only (their rosters have moved on).
insert into evaluations (class_id, name, held_on, max_marks, weight)
select c.id, e.name, e.d::date, e.mx, e.wt
from classes c
join academic_years y on y.id = c.year_id and y.name = '2024–25',
  (values ('Term 1 Exam', '2024-09-20', 80, 30), ('Term 2 Exam', '2025-01-31', 80, 30), ('Final Exam', '2025-03-10', 100, 40)) as e(name, d, mx, wt);

-- ---------- Attendance (Grade 6, Mon–Sat school days) ----------
with days as (
  select d::date as on_date
  from generate_series('2025-06-02'::date, '2026-02-27'::date, '1 day') d
  where extract(isodow from d) < 7
    and d::date not in ('2025-08-15', '2025-10-02', '2025-10-20', '2025-12-25', '2026-01-14', '2026-01-15', '2026-01-26')
)
insert into attendance (student_id, on_date, grade_id, status, marked_by)
select st.id, days.on_date, st.grade_id,
  case
    when st.admission_no = '701' and days.on_date in ('2025-08-21', '2026-01-09', '2026-01-10', '2026-02-05', '2026-02-06', '2026-02-07') then 'A'
    when st.admission_no = '701' then 'P'
    when abs(hashtext(st.admission_no || days.on_date::text)) % 100 < 3 then 'A'
    when abs(hashtext(st.admission_no || days.on_date::text)) % 100 < 5 then 'L'
    else 'P'
  end,
  (select id from staff where email = 'vineetha@example.com')
from days
join students st on st.status = 'active' and st.roll_no is not null
join grade_levels g on g.id = st.grade_id and g.name = 'Grade 6';

-- ---------- Admissions, transfers, withdrawals ----------
insert into applications (app_no, full_name, dob, gender, grade_id, residential, previous_school, aadhaar_last4,
                          status, applied_on, year_name, guardians, documents)
select a.no, a.name, a.dob::date, a.gender, g.id, a.res, a.prev, a.aadhaar, a.status, a.applied::date, '2026–27',
       a.guardians::jsonb, a.docs::jsonb
from (values
  ('APP-0112', 'Ananya Rao', '2014-05-09', 'Female', 'Grade 6', 'Day scholar', '[School name]', '0112', 'new', '2026-02-14',
   '[{"relation":"Father","name":"Rao Srinivas","occupation":"[Occupation]","phone":"90000 01120","email":""},{"relation":"Mother","name":"[Name]","occupation":"[Occupation]","phone":"90000 01121","email":""}]',
   '{"birth":"uploaded","tc":"missing","aadhaar":"uploaded","report":"uploaded"}'),
  ('APP-0110', 'Karthik M.', '2012-02-02', 'Male', 'Grade 8', 'Hostler', '[School name]', '0110', 'in_review', '2026-02-10',
   '[{"relation":"Father","name":"[Guardian name]","occupation":"","phone":"90000 01100","email":""}]',
   '{"birth":"uploaded","tc":"uploaded","aadhaar":"uploaded","report":"missing"}'),
  ('APP-0106', 'Riya Sharma', '2013-06-21', 'Female', 'Grade 7', 'Day scholar', '[School name]', '0106', 'in_review', '2026-02-06',
   '[{"relation":"Mother","name":"[Guardian name]","occupation":"","phone":"90000 01060","email":""}]',
   '{"birth":"uploaded","tc":"missing","aadhaar":"uploaded","report":"uploaded"}'),
  ('APP-0098', 'Farhan Ali', '2014-01-12', 'Male', 'Grade 6', 'Hostler', '[School name]', '0098', 'accepted', '2026-01-28',
   '[{"relation":"Father","name":"[Guardian name]","occupation":"","phone":"90000 00980","email":""}]',
   '{"birth":"uploaded","tc":"uploaded","aadhaar":"uploaded","report":"uploaded"}'),
  ('APP-0090', 'Meera K.', '2011-09-30', 'Female', 'Grade 9', 'Day scholar', '[School name]', '0090', 'rejected', '2026-01-20',
   '[{"relation":"Father","name":"[Guardian name]","occupation":"","phone":"90000 00900","email":""}]',
   '{"birth":"uploaded","tc":"missing","aadhaar":"missing","report":"missing"}'),
  ('APP-0081', 'Sai Teja R.', '2014-04-04', 'Male', 'Grade 6', 'Day scholar', '[School name]', '0801', 'enrolled', '2026-01-12',
   '[{"relation":"Father","name":"Parent of Sai Teja R.","occupation":"","phone":"90000 00801","email":""}]',
   '{"birth":"uploaded","tc":"uploaded","aadhaar":"uploaded","report":"uploaded"}')
) as a(no, name, dob, gender, grade, res, prev, aadhaar, status, applied, guardians, docs)
join grade_levels g on g.name = a.grade;

update applications set student_id = (select id from students where admission_no = '801') where app_no = 'APP-0081';

insert into application_notes (application_id, author_name, body, created_at)
select id, 'Shakeera', 'Called parent to request TC.', '2026-02-15 10:00+05:30' from applications where app_no = 'APP-0112';

insert into transfers (student_id, student_name, kind, from_place, to_place, city, reason, effective_on, status, step)
values
  (null, 'Farhan Ali', 'incoming', '[School name]', 'Grade 6', '', 'Family relocation', '2026-03-01', 'pending', 4),
  ((select id from students where admission_no = '641'), 'Nikhil S.', 'outgoing', 'Grade 8', '[School name]', '', 'Parent request', '2026-02-15', 'completed', 4),
  ((select id from students where admission_no = '722'), 'Ganesh P.', 'outgoing', 'Grade 8', '[School name]', '', 'Family relocation', '2026-03-20', 'pending', 4),
  ((select id from students where admission_no = '711'), 'Arjun T.', 'internal', 'Grade 7', 'Grade 7 – Section B', '', 'Parent request', '2026-03-02', 'pending', 4),
  ((select id from students where admission_no = '701'), 'Lakshmi Hansika K.', 'outgoing', 'Grade 6', '', '', '', null, 'draft', 2);

insert into withdrawals (student_id, student_name, grade_name, reason, last_day, notes, archive_records, issue_tc, status, year_name)
values
  ((select id from students where admission_no = '631'), 'Pooja N.', 'Grade 9', 'Family relocation', '2025-12-31', '', true, true, 'completed', '2025–26'),
  ((select id from students where admission_no = '651'), 'Arvind K.', 'Grade 7', 'Health', '2025-11-15', '', true, true, 'completed', '2025–26'),
  ((select id from students where admission_no = '722'), 'Ganesh P.', 'Grade 8', 'Family relocation', '2026-03-20', 'Withdrawal requested by parent', true, true, 'awaiting_tc', '2025–26');

insert into activity_log (at, kind, student_name, detail, by_name) values
  ('2026-02-15', 'Admission', 'Riya Sharma', 'Requested missing TC', 'Shakeera'),
  ('2026-02-14', 'Admission', 'Ananya Rao', 'Application received', 'Office'),
  ('2026-02-12', 'Transfer', 'Lakshmi Hansika K.', 'Outgoing transfer started', 'Shakeera'),
  ('2026-02-10', 'Withdrawal', 'Ganesh P.', 'Withdrawal requested by parent', 'Shakeera');

-- ---------- Scheduling ----------
insert into rooms (name, kind, capacity, used_by) values
  ('Room 6', 'Classroom', 40, 'Grade 6'),
  ('Room 7', 'Classroom', 40, 'Grade 7'),
  ('Room 8', 'Classroom', 40, 'Grade 8'),
  ('Science Lab', 'Laboratory', 30, 'Physical / Biological Science'),
  ('Library', 'Library', 50, 'Library periods'),
  ('Ground', 'Outdoor', null, 'Games, Yoga');

-- Grade 6, Term 2, as on the Timetable wireframe.
with grid(day, period, subject) as (values
  (1, 'Period 1', 'Mathematics'), (2, 'Period 1', 'Telugu'), (3, 'Period 1', 'English'), (4, 'Period 1', 'Mathematics'), (5, 'Period 1', 'Hindi'), (6, 'Period 1', 'Biological Science'),
  (1, 'Period 2', 'English'), (2, 'Period 2', 'Mathematics'), (3, 'Period 2', 'Hindi'), (4, 'Period 2', 'Social Studies'), (5, 'Period 2', 'Mathematics'), (6, 'Period 2', 'Telugu'),
  (1, 'Period 3', 'Telugu'), (2, 'Period 3', 'Biological Science'), (3, 'Period 3', 'Mathematics'), (4, 'Period 3', 'English'), (5, 'Period 3', 'Physical Science'), (6, 'Period 3', 'Mathematics'),
  (1, 'Period 4', 'Physical Science'), (2, 'Period 4', 'English'), (3, 'Period 4', 'Telugu'), (4, 'Period 4', 'Biological Science'), (5, 'Period 4', 'Social Studies'), (6, 'Period 4', 'Yoga'),
  (1, 'Period 5', 'Hindi'), (2, 'Period 5', 'Social Studies'), (3, 'Period 5', 'Physical Science'), (4, 'Period 5', 'Telugu'), (5, 'Period 5', 'English'),
  (1, 'Period 6', 'Social Studies'), (2, 'Period 6', 'Hindi'), (3, 'Period 6', 'Games'), (4, 'Period 6', 'Library'), (5, 'Period 6', 'Veda Chanting')
)
insert into timetable_slots (term_id, grade_id, day, period_id, subject_id, teacher_id, room_id)
select t.id, g.id, grid.day, p.id, s.id,
  coalesce(c.teacher_id, (select id from staff where email = 'kavitha@example.com')),
  case when s.name in ('Games', 'Yoga') then (select id from rooms where name = 'Ground')
       when s.name = 'Library' then (select id from rooms where name = 'Library')
       when s.name in ('Physical Science', 'Biological Science') then (select id from rooms where name = 'Science Lab')
       else (select id from rooms where name = 'Room 6') end
from grid
join grade_levels g on g.name = 'Grade 6'
join terms t on t.name = 'Term 2'
join periods p on p.name = grid.period
join subjects s on s.name = grid.subject
left join classes c on c.grade_id = g.id and c.subject_id = s.id and c.year_id = t.year_id;

-- Grade 8 Mathematics on Tuesday period 2 double-books Ms. Vineetha (the wireframe's conflict).
insert into timetable_slots (term_id, grade_id, day, period_id, subject_id, teacher_id, room_id)
select t.id, g.id, 2, p.id, s.id, st.id, r.id
from terms t, grade_levels g, periods p, subjects s, staff st, rooms r
where t.name = 'Term 2' and g.name = 'Grade 8' and p.name = 'Period 2' and s.name = 'Mathematics'
  and st.email = 'vineetha@example.com' and r.name = 'Room 8';

insert into timetable_status (term_id, published, published_at)
select id, true, '2025-10-01 09:00+05:30' from terms where name = 'Term 2';

-- ---------- Announcements and reports ----------
insert into announcements (title, body, posted_by_name, posted_at) values
  ('Term 2 exam timetable', 'Term 2 exams start on 2 February. Please enter Term 1 marks before then.', 'Shakeera', '2026-01-20 09:00+05:30');

insert into reports (name, kind, params, created_by_name, created_at) values
  ('Attendance – Grade 6 – Term 1', 'Attendance', '{"year":"2025–26","grade":"Grade 6","term":"Term 1","format":"Excel"}', 'Shakeera', '2025-10-05 10:00+05:30'),
  ('Grades – All grades – Term 1', 'Grades', '{"year":"2025–26","grade":"All grades","term":"Term 1","format":"Excel"}', 'Shakeera', '2025-10-01 10:00+05:30');
