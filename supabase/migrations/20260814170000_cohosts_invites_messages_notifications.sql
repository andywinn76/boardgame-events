-- Step 7: co-hosts, invites, messages, notifications.
-- Also closes two gaps explicitly deferred to this step by earlier migration
-- comments: event_hosts and rsvps SELECT policies were kept narrow ("own row
-- only") until the host console needed the full roster -- it does now.

-- ---------- broaden host/roster visibility ----------
drop policy "read own host rows" on event_hosts;

create policy "hosts read event roster" on event_hosts for select using (
  user_id = auth.uid()
  or exists (select 1 from event_hosts h2 where h2.event_id = event_hosts.event_id and h2.user_id = auth.uid())
  or has_role(auth.uid(), 'admin')
);

drop policy "users read own rsvps" on rsvps;

create policy "read own rsvp or as event host" on rsvps for select using (
  user_id = auth.uid()
  or exists (select 1 from event_hosts h where h.event_id = rsvps.event_id and h.user_id = auth.uid())
  or has_role(auth.uid(), 'admin')
);

-- ---------- co-hosts ----------
-- Authorization (owner-only) lives in the function rather than event_hosts RLS,
-- since adding someone requires looking their profile up by username first.
create or replace function public.add_cohost(_event uuid, _username extensions.citext)
returns void language plpgsql security definer set search_path = public as $$
declare _target uuid;
begin
  if not exists (select 1 from event_hosts h where h.event_id = _event and h.user_id = auth.uid() and h.role = 'owner')
     and not has_role(auth.uid(), 'admin') then
    raise exception 'only the event owner can add co-hosts';
  end if;

  select id into _target from profiles where username = _username;
  if _target is null then
    raise exception 'no user with that username';
  end if;

  insert into event_hosts (event_id, user_id, role)
  values (_event, _target, 'cohost')
  on conflict (event_id, user_id) do nothing;
end $$;

create or replace function public.remove_cohost(_event uuid, _user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from event_hosts h where h.event_id = _event and h.user_id = auth.uid() and h.role = 'owner')
     and not has_role(auth.uid(), 'admin') then
    raise exception 'only the event owner can remove co-hosts';
  end if;

  delete from event_hosts where event_id = _event and user_id = _user and role = 'cohost';
end $$;

-- ---------- invites ----------
create table event_invites (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  email      extensions.citext,
  token      text unique not null default encode(extensions.gen_random_bytes(16), 'hex'),
  invited_by uuid references profiles(id),
  claimed_by uuid references profiles(id),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index on event_invites (event_id);

alter table event_invites enable row level security;

create policy "hosts manage own event invites" on event_invites for all using (
  exists (select 1 from event_hosts h where h.event_id = event_invites.event_id and h.user_id = auth.uid())
) with check (
  exists (select 1 from event_hosts h where h.event_id = event_invites.event_id and h.user_id = auth.uid())
);

-- Preview and claim run as the invited user, who has no event_invites SELECT
-- access via RLS until they've claimed it -- that's the whole point of a token.
create or replace function public.preview_invite(_token text)
returns table (event_slug text, event_title text, starts_at timestamptz, timezone text, already_claimed boolean)
language sql stable security definer set search_path = public as $$
  select e.slug, e.title, e.starts_at, e.timezone, (i.claimed_by is not null)
  from event_invites i
  join events e on e.id = i.event_id
  where i.token = _token
    and (i.expires_at is null or i.expires_at > now());
$$;

create or replace function public.claim_event_invite(_token text)
returns text
language plpgsql security definer set search_path = public as $$
declare _invite event_invites;
begin
  select * into _invite from event_invites
   where token = _token and (expires_at is null or expires_at > now())
   for update;

  if _invite.id is null then
    raise exception 'invite not found or expired';
  end if;

  if _invite.claimed_by is not null and _invite.claimed_by <> auth.uid() then
    raise exception 'invite already claimed';
  end if;

  update event_invites set claimed_by = auth.uid() where id = _invite.id;

  return (select slug from events where id = _invite.event_id);
end $$;

-- invite_only events are readable by anyone who has claimed an invite to them,
-- in addition to the existing published/own/hosted cases. Unlisted events are
-- also fixed here to actually be reachable by direct link -- previously only
-- 'public' events matched the published clause, leaving 'unlisted' unusable.
drop policy "read published or own" on events;

create policy "read published, own, hosted, or invited" on events for select using (
  (status = 'published' and visibility in ('public', 'unlisted'))
  or created_by = auth.uid()
  or exists (select 1 from event_hosts h where h.event_id = id and h.user_id = auth.uid())
  or exists (select 1 from event_invites i where i.event_id = id and i.claimed_by = auth.uid())
  or has_role(auth.uid(), 'admin')
);

-- ---------- messages ----------
create table event_messages (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  body       text not null,
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);
create index on event_messages (event_id, created_at);

alter table event_messages enable row level security;

create policy "roster reads messages" on event_messages for select using (
  exists (select 1 from event_hosts h where h.event_id = event_messages.event_id and h.user_id = auth.uid())
  or exists (
    select 1 from rsvps r
    where r.event_id = event_messages.event_id and r.user_id = auth.uid()
      and r.status in ('going', 'waitlist', 'maybe')
  )
  or has_role(auth.uid(), 'admin')
);

create policy "roster posts messages" on event_messages for insert with check (
  user_id = auth.uid()
  and (
    exists (select 1 from event_hosts h where h.event_id = event_messages.event_id and h.user_id = auth.uid())
    or exists (
      select 1 from rsvps r
      where r.event_id = event_messages.event_id and r.user_id = auth.uid()
        and r.status in ('going', 'waitlist', 'maybe')
    )
  )
);

-- ---------- notifications ----------
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,
  event_id   uuid references events(id) on delete cascade,
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, read_at);

alter table notifications enable row level security;

create policy "owner reads own notifications" on notifications for select using (
  user_id = auth.uid()
);

create policy "owner marks own notifications read" on notifications for update using (
  user_id = auth.uid()
) with check (
  user_id = auth.uid()
);
-- no insert policy for regular users -- rows only ever come from security-definer
-- functions (e.g. promote_waitlist below), which bypass RLS entirely.

-- now that notifications exists, wire the waitlist-promotion notification that
-- the step-3 migration deferred to this step.
create or replace function public.promote_waitlist()
returns trigger language plpgsql security definer set search_path = public as $$
declare _event uuid; _limit int; _taken int; _cand rsvps;
begin
  if pg_trigger_depth() > 1 then return null; end if;

  if tg_table_name = 'events' then
    _event := new.id;
  elsif tg_op = 'DELETE' then
    _event := old.event_id;
  else
    _event := new.event_id;
  end if;

  select seat_limit into _limit from events where id = _event for update;
  if _limit is null then return null; end if;

  loop
    select coalesce(sum(seats_claimed), 0) into _taken
      from rsvps where event_id = _event and status = 'going';

    select * into _cand from rsvps
      where event_id = _event and status = 'waitlist'
        and seats_claimed <= _limit - _taken
      order by created_at
      limit 1;

    exit when _cand.id is null;

    update rsvps
       set status = 'going', waitlist_pos = null, updated_at = now()
     where id = _cand.id;

    insert into notifications (user_id, type, event_id, payload)
    values (_cand.user_id, 'promoted_from_waitlist', _event,
            jsonb_build_object('seats', _cand.seats_claimed));
  end loop;

  return null;
end $$;

-- ---------- grants ----------
-- event_invites needs an anon grant too: the broadened events policy above
-- references it in a subquery, and Postgres requires table-level SELECT for
-- every table touched by a combined RLS expression for the querying role, even
-- when RLS would filter it to zero rows (see the step-4 anon-grants fix).
grant select on public.event_invites to anon, authenticated;
grant insert, update, delete on public.event_invites to authenticated;

grant select, insert on public.event_messages to authenticated;

grant select, update on public.notifications to authenticated;
