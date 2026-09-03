-- Give account-free attendees a browser-bound capability token so they can
-- revisit their RSVP and attendee-only event details without an account.

alter table public.rsvps add column guest_access_token_hash bytea;

create or replace function public.anonymous_rsvp_to_event(
  _event uuid,
  _first_name text,
  _last_initial text,
  _access_token text
)
returns public.rsvps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _event_row public.events;
  _taken integer;
  _row public.rsvps;
  _clean_first_name text := btrim(_first_name);
  _clean_last_initial text := upper(btrim(_last_initial));
begin
  if auth.uid() is not null then
    raise exception 'signed-in members should use the member RSVP form';
  end if;
  if char_length(_access_token) < 32 then raise exception 'invalid access token'; end if;
  if _clean_first_name !~ '^[[:alpha:]][[:alpha:] ''-]{0,39}$'
     or _clean_last_initial !~ '^[[:alpha:]]$' then
    raise exception 'enter a first name and one-letter last initial';
  end if;

  select * into _event_row from public.events where id = _event for update;
  if not found then raise exception 'event not found'; end if;
  if _event_row.status <> 'published' or _event_row.deleted_at is not null then
    raise exception 'event is not open for RSVP';
  end if;
  if not _event_row.allow_anonymous_rsvps then
    raise exception 'guest RSVPs are not enabled for this event';
  end if;
  if _event_row.visibility = 'invite_only' then
    raise exception 'invite-only events require an account';
  end if;
  if _event_row.rsvp_opens_at is not null and now() < _event_row.rsvp_opens_at then
    raise exception 'RSVPs are not open yet';
  end if;
  if _event_row.rsvp_closes_at is not null and now() > _event_row.rsvp_closes_at then
    raise exception 'RSVPs are closed';
  end if;

  select coalesce(sum(seats_claimed), 0) into _taken
  from public.rsvps where event_id = _event and status = 'going';
  if _event_row.seat_limit is not null
     and _taken + 1 > _event_row.seat_limit
     and not _event_row.allow_waitlist then
    raise exception 'event is full';
  end if;

  insert into public.rsvps (
    event_id, user_id, guest_first_name, guest_last_initial,
    guest_access_token_hash, seats_claimed, status
  ) values (
    _event, null, _clean_first_name, _clean_last_initial,
    extensions.digest(_access_token, 'sha256'), 1,
    case when _event_row.seat_limit is null or _taken + 1 <= _event_row.seat_limit
      then 'going'::public.rsvp_status else 'waitlist'::public.rsvp_status end
  ) returning * into _row;
  return _row;
exception
  when unique_violation then
    raise exception 'that guest name is already registered for this event';
end;
$$;

drop function if exists public.anonymous_rsvp_to_event(uuid, text, text);
revoke all on function public.anonymous_rsvp_to_event(uuid, text, text, text) from public;
grant execute on function public.anonymous_rsvp_to_event(uuid, text, text, text) to anon;

create or replace function public.anonymous_rsvp_details(_event uuid, _access_token text)
returns table (
  id uuid, status public.rsvp_status, seats_claimed smallint,
  guest_first_name text, guest_last_initial text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, r.status, r.seats_claimed, r.guest_first_name, r.guest_last_initial
  from public.rsvps r
  where r.event_id = _event
    and r.user_id is null
    and r.guest_access_token_hash = extensions.digest(_access_token, 'sha256')
    and r.status in ('going', 'waitlist', 'maybe');
$$;

create or replace function public.anonymous_cancel_rsvp(_event uuid, _access_token text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.rsvps
     set status = 'cancelled', cancelled_at = now(), updated_at = now()
   where event_id = _event
     and user_id is null
     and guest_access_token_hash = extensions.digest(_access_token, 'sha256')
     and status in ('going', 'waitlist', 'maybe');
  if not found then raise exception 'guest RSVP not found'; end if;
end;
$$;

create or replace function public.anonymous_event_attendee_names(_event uuid, _access_token text)
returns table (attendee_name text, is_organizer boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    case when r.user_id is null then r.guest_first_name || ' ' || r.guest_last_initial || '.'
      else coalesce(nullif(btrim(p.first_name), ''), nullif(split_part(btrim(p.display_name), ' ', 1), ''), p.username, 'A member')
        || coalesce(' ' || left(nullif(btrim(p.last_name), ''), 1) || '.', '')
    end as attendee_name,
    r.user_id = e.created_by as is_organizer
  from public.rsvps r
  left join public.profiles p on p.id = r.user_id
  join public.events e on e.id = r.event_id
  where r.event_id = _event and r.status = 'going'
    and exists (
      select 1 from public.rsvps viewer
      where viewer.event_id = _event and viewer.user_id is null
        and viewer.guest_access_token_hash = extensions.digest(_access_token, 'sha256')
        and viewer.status = 'going'
    )
  order by (r.user_id = e.created_by) desc, attendee_name;
$$;

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
  if not found then return; end if;
  if _venue_row.kind = 'private_residence' and not exists (
    select 1 from public.event_hosts h
    where h.event_id = _event and h.user_id = _venue_row.created_by
  ) then return; end if;
  return query select _venue_row.name, _venue_row.address_line1, _venue_row.address_line2,
    _venue_row.city, _venue_row.region, _venue_row.postal_code, _venue_row.access_notes,
    _venue_row.website, _venue_row.lat, _venue_row.lng, _venue_row.google_place_id;
end;
$$;

revoke all on function public.anonymous_rsvp_details(uuid, text) from public;
revoke all on function public.anonymous_cancel_rsvp(uuid, text) from public;
revoke all on function public.anonymous_event_attendee_names(uuid, text) from public;
revoke all on function public.anonymous_event_venue_details(uuid, text) from public;
grant execute on function public.anonymous_rsvp_details(uuid, text) to anon, authenticated;
grant execute on function public.anonymous_cancel_rsvp(uuid, text) to anon;
grant execute on function public.anonymous_event_attendee_names(uuid, text) to anon, authenticated;
grant execute on function public.anonymous_event_venue_details(uuid, text) to anon, authenticated;
