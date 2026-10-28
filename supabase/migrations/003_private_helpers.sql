-- Keep policy helpers out of the public API. Policies reference functions by
-- id, so moving them to another schema keeps every policy working.
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.my_staff_id() set schema private;
alter function public.is_staff() set schema private;
alter function public.is_admin() set schema private;
alter function public.teaches_class(int) set schema private;
alter function public.teaches_evaluation(int) set schema private;
alter function public.is_class_teacher(int) set schema private;
alter function public.guard_staff_update() set schema private;

-- Functions now live in private; their bodies still resolve tables via search_path = public.
alter function private.my_staff_id() set search_path = public, private;
alter function private.is_staff() set search_path = public, private;
alter function private.is_admin() set search_path = public, private;
alter function private.teaches_class(int) set search_path = public, private;
alter function private.teaches_evaluation(int) set search_path = public, private;
alter function private.is_class_teacher(int) set search_path = public, private;
alter function private.guard_staff_update() set search_path = public, private;

revoke execute on function private.guard_staff_update() from public, anon, authenticated;
