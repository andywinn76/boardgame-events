-- Store structured names while retaining display_name for existing UI consumers.
-- first_name remains nullable for accounts created before this migration; the app
-- requires it for all new registrations and profile updates.
alter table public.profiles
  add column first_name text check (first_name is null or char_length(first_name) between 1 and 80),
  add column last_name text check (last_name is null or char_length(last_name) between 1 and 80);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _first_name text := nullif(btrim(new.raw_user_meta_data ->> 'first_name'), '');
  _last_name text := nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '');
begin
  insert into public.profiles (id, username, first_name, last_name, display_name)
  values (
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 1, 12),
    _first_name,
    _last_name,
    nullif(concat_ws(' ', _first_name, _last_name), '')
  );
  return new;
end $$;
