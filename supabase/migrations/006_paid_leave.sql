-- Paid leave: each staff member's yearly allowance. A day marked 'Leave' in
-- staff_attendance is a paid leave day; 'A' is an unpaid absence.
alter table staff add column paid_leave_days int not null default 12 check (paid_leave_days >= 0);
