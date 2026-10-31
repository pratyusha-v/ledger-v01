-- Primary phone and primary email can belong to different guardians.
alter table guardians rename column is_primary to primary_phone;
alter table guardians add column primary_email boolean not null default false;
-- Existing students: the first guardian with an email is the primary email.
update guardians g set primary_email = true
where coalesce(g.email, '') <> ''
  and g.position = (select min(position) from guardians x where x.student_id = g.student_id and coalesce(x.email, '') <> '');

-- The full Aadhaar number is kept (it was last 4 digits only).
alter table students rename column aadhaar_last4 to aadhaar_no;
alter table applications rename column aadhaar_last4 to aadhaar_no;
