-- Step 1: Auth + profiles + user_roles + RLS skeleton.
-- See docs/architecture.md sections 1-2 for the full design rationale.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- enums ----------
create type app_role as enum ('admin','moderator','host','player');

-- ---------- identity ----------
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     extensions.citext unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text,
  avatar_url   text,
  bio          text,
  home_city    text,
  timezone     text not null default 'America/Denver',
  ics_token    text unique default encode(extensions.gen_random_bytes(16),'hex'),  -- calendar feed auth
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table user_roles (
  user_id    uuid not null references profiles(id) on delete cascade,
  role       app_role not null,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- RLS-safe role check
create or replace function public.has_role(_user uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = _user and role = _role);
$$;

-- keep profiles.updated_at current on every update
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function public.set_updated_at();

-- auto-create a profile row when someone signs up, with a placeholder username
-- (regex-valid) they replace later in settings; security definer so it runs
-- regardless of session/email-confirmation state
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 12));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RLS ----------
alter table profiles enable row level security;

create policy "profiles are publicly readable" on profiles
  for select using (true);

create policy "users manage own profile" on profiles
  for update using (auth.uid() = id);

alter table user_roles enable row level security;

create policy "users read own roles" on user_roles
  for select using (auth.uid() = user_id);

-- no insert/update/delete policy on user_roles for regular users:
-- grants happen via an admin-only RPC added in a later migration.
