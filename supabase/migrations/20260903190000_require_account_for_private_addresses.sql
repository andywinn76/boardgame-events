-- Anonymous RSVP capability tokens may unlock attendee names for public venues,
-- but exact private-residence details always require an authenticated RSVP.

create or replace function public.anonymous_event_venue_details(_event uuid, _access_token text)
returns table (
  name text, address_line1 text, address_line2 text, city text, region text,
  postal_code text, access_notes text, website text, lat numeric, lng numeric,
  google_place_id text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _event_row public.events; _venue_row public.venues;
begin
  if not exists (
    select 1 from public.rsvps r where r.event_id = _event and r.user_id is null
      and r.guest_access_token_hash = extensions.digest(_access_token, 'sha256') and r.status = 'going'
  ) then return; end if;

  select * into _event_row from public.events where id = _event;
  if not found or _event_row.venue_id is null then return; end if;
  select * into _venue_row from public.venues where id = _event_row.venue_id;
  if not found or _venue_row.kind = 'private_residence' then return; end if;

  return query select _venue_row.name, _venue_row.address_line1, _venue_row.address_line2,
    _venue_row.city, _venue_row.region, _venue_row.postal_code, _venue_row.access_notes,
    _venue_row.website, _venue_row.lat, _venue_row.lng, _venue_row.google_place_id;
end;
$$;

revoke all on function public.anonymous_event_venue_details(uuid, text) from public;
grant execute on function public.anonymous_event_venue_details(uuid, text) to anon, authenticated;
