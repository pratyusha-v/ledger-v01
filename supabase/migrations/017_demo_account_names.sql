-- The demo sign-in accounts are named by role, like their emails.
update staff set name = 'Teacher' where email = 'teacher@example.com';
update staff set name = 'Admin' where email = 'admin@example.com';

-- Names already recorded as the author of notes, leave, reports and so on follow.
update staff_leaves set created_by_name = case created_by_name when 'Shakeera' then 'Admin' else 'Teacher' end where created_by_name in ('Shakeera', 'Ms. Vineetha', 'Vineetha');
update health_notes set author_name = case author_name when 'Shakeera' then 'Admin' else 'Teacher' end where author_name in ('Shakeera', 'Ms. Vineetha', 'Vineetha');
update application_notes set author_name = case author_name when 'Shakeera' then 'Admin' else 'Teacher' end where author_name in ('Shakeera', 'Ms. Vineetha', 'Vineetha');
update activity_log set by_name = case by_name when 'Shakeera' then 'Admin' else 'Teacher' end where by_name in ('Shakeera', 'Ms. Vineetha', 'Vineetha');
update announcements set posted_by_name = case posted_by_name when 'Shakeera' then 'Admin' else 'Teacher' end where posted_by_name in ('Shakeera', 'Ms. Vineetha', 'Vineetha');
update reports set created_by_name = case created_by_name when 'Shakeera' then 'Admin' else 'Teacher' end where created_by_name in ('Shakeera', 'Ms. Vineetha', 'Vineetha');
