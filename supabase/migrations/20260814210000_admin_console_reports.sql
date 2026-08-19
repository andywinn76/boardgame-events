-- Step 9: admin console, reports.
-- Closes the gap the step-1 migration explicitly deferred: user_roles has no
-- insert/update/delete policy for regular users ("grants happen via an
-- admin-only RPC") -- that RPC lands here.

-- ---------- role management ----------
create or replace function public.grant_role(_user uuid, _role app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  insert into user_roles (user_id, role, granted_by)
  values (_user, _role, auth.uid())
  on conflict (user_id, role) do nothing;
end $$;

create or replace function public.revoke_role(_user uuid, _role app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  delete from user_roles where user_id = _user and role = _role;
end $$;

-- admins need to see every user's roles for the console; has_role() is
-- security definer so this doesn't re-trigger itself (same as is_event_host()).
drop policy "users read own roles" on user_roles;

create policy "users read own roles or admin reads all" on user_roles for select using (
  user_id = auth.uid() or has_role(auth.uid(), 'admin')
);

-- ---------- reports ----------
create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references profiles(id) on delete set null,
  subject_user uuid references profiles(id) on delete cascade,
  event_id     uuid references events(id) on delete cascade,
  reason       text not null,
  resolved_by  uuid references profiles(id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index on reports (resolved_at);

alter table reports enable row level security;

create policy "users create reports" on reports for insert with check (
  reporter_id = auth.uid()
);

create policy "reporter reads own reports" on reports for select using (
  reporter_id = auth.uid()
);

create policy "admins manage all reports" on reports for all using (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'moderator')
);

grant select, insert, update on public.reports to authenticated;
