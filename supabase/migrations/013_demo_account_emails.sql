-- The demo sign-in accounts use role-based emails. Staff rows match sign-in
-- accounts by email, so the staff emails change with them.
update staff set email = 'teacher@example.com' where email = 'vineetha@example.com';
update staff set email = 'admin@example.com' where email = 'shakeera@example.com';
