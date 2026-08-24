-- Require new accounts to provide a valid username and use it when creating
-- their profile instead of assigning a generated placeholder.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _username text := lower(nullif(btrim(new.raw_user_meta_data ->> 'username'), ''));
  _first_name text := nullif(btrim(new.raw_user_meta_data ->> 'first_name'), '');
  _last_name text := nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '');
begin
  if _username is null or _username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'A valid username is required.' using errcode = '22023';
  end if;

  insert into public.profiles (id, username, first_name, last_name, display_name)
  values (
    new.id,
    _username,
    _first_name,
    _last_name,
    nullif(concat_ws(' ', _first_name, _last_name), '')
  );

  return new;
end;
$$;
