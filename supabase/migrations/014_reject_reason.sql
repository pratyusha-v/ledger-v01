-- Rejected applications stay on record with the reason they were turned down.
alter table applications add column reject_reason text not null default '';
