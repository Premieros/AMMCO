-- Fix recursive RLS on profiles.
-- Mandatory target: yumeijsyiphzdsulsubf only.

drop policy if exists profiles_select on public.profiles;

create policy profiles_select_self on public.profiles
for select to authenticated
using (user_id = (select auth.uid()));
