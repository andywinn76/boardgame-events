-- Step 4: venues, the address gate, and map links.
-- docs/architecture.md section 2 ("Two-layer location") / CLAUDE.md architecture rule 4:
-- exact street addresses never appear on the events row. The coarse public layer
-- (location_label, neighborhood, cross_streets, city, approx_lat/lng) already lives
-- there from step 2; the exact address lives here, on an RLS-locked venues row.

create extension if not exists pg_trgm;

create type venue_kind as enum ('public_venue', 'private_residence', 'online', 'other');

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
  access_notes    text,   -- parking, buzzer code, "side door" -- attendees only
  website         text,
  created_at      timestamptz not null default now()
);
create index on venues (city);
create index on venues using gin (name gin_trgm_ops);

alter table events add column venue_id uuid references venues(id) on delete set null;
create index on events (venue_id);

-- populate the event's coarse fields from the venue whenever venue_id is set;
-- manually-entered fields on the event win if already present (coalesce).
create or replace function public.sync_event_location()
returns trigger language plpgsql security definer set search_path = public as $$
declare _v venues;
begin
  if new.venue_id is null then return new; end if;
  select * into _v from venues where id = new.venue_id;

  new.location_label := coalesce(new.location_label, _v.name);
  new.neighborhood    := coalesce(new.neighborhood,   _v.neighborhood);
  new.cross_streets   := coalesce(new.cross_streets,  _v.cross_streets);
  new.city            := coalesce(new.city,           _v.city);
  new.region           := coalesce(new.region,         _v.region);

  if _v.kind = 'private_residence' then
    -- snap to ~500m so the pin lands on the block, not the driveway. Jittered once
    -- at write time, not per read -- a per-read random offset can be averaged out
    -- across repeated views to recover the true point.
    if _v.lat is not null and _v.lng is not null then
      new.approx_lat := round(_v.lat, 2) + (random() - 0.5) * 0.004;
      new.approx_lng := round(_v.lng, 2) + (random() - 0.5) * 0.004;
    end if;
  else
    new.approx_lat := coalesce(new.approx_lat, _v.lat);
    new.approx_lng := coalesce(new.approx_lng, _v.lng);
  end if;

  return new;
end $$;

create trigger events_sync_location
  before insert or update of venue_id on events
  for each row execute function public.sync_event_location();

-- ---------- RLS ----------
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
                       and r.status in ('going', 'waitlist')) )
  )
);

create policy "creator manages own venues" on venues for all using (
  created_by = auth.uid()
);

-- ---------- grants ----------
grant select on public.venues to anon, authenticated;
grant insert, update on public.venues to authenticated;
