-- Applications collect everything the student profile's Personal & Identity,
-- Family & Contact and Health sections hold, so enrolling carries it all over.
-- One guardian is the primary contact, flagged on the student page.
alter table applications
  add column display_name text not null default '',
  add column apaar_id text not null default '',
  add column pen text not null default '',
  add column location text not null default '',
  add column state text not null default '',
  add column health_issues text not null default '',
  add column family jsonb not null default '{}';

alter table guardians add column is_primary boolean not null default false;
-- Existing students: their first guardian is the primary contact.
update guardians g set is_primary = true
where g.position = (select min(position) from guardians x where x.student_id = g.student_id);
