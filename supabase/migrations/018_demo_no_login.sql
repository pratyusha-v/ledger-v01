-- Demo mode without sign-in: a visitor with no session acts as the demo teacher or the
-- demo admin, picked by the x-ledger-demo request header the site sends.
-- A real signed-in session still wins. Anyone with the site link can read and edit the
-- data as that account, so only demo data belongs in this project while this is on.

create or replace function private.current_uid() returns uuid
  language sql stable security definer set search_path = public, private as $$
  select coalesce(auth.uid(), (
    select user_id from staff
    where status = 'active' and email = case (nullif(current_setting('request.headers', true), '')::json ->> 'x-ledger-demo')
      when 'admin' then 'admin@example.com' when 'teacher' then 'teacher@example.com' end))
$$;

-- Every helper that asked "who is signed in?" now asks current_uid() instead.
do $$
declare f regprocedure;
begin
  foreach f in array array['private.my_staff_id()', 'private.is_staff()', 'private.is_admin()', 'private.teaches_class(integer)',
    'private.teaches_evaluation(integer)', 'private.is_class_teacher(integer)', 'public.claim_staff()', 'private.guard_staff_update()']::regprocedure[]
  loop
    execute replace(pg_get_functiondef(f), 'auth.uid()', 'private.current_uid()');
  end loop;
end $$;

alter policy "admin or self update" on staff
  using ((select private.is_admin()) or user_id = (select private.current_uid()))
  with check ((select private.is_admin()) or user_id = (select private.current_uid()));

-- Policies written for signed-in users now apply to visitors without a session too.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname in ('public', 'storage') and roles = '{authenticated}' loop
    execute format('alter policy %I on %I.%I to authenticated, anon', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

grant usage on schema private to anon;
grant execute on all functions in schema private to anon;
grant execute on function public.claim_staff(), public.set_subject_notes(integer, integer, jsonb) to anon;
