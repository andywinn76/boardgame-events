# Board Game Event App — Architecture (Pass 1) + BGG Integration (Pass 2)

Stack: Next.js (App Router) + Tailwind + Supabase (Postgres, Auth, Storage, Edge Functions).

---

## 1. Design decisions worth locking in first

| Decision | Why |
| --- | --- |
| Roles live in a separate `user_roles` table, never a column on `profiles` | If role sits on the profile row the user can `update` their own row to `admin`. RLS reads roles through a `security definer` helper instead. |
| One account, many hats | No separate "host account". Hosting is a capability (`host` role + being listed in `event_hosts`), not an account type. |
| Venues are first-class, with a `kind` | Same table serves the recurring board game café and someone's living room. `is_shared = true` makes it appear in the venue picker for everyone. |
| Street address is **not** on the event row | Private residences leak otherwise. The event carries a public coarse layer (neighborhood, cross streets, jittered pin); the exact address lives on an RLS-locked venue row that only hosts and RSVP'd players can select at all. |
| `seat_limit IS NULL` means unlimited | Avoids a magic number and a second boolean. |
| Considerations are rows, not a JSON blob, each with its own visibility | "Peanut allergy" and "I'm red-green colorblind" are sensitive. Per-item `visibility` lets a user share with hosts only. |
| `games` table is BGG-agnostic with a nullable `bgg_id` | Pass 2 becomes purely additive — no migration of pass-1 data. |
| Cancelling is a status change with a reason, never a delete | Attendees need to know *why*, and you need the history. Deletion is a separate `deleted_at` soft-delete for spam/mistakes. |
| No-show counts are visible to hosts only, never on public profiles | A public flake score turns a hobby app into a reputation system people get anxious about. Hosts get the signal; nobody gets a scarlet letter. |
| Waitlist promotion happens in the database, not the app | It has to run on cancellation, on seat-limit increases, and on host removal of an RSVP. One trigger covers all three. |

---

## 2. Schema

```sql
create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------- enums ----------
create type app_role            as enum ('admin','moderator','host','player');
create type event_status        as enum ('draft','published','cancelled','completed');
create type event_visibility    as enum ('public','unlisted','invite_only');
create type venue_kind          as enum ('public_venue','private_residence','online','other');
create type host_role           as enum ('owner','cohost');
create type rsvp_status         as enum ('going','waitlist','maybe','declined','cancelled');
create type consideration_kind  as enum ('vision','hearing','mobility','allergy','dietary','sensory','other');
create type share_scope         as enum ('private','hosts_only','attendees','public');
create type game_slot_status    as enum ('proposed','scheduled','played','dropped');

-- ---------- identity ----------
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     citext unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  first_name   text,
  last_name    text,
  preferred_pronouns text,
  display_name text,
  avatar_url   text,
  bio          text,
  games_yes_please text,
  games_no_thanks text,
  home_city    text,
  timezone     text not null default 'America/Denver',
  ics_token    text unique default encode(gen_random_bytes(16),'hex'),  -- calendar feed auth
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

-- ---------- player-side preferences ----------
create table user_preferences (
  user_id              uuid primary key references profiles(id) on delete cascade,
  preferred_weight_min numeric(3,2) check (preferred_weight_min between 1 and 5),
  preferred_weight_max numeric(3,2) check (preferred_weight_max between 1 and 5),
  max_playtime_minutes int,
  preferred_player_min smallint,
  preferred_player_max smallint,
  travel_radius_km     int,
  teaching_ok          boolean default true,   -- happy to teach newcomers
  new_to_hobby         boolean default false,
  notify_email         boolean not null default true,
  notify_new_nearby    boolean not null default false,
  default_share_scope  share_scope not null default 'hosts_only',
  updated_at           timestamptz not null default now(),
  check (preferred_weight_max >= preferred_weight_min)
);

create table user_considerations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       consideration_kind not null,
  label      text not null,          -- 'Deuteranopia', 'Tree nuts', 'Step-free access'
  details    text,                   -- 'Avoid red/green player colors'
  severity   smallint check (severity between 1 and 3),
  visibility share_scope not null default 'hosts_only',
  created_at timestamptz not null default now()
);
create index on user_considerations (user_id);

-- ---------- venues ----------
create table venues (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references profiles(id) on delete set null,
  name            text not null,
  kind            venue_kind not null default 'public_venue',
  is_shared       boolean not null default false,  -- listed in the public venue picker
  address_line1   text,
  address_line2   text,
  city            text,
  region          text,
  postal_code     text,
  country         text default 'US',
  neighborhood    text,
  cross_streets   text,
  lat             numeric(9,6),
  lng             numeric(9,6),
  google_place_id text,
  access_notes    text,   -- parking, buzzer code, "side door" — attendees only
  website         text,
  created_at      timestamptz not null default now()
);
create index on venues (city);
create index on venues using gin (name gin_trgm_ops);

-- ---------- events ----------
create table events (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text unique,
  created_by           uuid not null references profiles(id) on delete restrict,
  venue_id             uuid references venues(id) on delete set null,

  -- public-facing coarse location; safe to expose on listings and to anonymous browsers
  location_label       text,          -- 'Meeple Mountain Café' or "Sarah's place"
  neighborhood         text,          -- 'Wash Park'
  cross_streets        text,          -- 'Downing & Louisiana'
  city                 text,
  region               text,
  approx_lat           numeric(9,6),  -- exact for public venues, jittered for residences
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

  recurrence_rule      text,                       -- iCal RRULE, phase 2
  parent_event_id      uuid references events(id) on delete cascade,

  cancelled_at         timestamptz,
  cancelled_by         uuid references profiles(id) on delete set null,
  cancellation_reason  text,
  deleted_at           timestamptz,                -- soft delete; distinct from cancelled

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  check (ends_at is null or ends_at > starts_at),
  check (complexity_max is null or complexity_min is null or complexity_max >= complexity_min),
  check (weight_max     is null or weight_min     is null or weight_max     >= weight_min)
);
create index on events (starts_at) where status = 'published';
create index on events (venue_id);
create index on events (created_by);

create table event_hosts (
  event_id  uuid not null references events(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      host_role not null default 'cohost',
  added_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
-- exactly one owner per event
create unique index one_owner_per_event on event_hosts (event_id) where role = 'owner';

create table rsvps (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  status        rsvp_status not null default 'going',
  seats_claimed smallint not null default 1 check (seats_claimed between 1 and 6),
  note          text,                  -- "arriving 20 min late"
  waitlist_pos  int,
  checked_in_at timestamptz,
  no_show       boolean not null default false,   -- set by a host after the event
  cancelled_at  timestamptz,                      -- when they backed out, for lead-time stats
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (event_id, user_id)
);
create index on rsvps (event_id, status);
create index on rsvps (user_id);

create table event_invites (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  email      citext,
  token      text unique not null default encode(gen_random_bytes(16),'hex'),
  invited_by uuid references profiles(id),
  claimed_by uuid references profiles(id),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- games ----------
create table games (
  id               uuid primary key default gen_random_uuid(),
  bgg_id           int unique,               -- null until pass 2 / manual entry
  name             text not null,
  year_published   smallint,
  min_players      smallint,
  max_players      smallint,
  playtime_minutes int,
  weight           numeric(3,2),             -- BGG averageweight
  thumbnail_url    text,
  synced_at        timestamptz
);
create index on games using gin (name gin_trgm_ops);

create table event_games (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  game_id     uuid references games(id) on delete set null,
  custom_name text,                       -- for games not in the catalog yet
  proposed_by uuid references profiles(id) on delete set null,
  status      game_slot_status not null default 'proposed',
  seats       smallint,
  notes       text,
  created_at  timestamptz not null default now(),
  check (game_id is not null or custom_name is not null)
);

create table event_game_interest (   -- lightweight "I'd play that" votes
  event_game_id uuid not null references event_games(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  primary key (event_game_id, user_id)
);

-- ---------- social / ops ----------
create table event_messages (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  body       text not null,
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,      -- 'rsvp_confirmed','promoted_from_waitlist','event_cancelled',...
  event_id   uuid references events(id) on delete cascade,
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, read_at);

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
```

### Seat counting

```sql
create view event_seat_counts as
select e.id as event_id,
       e.seat_limit,
       coalesce(sum(r.seats_claimed) filter (where r.status = 'going'), 0) as seats_taken,
       case when e.seat_limit is null then null
            else e.seat_limit - coalesce(sum(r.seats_claimed) filter (where r.status='going'),0)
       end as seats_left
from events e
left join rsvps r on r.event_id = e.id
group by e.id;
```

Do the actual RSVP through an RPC, not a client-side insert — you need the row lock to avoid two people taking the last seat simultaneously:

```sql
create or replace function public.rsvp_to_event(_event uuid, _seats smallint default 1)
returns rsvps language plpgsql security definer set search_path = public as $$
declare _limit int; _taken int; _row rsvps;
begin
  select seat_limit into _limit from events where id = _event for update;
  select coalesce(sum(seats_claimed),0) into _taken
    from rsvps where event_id = _event and status = 'going';

  insert into rsvps (event_id, user_id, seats_claimed, status)
  values (_event, auth.uid(), _seats,
          case when _limit is null or _taken + _seats <= _limit
               then 'going'::rsvp_status else 'waitlist'::rsvp_status end)
  on conflict (event_id, user_id)
    do update set seats_claimed = excluded.seats_claimed, updated_at = now()
  returning * into _row;

  return _row;
end $$;
```

### Waitlist auto-promotion

One trigger covers every way a seat frees up: attendee cancels, host removes someone, or the host raises `seat_limit`.

```sql
create or replace function public.promote_waitlist()
returns trigger language plpgsql security definer set search_path = public as $$
declare _event uuid; _limit int; _taken int; _cand rsvps;
begin
  if pg_trigger_depth() > 1 then return null; end if;   -- our own updates re-fire this

  if tg_table_name = 'events' then
    _event := new.id;
  elsif tg_op = 'DELETE' then
    _event := old.event_id;
  else
    _event := new.event_id;
  end if;

  select seat_limit into _limit from events where id = _event for update;
  if _limit is null then return null; end if;          -- unlimited, nothing to promote into

  loop
    select coalesce(sum(seats_claimed),0) into _taken
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

  return null;   -- AFTER trigger, return value ignored
end $$;

create trigger rsvps_promote_waitlist
  after update of status or delete on rsvps
  for each row execute function public.promote_waitlist();

create trigger events_promote_waitlist
  after update of seat_limit on events
  for each row execute function public.promote_waitlist();
```

The `pg_trigger_depth()` guard is load-bearing — without it the `update rsvps` inside the loop re-enters the trigger.

### Cancellation

```sql
create or replace function public.cancel_event(_event uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from event_hosts
                  where event_id = _event and user_id = auth.uid())
     and not has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  update events
     set status = 'cancelled', cancelled_at = now(),
         cancelled_by = auth.uid(), cancellation_reason = _reason, updated_at = now()
   where id = _event and status <> 'cancelled';

  insert into notifications (user_id, type, event_id, payload)
  select r.user_id, 'event_cancelled', _event, jsonb_build_object('reason', _reason)
    from rsvps r
   where r.event_id = _event and r.status in ('going','waitlist','maybe');
end $$;
```

RSVP rows are deliberately left untouched — you want the roster preserved so the host can message the group, and so a cancelled event doesn't quietly erase who had committed. Make `_reason` required in the UI; "cancelled, no explanation" is the fastest way to lose a regular.

Cancelled events still render (greyed, reason shown) until they fall out of the upcoming window. Filter them from the calendar with `status = 'published'`, not by hiding the detail page.

### Attendance and no-shows

```sql
create view attendee_reliability with (security_invoker = true) as
select r.user_id,
       count(*) filter (where r.status = 'going' and e.status = 'completed')   as commitments,
       count(*) filter (where r.checked_in_at is not null)                     as attended,
       count(*) filter (where r.no_show)                                       as no_shows,
       count(*) filter (where r.cancelled_at > e.starts_at - interval '24 hours') as late_drops,
       max(e.starts_at) filter (where r.checked_in_at is not null)             as last_attended
from rsvps r
join events e on e.id = r.event_id
group by r.user_id;
```

`security_invoker` makes the view obey the underlying `rsvps` RLS, so a player only ever sees their own row and a host sees it for their own attendees. Surface it in the host console as a quiet badge on the roster ("3 events, 1 no-show"), never as a number on a public profile.

Check-in is a one-tap action on the host's roster view during the event; a nightly job flips `status` to `completed` and marks un-checked-in `going` RSVPs as `no_show` — with a host override, since plenty of hosts will forget to check anyone in at all. Consider skipping the auto-mark entirely if zero check-ins were recorded for the event.

### Calendar export

```sql
-- nothing needed server-side; build the .ics in the route handler
```

- `/api/ics/[eventId]` — single `VEVENT`, `Content-Type: text/calendar`, `Content-Disposition: attachment`. Include `UID` (the event uuid), `DTSTART`/`DTEND` in UTC with the `TZID` param, `LOCATION`, `URL`, and `STATUS:CANCELLED` for cancelled events so subscribers' calendars update themselves.
- `/api/ics/me?token=…` — a subscribable feed of the caller's `going` RSVPs, authenticated by an opaque per-user token (calendar clients can't carry a session). Store it as `profiles.ics_token`, regenerable from settings.
- `SEQUENCE` must increment whenever an event's time or location changes, or clients ignore the update. Bump it from `updated_at` or keep an explicit counter.

This gets you Google/Apple/Outlook support without touching OAuth.

### Two-layer location

Layer 1 — **coarse, public, denormalized onto the event.** `location_label`, `neighborhood`, `cross_streets`, `city`, `approx_lat/lng`. Every listing, calendar cell, search filter, and anonymous page view reads only these. Nothing here identifies a house.

Layer 2 — **exact, on the venue row, RLS-locked.** Street address, unit number, `access_notes`. A private-residence venue row is simply not selectable unless you're a host or have an RSVP:

```sql
alter table venues enable row level security;

create policy "public venues readable" on venues for select using (
  kind <> 'private_residence'
);

create policy "residence readable by hosts and attendees" on venues for select using (
  kind = 'private_residence'
  and exists (
    select 1 from events e
    where e.venue_id = venues.id
      and ( exists (select 1 from event_hosts h
                     where h.event_id = e.id and h.user_id = auth.uid())
         or exists (select 1 from rsvps r
                     where r.event_id = e.id and r.user_id = auth.uid()
                       and r.status in ('going','waitlist')) )
  )
);

create policy "creator manages own venues" on venues for all using (created_by = auth.uid());
```

Row-level rather than column-level means no leaky partial selects — the client either gets the whole venue or nothing, and the coarse fields it needs for the listing are already on the event.

Populate the event's coarse fields from the venue on write:

```sql
create or replace function public.sync_event_location()
returns trigger language plpgsql security definer set search_path = public as $$
declare _v venues;
begin
  if new.venue_id is null then return new; end if;
  select * into _v from venues where id = new.venue_id;

  new.location_label := coalesce(new.location_label, _v.name);
  new.neighborhood   := coalesce(new.neighborhood,   _v.neighborhood);
  new.cross_streets  := coalesce(new.cross_streets,  _v.cross_streets);
  new.city           := coalesce(new.city,           _v.city);
  new.region         := coalesce(new.region,         _v.region);

  if _v.kind = 'private_residence' then
    -- snap to ~500m so the pin lands on the block, not the driveway
    new.approx_lat := round(_v.lat,  2) + (random() - 0.5) * 0.004;
    new.approx_lng := round(_v.lng,  2) + (random() - 0.5) * 0.004;
  else
    new.approx_lat := _v.lat;
    new.approx_lng := _v.lng;
  end if;

  return new;
end $$;

create trigger events_sync_location
  before insert or update of venue_id on events
  for each row execute function public.sync_event_location();
```

Jitter once at write time, not per read — a per-read random offset can be averaged out across repeated views to recover the true point.

Map links: exact `lat,lng` (or `google_place_id`) for anyone who can read the venue row; for everyone else, link the cross streets as a search string instead of a pin.

```
https://www.google.com/maps/search/?api=1&query={lat},{lng}
https://www.google.com/maps/search/?api=1&query_place_id={google_place_id}
https://www.google.com/maps/search/?api=1&query=Downing+%26+Louisiana,+Denver,+CO
```

A host writing a private residence should get a plain-language reminder in the venue form: guests see the neighborhood and cross streets until they RSVP, then the full address.

### RLS sketch

Enable RLS on every table. The load-bearing policies:

```sql
alter table events enable row level security;

create policy "read published or own" on events for select using (
  (status = 'published' and visibility = 'public')
  or created_by = auth.uid()
  or exists (select 1 from event_hosts h where h.event_id = id and h.user_id = auth.uid())
  or has_role(auth.uid(),'admin')
);

create policy "hosts write" on events for update using (
  exists (select 1 from event_hosts h where h.event_id = id and h.user_id = auth.uid())
  or has_role(auth.uid(),'admin')
);

alter table user_considerations enable row level security;

create policy "owner full access" on user_considerations
  for all using (user_id = auth.uid());

create policy "hosts see shared considerations" on user_considerations for select using (
  visibility in ('hosts_only','attendees','public')
  and exists (
    select 1 from rsvps r
    join event_hosts h on h.event_id = r.event_id
    where r.user_id = user_considerations.user_id
      and r.status in ('going','waitlist')
      and h.user_id = auth.uid()
  )
);
```

`user_roles` gets a select-own policy and **no** insert/update policy for regular users — grants happen via an admin-only RPC.

---

## 3. Next.js structure

```
app/
  (marketing)/page.tsx
  (auth)/login, /signup, /callback
  events/
    page.tsx                  # browse + filters (date, weight, seats left, distance)
    calendar/page.tsx         # month/week grid
    new/page.tsx              # host wizard — everything optional past title/date
    [slug]/
      page.tsx                # detail + RSVP + game list + comments
      manage/page.tsx         # host console: roster, considerations digest, co-hosts
  profile/[username]/page.tsx
  settings/{profile,preferences,considerations,connections}/page.tsx
  admin/{users,events,reports}/page.tsx
  api/ics/[eventId]/route.ts  # single-event .ics
  api/ics/me/route.ts         # subscribable feed of my RSVPs
```

- Server Components + `@supabase/ssr` for reads; Server Actions or RPCs for writes.
- Calendar: build the grid yourself with `date-fns` (FullCalendar is heavy and fights Tailwind), or `react-big-calendar` if you want drag-drop later.
- Store `starts_at` as `timestamptz` and always render in the event's `timezone`, not the viewer's — a game night is at 7pm local regardless of who's looking.
- Realtime subscription on `rsvps` for the seat counter — you already know this pattern from the todo app.
- Host console should surface a **considerations digest**: aggregated, de-duplicated list across the confirmed roster ("2 attendees: tree nut allergy · 1: color vision deficiency — avoid red/green") rather than a per-person dossier.

### Recurring events

`recurrence_rule` (iCal RRULE) + `parent_event_id` are in the schema. Generate concrete child rows on a schedule — a weekly job that materializes the next ~8 weeks — rather than computing occurrences at query time. Concrete rows mean each occurrence gets its own RSVPs, game list, and cancellation, which is what people actually want ("I'm out this week, in next week"). Editing the parent should prompt: this occurrence, or all future ones?

### Build order

Roughly what I'd sequence, since most of the above doesn't need to exist on day one:

1. Auth + `profiles` + `user_roles` + RLS skeleton. Get the role helper right before anything else depends on it.
2. Create event → browse → event detail. No RSVP yet.
3. RSVP RPC, seat counts, waitlist + promotion trigger.
4. Venues, address gate, map links.
5. Preferences + considerations + host digest.
6. Calendar view, ICS export.
7. Co-hosts, invites, messages, notifications.
8. Check-in, no-shows, cancellation.
9. Admin console, reports.
10. Recurring events.
11. BGG.

Steps 1–4 are a usable app. Everything after is quality of life.

---

## 4. Pass 2 — BoardGameGeek

BGG's XML API2 (`https://boardgamegeek.com/xmlapi2/`) is read-only. BGG now requires application registration and a server-side bearer token for nearly all XML API use. Practical consequences:

- Keep `BGG_API_TOKEN` server-only and make all BGG requests through our route handlers or server actions. Public-facing pages must credit BoardGameGeek under its API terms.
- "Linking an account" is really "claiming a username." A soft verification: have the user paste a one-time token into a public profile field, then fetch `/user?name=X` and check whether it echoes back. Confirm which fields that endpoint actually returns before you build the flow — `/user` exposes a limited set, and the bio is not among them.
- `/collection?username=X&stats=1` returns **HTTP 202** while BGG queues the request. You must retry with backoff — this alone means collection sync belongs in a Supabase Edge Function or a cron job, never in a request handler.
- Cache aggressively and never fetch BGG data during ordinary page loads. BGG currently warns that requests made more frequently than roughly five seconds apart may be throttled.
- Featured games are limited to five per event. Search returns lightweight matches; selecting a result fetches its box art, and publishing batch-verifies selected IDs before caching metadata in `games` and linking it through `event_games`.
- XML API2 does not expose the game Files area, so rules PDFs must not be scraped. A future organizer-supplied rules URL is the safe fallback.

```sql
create table bgg_accounts (
  user_id       uuid primary key references profiles(id) on delete cascade,
  bgg_username  citext not null unique,
  verified_at   timestamptz,
  verify_token  text,
  last_synced_at timestamptz,
  sync_status   text default 'idle',
  sync_error    text
);

create table user_games (
  user_id    uuid not null references profiles(id) on delete cascade,
  game_id    uuid not null references games(id) on delete cascade,
  owned      boolean default false,
  wishlist   boolean default false,
  rating     numeric(3,1),
  bring_able boolean default false,   -- willing to haul it to an event
  synced_at  timestamptz,
  primary key (user_id, game_id)
);
```

What it unlocks, roughly in value order:

1. **"Games available tonight"** — union of `user_games.bring_able` across the confirmed roster.
2. **Real weight numbers** — populate `games.weight` from `/thing?id=…&stats=1`, then auto-suggest an event's `weight_min/max` from the proposed game list instead of making the host guess.
3. **Gap-filling** — highlight proposed games nobody on the roster owns.
4. **Wishlist matching** — "3 attendees have this on their wishlist."

Sync design: an Edge Function per user, triggered on link and then daily; write to `games` first (upsert on `bgg_id`), then `user_games`. Keep `games` shared across all users so a popular title is fetched once.
