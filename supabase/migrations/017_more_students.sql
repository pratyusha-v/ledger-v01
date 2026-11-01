-- More demo students for Grade 7 and Grade 8, enrolled in their grade's current classes.
-- Three Grade 8 students are left off the Mathematics roster so teachers can try Add Students.
with new_students (adm, name, grade, roll, gender, dob, residential, location, blood) as (values
  ('803', 'Harika V.',     'Grade 7', 4,  'Female', '2012-03-14', 'Day scholar', 'Ongole',     'O+'),
  ('804', 'Manoj K.',      'Grade 7', 5,  'Male',   '2012-07-02', 'Hostler',     'Chirala',    'B+'),
  ('805', 'Divya Sri P.',  'Grade 7', 6,  'Female', '2012-01-25', 'Day scholar', 'Bapatla',    'A+'),
  ('806', 'Rohith N.',     'Grade 7', 7,  'Male',   '2012-09-11', 'Hostler',     'Guntur',     'O-'),
  ('807', 'Keerthana B.',  'Grade 7', 8,  'Female', '2012-05-30', 'Day scholar', 'Ongole',     'AB+'),
  ('808', 'Vamsi Krishna', 'Grade 7', 9,  'Male',   '2012-11-08', 'Day scholar', 'Chirala',    'B-'),
  ('809', 'Sravani T.',    'Grade 7', 10, 'Female', '2012-02-19', 'Hostler',     'Markapur',   'A-'),
  ('810', 'Lahari G.',     'Grade 8', 3,  'Female', '2011-04-06', 'Day scholar', 'Ongole',     'O+'),
  ('811', 'Charan Teja',   'Grade 8', 4,  'Male',   '2011-08-22', 'Hostler',     'Bapatla',    'A+'),
  ('812', 'Bhavana R.',    'Grade 8', 5,  'Female', '2011-12-03', 'Day scholar', 'Chirala',    'B+'),
  ('813', 'Naveen S.',     'Grade 8', 6,  'Male',   '2011-01-17', 'Day scholar', 'Guntur',     'O+'),
  ('814', 'Pooja L.',      'Grade 8', 7,  'Female', '2011-06-28', 'Hostler',     'Ongole',     'AB-'),
  ('815', 'Tarun M.',      'Grade 8', 8,  'Male',   '2011-10-09', 'Day scholar', 'Markapur',   'B+'),
  ('816', 'Mounika D.',    'Grade 8', 9,  'Female', '2011-03-01', 'Day scholar', 'Chirala',    'A+'),
  ('817', 'Yaswanth A.',   'Grade 8', 10, 'Male',   '2011-07-15', 'Hostler',     'Bapatla',    'O+')
), ins as (
  insert into students (admission_no, full_name, display_name, grade_id, roll_no, residential, status, dob, gender,
    aadhaar_no, apaar_id, pen, location, state, repeating, family_status, blood_group)
  select n.adm, n.name, n.name, g.id, n.roll, n.residential, 'active', n.dob::date, n.gender,
    lpad(right(n.adm, 3), 4, '0'), lpad(n.adm, 12, '0'), lpad(n.adm, 11, '0'), n.location, 'Andhra Pradesh', false, 'Both parents', n.blood
  from new_students n join grade_levels g on g.name = n.grade
  where not exists (select 1 from students s where s.admission_no = n.adm)
  returning id, grade_id, admission_no
)
insert into enrollments (class_id, student_id)
select c.id, i.id
from ins i
join classes c on c.grade_id = i.grade_id
join academic_years y on y.id = c.year_id and y.is_current
join subjects sub on sub.id = c.subject_id
where not (sub.name = 'Mathematics' and i.admission_no in ('815', '816', '817'))
on conflict do nothing;

-- New students are auto-enrolled in mandatory classes, so take these three back off Grade 8 Mathematics.
delete from enrollments e using students s, classes c, subjects sub, academic_years y
where e.student_id = s.id and e.class_id = c.id and c.subject_id = sub.id and c.year_id = y.id and y.is_current
  and sub.name = 'Mathematics' and s.admission_no in ('815', '816', '817');
