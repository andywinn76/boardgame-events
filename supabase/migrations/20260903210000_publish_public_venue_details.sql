-- Public venues such as breweries and cafes should be discoverable before an
-- RSVP. Private residences retain the authenticated confirmed-attendee gate.

create or replace function public.event_venue_details(_event uuid)
returns table (
  name text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  access_notes text,
  website text,
  lat numeric,
  lng numeric,
  google_place_id text
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  _event_row public.events;
  _venue_row public.venues;
  _is_host boolean;
  _is_going boolean;
begin
  select * into _event_row from public.events where id = _event;
  if not found or _event_row.venue_id is null then return; end if;

  select * into _venue_row from public.venues where id = _event_row.venue_id;
  if not found then return; end if;

  if _venue_row.kind = 'private_residence' then
    _is_host := exists (
      select 1 from public.event_hosts h where h.event_id = _event and h.user_id = auth.uid()
    );
    _is_going := exists (
      select 1 from public.rsvps r
      where r.event_id = _event and r.user_id = auth.uid() and r.status = 'going'
    );
    if not (_is_host or _is_going) then return; end if;
    if not exists (
      select 1 from public.event_hosts h
      where h.event_id = _event and h.user_id = _venue_row.created_by
    ) then return; end if;
  end if;

  return query select
    _venue_row.name, _venue_row.address_line1, _venue_row.address_line2,
    _venue_row.city, _venue_row.region, _venue_row.postal_code,
    _venue_row.access_notes, _venue_row.website, _venue_row.lat,
    _venue_row.lng, _venue_row.google_place_id;
end;
$$;

revoke all on function public.event_venue_details(uuid) from public;
grant execute on function public.event_venue_details(uuid) to anon, authenticated;
