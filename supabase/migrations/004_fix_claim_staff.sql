-- claim_staff links a first-time user to their staff row, which sets user_id.
-- The staff guard blocked that for teachers; let the claim through, nothing else.
create or replace function public.claim_staff() returns staff
language plpgsql security definer set search_path = public as $$
declare
  me staff;
begin
  perform set_config('ledger.claiming', 'on', true);
  update staff
     set user_id = auth.uid(),
         status = case when status = 'invited' then 'active' else status end
   where user_id is null
     and lower(email) = lower(auth.jwt() ->> 'email')
     and status <> 'inactive';
  perform set_config('ledger.claiming', 'off', true);
  select * into me from staff where user_id = auth.uid();
  return me;
end
$$;

create or replace function private.guard_staff_update() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if is_admin() or auth.uid() is null then
    return new;
  end if;
  -- The first-sign-in claim: only user_id (and invited -> active) may change.
  if current_setting('ledger.claiming', true) = 'on'
     and old.user_id is null and new.user_id = auth.uid()
     and new.role is not distinct from old.role and new.email is not distinct from old.email then
    return new;
  end if;
  if new.role is distinct from old.role or new.status is distinct from old.status
     or new.email is distinct from old.email or new.user_id is distinct from old.user_id then
    raise exception 'Only admins can change role, status or email';
  end if;
  return new;
end
$$;
