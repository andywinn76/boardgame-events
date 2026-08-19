-- /api/ics/me authenticates via profiles.ics_token instead of a session cookie
-- (calendar clients can't carry one). Rather than route that through a service-role
-- client -- a second, broader trust boundary to keep correct -- this does the token
-- lookup and the rsvps -> events -> venues join inside a security-definer function,
-- the same pattern as event_considerations_digest. Callable with the plain anon key;
-- an unknown token just yields zero rows rather than an error.
create or replace function public.get_my_ics_feed(_token text)
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  status event_status,
  updated_at timestamptz,
  location_label text,
  neighborhood text,
  cross_streets text,
  city text,
  venue_address_line1 text,
  venue_address_line2 text,
  venue_city text,
  venue_region text,
  venue_postal_code text
)
language plpgsql stable security definer set search_path = public as $$
declare _user uuid;
begin
  select p.id into _user from profiles p where p.ics_token = _token;

  if _user is null then
    return;
  end if;

  return query
    select e.id, e.slug, e.title, e.description,
           e.starts_at, e.ends_at, e.status, e.updated_at,
           e.location_label, e.neighborhood, e.cross_streets, e.city,
           v.address_line1, v.address_line2, v.city, v.region, v.postal_code
    from rsvps r
    join events e on e.id = r.event_id
    left join venues v on v.id = e.venue_id
    where r.user_id = _user and r.status = 'going';
end $$;
