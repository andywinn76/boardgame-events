-- Step 5: preferences + considerations + host digest.
-- docs/architecture.md section 2 (player-side preferences) / CLAUDE.md architecture
-- rule 6: considerations are individual rows with per-item visibility, never a JSON
-- blob, and never rendered as a per-person list -- the host console gets an
-- aggregated, de-duplicated digest instead. That aggregation is done here, in
-- event_considerations_digest(), so the client never has a code path that could
-- render the raw per-person rows for someone else's considerations.

create type share_scope as enum ('private', 'hosts_only', 'attendees', 'public');
create type consideration_kind as enum ('vision', 'hearing', 'mobility', 'allergy', 'dietary', 'sensory', 'other');

create table user_preferences (
  user_id              uuid primary key references profiles(id) on delete cascade,
  preferred_weight_min numeric(3,2) check (preferred_weight_min between 1 and 5),
  preferred_weight_max numeric(3,2) check (preferred_weight_max between 1 and 5),
  max_playtime_minutes int,
  preferred_player_min smallint,
  preferred_player_max smallint,
  travel_radius_km     int,
  teaching_ok          boolean not null default true,
  new_to_hobby         boolean not null default false,
  notify_email         boolean not null default true,
  notify_new_nearby    boolean not null default false,
  default_share_scope  share_scope not null default 'hosts_only',
  updated_at           timestamptz not null default now(),
  check (preferred_weight_max is null or preferred_weight_min is null or preferred_weight_max >= preferred_weight_min)
);

create trigger user_preferences_set_updated_at
  before update on user_preferences
  for each row execute function public.set_updated_at();

create table user_considerations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       consideration_kind not null,
  label      text not null,
  details    text,
  severity   smallint check (severity between 1 and 3),
  visibility share_scope not null default 'hosts_only',
  created_at timestamptz not null default now()
);
create index on user_considerations (user_id);

-- ---------- host digest ----------
-- Authorization and aggregation both happen inside the function so the client
-- never has to be trusted to filter or de-duplicate the sensitive rows itself.
create or replace function public.event_considerations_digest(_event uuid)
returns table (kind consideration_kind, label text, max_severity smallint, attendee_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from event_hosts h where h.event_id = _event and h.user_id = auth.uid())
     and not has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  return query
    select c.kind, c.label, max(c.severity), count(distinct c.user_id)
    from user_considerations c
    join rsvps r on r.user_id = c.user_id
    where r.event_id = _event
      and r.status in ('going', 'waitlist')
      and c.visibility in ('hosts_only', 'attendees', 'public')
    group by c.kind, c.label
    order by count(distinct c.user_id) desc, c.label;
end $$;

-- ---------- RLS ----------
alter table user_preferences enable row level security;

create policy "owner manages own preferences" on user_preferences for all using (
  user_id = auth.uid()
);

alter table user_considerations enable row level security;

create policy "owner full access" on user_considerations for all using (
  user_id = auth.uid()
);

create policy "hosts see shared considerations" on user_considerations for select using (
  visibility in ('hosts_only', 'attendees', 'public')
  and exists (
    select 1 from rsvps r
    join event_hosts h on h.event_id = r.event_id
    where r.user_id = user_considerations.user_id
      and r.status in ('going', 'waitlist')
      and h.user_id = auth.uid()
  )
);

-- ---------- grants ----------
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select, insert, update, delete on public.user_considerations to authenticated;
