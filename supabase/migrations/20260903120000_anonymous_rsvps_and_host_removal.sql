-- Let hosts opt into account-free RSVPs while keeping capacity checks and host
-- moderation inside security-definer functions.

alter table public.events
  add column allow_anonymous_rsvps boolean not null default false;

alter table public.rsvps
  alter column user_id drop not null,
  add column guest_first_name text,
  add column guest_last_initial text;

alter table public.rsvps
  add constraint rsvps_identity_check check (
    (user_id is not null and guest_first_name is null and guest_last_initial is null)
    or
    (
      user_id is null
      and guest_first_name is not null
      and guest_first_name = btrim(guest_first_name)
      and char_length(guest_first_name) between 1 and 40
      and guest_last_initial ~ '^[A-Z]$'
    )
  );

create unique index rsvps_unique_anonymous_name_per_event
  on public.rsvps (event_id, lower(guest_first_name), guest_last_initial)
  where user_id is null and status in ('going', 'waitlist', 'maybe');

grant update (allow_anonymous_rsvps) on public.events to authenticated;

create or replace function public.anonymous_rsvp_to_event(
  _event uuid,
  _first_name text,
  _last_initial text
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
  from public.rsvps
  where event_id = _event and status = 'going';

  if _event_row.seat_limit is not null
     and _taken + 1 > _event_row.seat_limit
     and not _event_row.allow_waitlist then
    raise exception 'event is full';
  end if;

  insert into public.rsvps (
    event_id, user_id, guest_first_name, guest_last_initial, seats_claimed, status
  ) values (
    _event, null, _clean_first_name, _clean_last_initial, 1,
    case
      when _event_row.seat_limit is null or _taken + 1 <= _event_row.seat_limit
        then 'going'::public.rsvp_status
      else 'waitlist'::public.rsvp_status
    end
  )
  returning * into _row;

  return _row;
exception
  when unique_violation then
    raise exception 'that guest name is already registered for this event';
end;
$$;

revoke all on function public.anonymous_rsvp_to_event(uuid, text, text) from public;
grant execute on function public.anonymous_rsvp_to_event(uuid, text, text) to anon;

create or replace function public.host_remove_rsvp(_event uuid, _rsvp uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_event_host(_event)
     and not public.has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  if exists (
    select 1
    from public.rsvps r
    join public.event_hosts h on h.event_id = r.event_id and h.user_id = r.user_id
    where r.id = _rsvp and r.event_id = _event
  ) then
    raise exception 'an organizer RSVP cannot be removed';
  end if;

  delete from public.rsvps
  where id = _rsvp and event_id = _event;

  if not found then raise exception 'RSVP not found'; end if;
end;
$$;

revoke all on function public.host_remove_rsvp(uuid, uuid) from public;
grant execute on function public.host_remove_rsvp(uuid, uuid) to authenticated;

create or replace function public.event_attendee_names(_event uuid)
returns table (attendee_name text, is_organizer boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case
      when r.user_id is null then r.guest_first_name || ' ' || r.guest_last_initial || '.'
      else coalesce(
        nullif(btrim(p.first_name), ''),
        nullif(split_part(btrim(p.display_name), ' ', 1), ''),
        p.username,
        'A member'
      ) || coalesce(' ' || left(nullif(btrim(p.last_name), ''), 1) || '.', '')
    end as attendee_name,
    r.user_id = e.created_by as is_organizer
  from public.rsvps r
  left join public.profiles p on p.id = r.user_id
  join public.events e on e.id = r.event_id
  where r.event_id = _event
    and r.status = 'going'
    and auth.uid() is not null
    and (
      public.is_event_host(_event)
      or exists (
        select 1 from public.rsvps viewer_rsvp
        where viewer_rsvp.event_id = _event
          and viewer_rsvp.user_id = auth.uid()
          and viewer_rsvp.status = 'going'
      )
    )
  order by is_organizer desc, attendee_name;
$$;

revoke all on function public.event_attendee_names(uuid) from public;
grant execute on function public.event_attendee_names(uuid) to authenticated;

-- Existing notification functions now need to tolerate account-free rows.
create or replace function public.cancel_event(_event uuid, _reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_event_host(_event)
     and not public.has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  update public.events
     set status = 'cancelled', cancelled_at = now(),
         cancelled_by = auth.uid(), cancellation_reason = _reason, updated_at = now()
   where id = _event and status <> 'cancelled';

  insert into public.notifications (user_id, type, event_id, payload)
  select r.user_id, 'event_cancelled', _event, jsonb_build_object('reason', _reason)
    from public.rsvps r
   where r.event_id = _event
     and r.user_id is not null
     and r.status in ('going', 'waitlist', 'maybe');
end;
$$;

create or replace function public.promote_waitlist()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare _event uuid; _limit int; _taken int; _cand public.rsvps;
begin
  if pg_trigger_depth() > 1 then return null; end if;

  if tg_table_name = 'events' then
    _event := new.id;
  elsif tg_op = 'DELETE' then
    _event := old.event_id;
  else
    _event := new.event_id;
  end if;

  select seat_limit into _limit from public.events where id = _event for update;
  if _limit is null then return null; end if;

  loop
    select coalesce(sum(seats_claimed), 0) into _taken
      from public.rsvps where event_id = _event and status = 'going';

    select * into _cand from public.rsvps
      where event_id = _event and status = 'waitlist'
        and seats_claimed <= _limit - _taken
      order by created_at
      limit 1;

    exit when _cand.id is null;

    update public.rsvps
       set status = 'going', waitlist_pos = null, updated_at = now()
     where id = _cand.id;

    if _cand.user_id is not null then
      insert into public.notifications (user_id, type, event_id, payload)
      values (_cand.user_id, 'promoted_from_waitlist', _event,
              jsonb_build_object('seats', _cand.seats_claimed));
    end if;
  end loop;

  return null;
end;
$$;
