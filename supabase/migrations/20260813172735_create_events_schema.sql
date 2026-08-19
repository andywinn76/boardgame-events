-- Step 2: create event -> browse -> event detail. No RSVP yet.
-- venue_id is deliberately absent here; venues + the address gate land in step 4
-- (docs/architecture.md build order). Location is plain host-entered fields until then.

create type event_status     as enum ('draft','published','cancelled','completed');
create type event_visibility as enum ('public','unlisted','invite_only');
create type host_role        as enum ('owner','cohost');

create table events (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text unique,
  created_by           uuid not null references profiles(id) on delete restrict,

  -- public-facing coarse location; safe to expose on listings and to anonymous browsers
  location_label       text,
  neighborhood         text,
  cross_streets        text,
  city                 text,
  region               text,
  approx_lat           numeric(9,6),
  approx_lng           numeric(9,6),

  title                text not null,
  description          text,
  status               event_status not null default 'draft',
  visibility           event_visibility not null default 'public',

  starts_at            timestamptz not null,
  ends_at              timestamptz,
  timezone             text not null default 'America/Denver',
  rsvp_opens_at        timestamptz,
  rsvp_closes_at       timestamptz,

  seat_limit           int check (seat_limit is null or seat_limit > 0),  -- null = unlimited
  allow_waitlist       boolean not null default true,
  allow_plus_ones      boolean not null default false,

  -- every matching hint below is optional by design
  complexity_min       smallint check (complexity_min between 1 and 5),
  complexity_max       smallint check (complexity_max between 1 and 5),
  weight_min           numeric(3,2) check (weight_min between 1 and 5),
  weight_max           numeric(3,2) check (weight_max between 1 and 5),
  playtime_min_minutes int,
  playtime_max_minutes int,
  min_players          smallint,
  max_players          smallint,
  teaching_friendly    boolean,
  newcomers_welcome    boolean,
  bring_a_game         boolean,
  age_minimum          smallint,
  cost_cents           int default 0,
  food_policy          text,
  cover_image_url      text,

  recurrence_rule      text,
  parent_event_id      uuid references events(id) on delete cascade,

  cancelled_at         timestamptz,
  cancelled_by         uuid references profiles(id) on delete set null,
  cancellation_reason  text,
  deleted_at           timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  check (ends_at is null or ends_at > starts_at),
  check (complexity_max is null or complexity_min is null or complexity_max >= complexity_min),
  check (weight_max     is null or weight_min     is null or weight_max     >= weight_min)
);
create index on events (starts_at) where status = 'published';
create index on events (created_by);

create trigger events_set_updated_at
  before update on events
  for each row execute function public.set_updated_at();

create table event_hosts (
  event_id  uuid not null references events(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      host_role not null default 'cohost',
  added_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
create unique index one_owner_per_event on event_hosts (event_id) where role = 'owner';

-- creator becomes the event's owner host automatically
create or replace function public.handle_new_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.event_hosts (event_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end $$;

create trigger on_event_created
  after insert on events
  for each row execute function public.handle_new_event();

-- ---------- RLS ----------
alter table events enable row level security;

create policy "read published or own" on events for select using (
  (status = 'published' and visibility = 'public')
  or created_by = auth.uid()
  or exists (select 1 from event_hosts h where h.event_id = id and h.user_id = auth.uid())
  or has_role(auth.uid(), 'admin')
);

create policy "authenticated users create events" on events for insert
  with check (created_by = auth.uid());

create policy "hosts update own events" on events for update using (
  exists (select 1 from event_hosts h where h.event_id = id and h.user_id = auth.uid())
  or has_role(auth.uid(), 'admin')
);

alter table event_hosts enable row level security;

-- narrow on purpose: a host can see their own membership row. Broadened when the
-- co-host management console (build order step 7) needs the full roster.
create policy "read own host rows" on event_hosts for select using (
  user_id = auth.uid() or has_role(auth.uid(), 'admin')
);

-- ---------- grants ----------
-- table-level GRANTs are the outer gate PostgREST checks before RLS ever runs
-- (see the step-1 migration note); every new table needs these explicitly.
grant select on public.events to anon, authenticated;
grant insert, update on public.events to authenticated;

grant select on public.event_hosts to authenticated;
