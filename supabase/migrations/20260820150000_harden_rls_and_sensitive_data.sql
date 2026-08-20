-- Harden sensitive profile, venue, RSVP, and consideration access.

-- New functions should never be executable by PUBLIC unless a migration grants
-- them deliberately.
alter default privileges in schema public revoke execute on functions from public;

-- ---------- profiles and calendar tokens ----------
-- RLS controls rows, not columns. Keep the base profile rows readable for the
-- public identity fields used by relationship embeds, but remove all broad table
-- privileges and grant only the deliberately public columns.
revoke select on public.profiles from anon, authenticated;
grant select (id, username, display_name, avatar_url) on public.profiles to anon, authenticated;

-- Profile writes are similarly limited to fields a user is allowed to edit.
revoke update on public.profiles from authenticated;
grant update (
  username, display_name, avatar_url, bio, home_city, timezone,
  first_name, last_name, preferred_pronouns,
  games_yes_please, games_no_thanks
) on public.profiles to authenticated;

create or replace function public.get_my_profile()
returns table (
  username extensions.citext,
  first_name text,
  last_name text,
  preferred_pronouns text,
  bio text,
  games_yes_please text,
  games_no_thanks text
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.username, p.first_name, p.last_name, p.preferred_pronouns,
         p.bio, p.games_yes_please, p.games_no_thanks
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.get_my_ics_token()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.ics_token from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.rotate_my_ics_token()
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare _token text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  _token := encode(extensions.gen_random_bytes(16), 'hex');
  update public.profiles set ics_token = _token where id = auth.uid();
  return _token;
end $$;

revoke all on function public.get_my_profile() from public;
revoke all on function public.get_my_ics_token() from public;
revoke all on function public.rotate_my_ics_token() from public;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_my_ics_token() to authenticated;
grant execute on function public.rotate_my_ics_token() to authenticated;

-- Tokens were previously readable through profiles, so invalidate every
-- existing personal calendar URL after closing that exposure.
update public.profiles
set ics_token = encode(extensions.gen_random_bytes(16), 'hex');

-- ---------- private venue assignment and reads ----------
create or replace function public.can_assign_event_venue(
  _event uuid,
  _venue uuid,
  _created_by uuid
)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select _venue is null or exists (
    select 1
    from public.venues v
    where v.id = _venue
      and (
        v.kind <> 'private_residence'
        or v.created_by = auth.uid()
        or (
          _event is not null
          and exists (
            select 1 from public.event_hosts h
            where h.event_id = _event and h.user_id = v.created_by
          )
        )
      )
  );
$$;

revoke all on function public.can_assign_event_venue(uuid, uuid, uuid) from public;
grant execute on function public.can_assign_event_venue(uuid, uuid, uuid) to authenticated;

-- Hosts may edit event content, but immutable ownership and audit fields are not
-- client-writable.
revoke update on public.events from authenticated;
grant update (
  slug, location_label, neighborhood, cross_streets, city, region,
  approx_lat, approx_lng, title, description, visibility,
  starts_at, ends_at, timezone, rsvp_opens_at, rsvp_closes_at,
  seat_limit, allow_waitlist, allow_plus_ones,
  complexity_min, complexity_max, weight_min, weight_max,
  playtime_min_minutes, playtime_max_minutes, min_players, max_players,
  teaching_friendly, newcomers_welcome, bring_a_game, age_minimum,
  cost_cents, food_policy, cover_image_url, recurrence_rule, parent_event_id,
  venue_id, featured_games_enabled
) on public.events to authenticated;

drop policy "authenticated users create events" on public.events;
create policy "authenticated users create events" on public.events for insert
  with check (
    created_by = auth.uid()
    and public.can_assign_event_venue(id, venue_id, created_by)
  );

drop policy "hosts update own events" on public.events;
create policy "hosts update own events" on public.events for update using (
  exists (select 1 from public.event_hosts h where h.event_id = id and h.user_id = auth.uid())
  or public.has_role(auth.uid(), 'admin')
) with check (
  (
    exists (select 1 from public.event_hosts h where h.event_id = id and h.user_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  )
  and public.can_assign_event_venue(id, venue_id, created_by)
);

drop policy "residence readable by hosts and attendees" on public.venues;
create policy "residence readable by confirmed participants" on public.venues for select using (
  kind = 'private_residence'
  and exists (
    select 1
    from public.events e
    where e.venue_id = venues.id
      -- A private venue association is valid only when its owner is on the host
      -- team. This also neutralizes any pre-existing unauthorized association.
      and exists (
        select 1 from public.event_hosts venue_owner
        where venue_owner.event_id = e.id and venue_owner.user_id = venues.created_by
      )
      and (
        exists (
          select 1 from public.event_hosts h
          where h.event_id = e.id and h.user_id = auth.uid()
        )
        or exists (
          select 1 from public.rsvps r
          where r.event_id = e.id and r.user_id = auth.uid() and r.status = 'going'
        )
      )
  )
);

-- access_notes may contain door or entry instructions. Never expose it through
-- direct table reads.
revoke select on public.venues from anon, authenticated;
grant select (
  id, created_by, name, kind, is_shared,
  address_line1, address_line2, city, region, postal_code, country,
  neighborhood, cross_streets, lat, lng, google_place_id, website, created_at
) on public.venues to anon, authenticated;

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
  _is_invited boolean;
begin
  select * into _event_row from public.events where id = _event;
  if not found or _event_row.venue_id is null then return; end if;

  _is_host := exists (
    select 1 from public.event_hosts h where h.event_id = _event and h.user_id = auth.uid()
  );
  _is_going := exists (
    select 1 from public.rsvps r
    where r.event_id = _event and r.user_id = auth.uid() and r.status = 'going'
  );
  _is_invited := exists (
    select 1 from public.event_invites i where i.event_id = _event and i.claimed_by = auth.uid()
  );

  if not (
    (_event_row.status in ('published', 'cancelled', 'completed') and _event_row.visibility in ('public', 'unlisted'))
    or _event_row.created_by = auth.uid()
    or _is_host
    or _is_invited
    or public.has_role(auth.uid(), 'admin')
  ) then
    return;
  end if;

  select * into _venue_row from public.venues where id = _event_row.venue_id;
  if not found then return; end if;

  if _venue_row.kind = 'private_residence' then
    if not (_is_host or _is_going) then return; end if;
    if not exists (
      select 1 from public.event_hosts h
      where h.event_id = _event and h.user_id = _venue_row.created_by
    ) then return; end if;
  end if;

  return query select
    _venue_row.name,
    _venue_row.address_line1,
    _venue_row.address_line2,
    _venue_row.city,
    _venue_row.region,
    _venue_row.postal_code,
    case when _is_host or _is_going then _venue_row.access_notes else null end,
    _venue_row.website,
    _venue_row.lat,
    _venue_row.lng,
    _venue_row.google_place_id;
end $$;

revoke all on function public.event_venue_details(uuid) from public;
grant execute on function public.event_venue_details(uuid) to anon, authenticated;

-- ---------- considerations ----------
-- Hosts receive only the aggregate digest RPC, never another user's raw rows.
drop policy "hosts see shared considerations" on public.user_considerations;

-- ---------- seat counts ----------
-- The original owner-created view bypassed underlying RLS. Remove API access and
-- replace it with a function that authorizes the requested event first.
revoke all on public.event_seat_counts from anon, authenticated;

create or replace function public.event_seat_count(_event uuid)
returns table (event_id uuid, seats_taken bigint, seats_left bigint)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare _event_row public.events;
begin
  select * into _event_row from public.events where id = _event;
  if not found then return; end if;

  if not (
    (_event_row.status in ('published', 'cancelled', 'completed') and _event_row.visibility in ('public', 'unlisted'))
    or _event_row.created_by = auth.uid()
    or exists (select 1 from public.event_hosts h where h.event_id = _event and h.user_id = auth.uid())
    or exists (select 1 from public.event_invites i where i.event_id = _event and i.claimed_by = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  ) then
    return;
  end if;

  return query
  select _event,
         coalesce(sum(r.seats_claimed) filter (where r.status = 'going'), 0)::bigint,
         case when _event_row.seat_limit is null then null
              else (_event_row.seat_limit - coalesce(sum(r.seats_claimed) filter (where r.status = 'going'), 0))::bigint
         end
  from public.rsvps r
  where r.event_id = _event;
end $$;

revoke all on function public.event_seat_count(uuid) from public;
grant execute on function public.event_seat_count(uuid) to anon, authenticated;

create or replace function public.event_seat_counts_for(_events uuid[])
returns table (event_id uuid, seats_taken bigint, seats_left bigint)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(cardinality(_events), 0) > 200 then
    raise exception 'too many events requested';
  end if;

  return query
  select e.id,
         coalesce(sum(r.seats_claimed) filter (where r.status = 'going'), 0)::bigint,
         case when e.seat_limit is null then null
              else (e.seat_limit - coalesce(sum(r.seats_claimed) filter (where r.status = 'going'), 0))::bigint
         end
  from public.events e
  left join public.rsvps r on r.event_id = e.id
  where e.id = any(_events)
    and (
      (e.status in ('published', 'cancelled', 'completed') and e.visibility in ('public', 'unlisted'))
      or e.created_by = auth.uid()
      or exists (select 1 from public.event_hosts h where h.event_id = e.id and h.user_id = auth.uid())
      or exists (select 1 from public.event_invites i where i.event_id = e.id and i.claimed_by = auth.uid())
      or public.has_role(auth.uid(), 'admin')
    )
  group by e.id;
end $$;

revoke all on function public.event_seat_counts_for(uuid[]) from public;
grant execute on function public.event_seat_counts_for(uuid[]) to anon, authenticated;

-- ---------- RSVP authorization ----------
create or replace function public.rsvp_to_event(_event uuid, _seats smallint default 1)
returns public.rsvps
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  _event_row public.events;
  _taken int;
  _row public.rsvps;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if _seats < 1 or _seats > 6 then raise exception 'invalid seat count'; end if;

  select * into _event_row from public.events where id = _event for update;
  if not found then raise exception 'event not found'; end if;
  if _event_row.status <> 'published' or _event_row.deleted_at is not null then
    raise exception 'event is not open for RSVP';
  end if;
  if _event_row.rsvp_opens_at is not null and now() < _event_row.rsvp_opens_at then
    raise exception 'RSVPs are not open yet';
  end if;
  if _event_row.rsvp_closes_at is not null and now() > _event_row.rsvp_closes_at then
    raise exception 'RSVPs are closed';
  end if;
  if _seats > 1 and not _event_row.allow_plus_ones then
    raise exception 'plus ones are not enabled for this event';
  end if;
  if _event_row.visibility = 'invite_only'
     and not exists (
       select 1 from public.event_invites i
       where i.event_id = _event and i.claimed_by = auth.uid()
     )
     and not exists (
       select 1 from public.event_hosts h where h.event_id = _event and h.user_id = auth.uid()
     )
     and not public.has_role(auth.uid(), 'admin') then
    raise exception 'an accepted invitation is required';
  end if;

  select coalesce(sum(seats_claimed), 0) into _taken
  from public.rsvps where event_id = _event and status = 'going';

  if _event_row.seat_limit is not null
     and _taken + _seats > _event_row.seat_limit
     and not _event_row.allow_waitlist then
    raise exception 'event is full';
  end if;

  insert into public.rsvps (event_id, user_id, seats_claimed, status)
  values (
    _event,
    auth.uid(),
    _seats,
    case when _event_row.seat_limit is null or _taken + _seats <= _event_row.seat_limit
         then 'going'::public.rsvp_status else 'waitlist'::public.rsvp_status end
  )
  on conflict (event_id, user_id) do update
    set seats_claimed = excluded.seats_claimed,
        status = excluded.status,
        cancelled_at = null,
        updated_at = now()
  returning * into _row;

  return _row;
end $$;

-- An invite claim must always be associated with an authenticated account.
create or replace function public.claim_event_invite(_token text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare _invite public.event_invites;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into _invite from public.event_invites
  where token = _token and (expires_at is null or expires_at > now())
  for update;

  if _invite.id is null then raise exception 'invite not found or expired'; end if;
  if _invite.claimed_by is not null and _invite.claimed_by <> auth.uid() then
    raise exception 'invite already claimed';
  end if;

  update public.event_invites set claimed_by = auth.uid() where id = _invite.id;
  return (select slug from public.events where id = _invite.event_id);
end $$;

-- ---------- public attendee privacy ----------
-- Counts remain public, but attendee names require a signed-in account that can
-- read the event.
revoke all on function public.event_attendee_names(uuid) from public;
grant execute on function public.event_attendee_names(uuid) to authenticated;

-- ---------- function execution and search-path hardening ----------
create or replace function public.has_role(_user uuid, _role public.app_role)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select _user = auth.uid()
     and exists (
       select 1 from public.user_roles where user_id = _user and role = _role
     );
$$;

revoke all on function public.rsvp_to_event(uuid, smallint) from public;
revoke all on function public.cancel_rsvp(uuid) from public;
revoke all on function public.add_cohost(uuid, extensions.citext) from public;
revoke all on function public.remove_cohost(uuid, uuid) from public;
revoke all on function public.preview_invite(text) from public;
revoke all on function public.claim_event_invite(text) from public;
revoke all on function public.event_considerations_digest(uuid) from public;
revoke all on function public.get_my_ics_feed(text) from public;
revoke all on function public.cancel_event(uuid, text) from public;
revoke all on function public.set_checkin(uuid, uuid, boolean) from public;
revoke all on function public.set_no_show(uuid, uuid, boolean) from public;
revoke all on function public.complete_event(uuid) from public;
revoke all on function public.grant_role(uuid, public.app_role) from public;
revoke all on function public.revoke_role(uuid, public.app_role) from public;
revoke all on function public.has_role(uuid, public.app_role) from public;
revoke all on function public.is_event_host(uuid) from public;

grant execute on function public.rsvp_to_event(uuid, smallint) to authenticated;
grant execute on function public.cancel_rsvp(uuid) to authenticated;
grant execute on function public.add_cohost(uuid, extensions.citext) to authenticated;
grant execute on function public.remove_cohost(uuid, uuid) to authenticated;
grant execute on function public.preview_invite(text) to anon, authenticated;
grant execute on function public.claim_event_invite(text) to authenticated;
grant execute on function public.event_considerations_digest(uuid) to authenticated;
grant execute on function public.get_my_ics_feed(text) to anon;
grant execute on function public.cancel_event(uuid, text) to authenticated;
grant execute on function public.set_checkin(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_no_show(uuid, uuid, boolean) to authenticated;
grant execute on function public.complete_event(uuid) to authenticated;
grant execute on function public.grant_role(uuid, public.app_role) to authenticated;
grant execute on function public.revoke_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to anon, authenticated;
grant execute on function public.is_event_host(uuid) to anon, authenticated;

-- Trigger functions do not need Data API execution privileges.
revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_event() from public;
revoke all on function public.sync_event_location() from public;
revoke all on function public.promote_waitlist() from public;

alter function public.has_role(uuid, public.app_role) set search_path = public, pg_temp;
alter function public.is_event_host(uuid) set search_path = public, pg_temp;
alter function public.cancel_rsvp(uuid) set search_path = public, pg_temp;
alter function public.add_cohost(uuid, extensions.citext) set search_path = public, pg_temp;
alter function public.remove_cohost(uuid, uuid) set search_path = public, pg_temp;
alter function public.preview_invite(text) set search_path = public, pg_temp;
alter function public.event_considerations_digest(uuid) set search_path = public, pg_temp;
alter function public.get_my_ics_feed(text) set search_path = public, pg_temp;
alter function public.cancel_event(uuid, text) set search_path = public, pg_temp;
alter function public.set_checkin(uuid, uuid, boolean) set search_path = public, pg_temp;
alter function public.set_no_show(uuid, uuid, boolean) set search_path = public, pg_temp;
alter function public.complete_event(uuid) set search_path = public, pg_temp;
alter function public.grant_role(uuid, public.app_role) set search_path = public, pg_temp;
alter function public.revoke_role(uuid, public.app_role) set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.handle_new_event() set search_path = public, pg_temp;
alter function public.sync_event_location() set search_path = public, pg_temp;
alter function public.promote_waitlist() set search_path = public, pg_temp;
alter function public.event_attendee_names(uuid) set search_path = public, pg_temp;
alter function public.set_event_featured_games(uuid, jsonb) set search_path = public, pg_temp;
alter function public.disable_event_featured_games(uuid) set search_path = public, pg_temp;
