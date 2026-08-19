-- This project didn't inherit Supabase's usual default-privilege bootstrap
-- (ALTER DEFAULT PRIVILEGES ... GRANT ... TO anon, authenticated), so PostgREST
-- was returning "permission denied" before RLS policies ever got a chance to run.
-- Table-level GRANTs are the outer gate; RLS policies are the inner one — both
-- are required. Every future migration that adds a table needs matching grants.

grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;

grant select on public.user_roles to authenticated;
