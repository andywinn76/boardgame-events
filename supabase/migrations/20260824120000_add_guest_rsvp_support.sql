-- Expose the existing plus-one schema safely in the app. RSVP changes replace
-- the caller's previous seat claim instead of counting old and new seats twice.
alter table public.events
  add column max_guests_per_rsvp smallint not null default 1
  check (max_guests_per_rsvp between 1 and 10);

alter table public.rsvps drop constraint if exists rsvps_seats_claimed_check;
alter table public.rsvps
  add constraint rsvps_seats_claimed_check check (seats_claimed between 1 and 11);

grant update (max_guests_per_rsvp) on public.events to authenticated;

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
  if _seats < 1 or _seats > 11 then raise exception 'invalid seat count'; end if;

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
  if _seats > 1 then
    if _event_row.allow_plus_ones and _seats - 1 > _event_row.max_guests_per_rsvp then
      raise exception 'guest count exceeds the limit for this event';
    elsif not _event_row.allow_plus_ones
       and not exists (
         select 1 from public.rsvps r
         where r.event_id = _event
           and r.user_id = auth.uid()
           and r.seats_claimed >= _seats
           and r.status in ('going', 'waitlist')
       ) then
      raise exception 'guests are not enabled for this event';
    end if;
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
  from public.rsvps
  where event_id = _event
    and status = 'going'
    and user_id <> auth.uid();

  if _event_row.seat_limit is not null
     and _taken + _seats > _event_row.seat_limit
     and not _event_row.allow_waitlist then
    raise exception 'not enough seats are available';
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

revoke all on function public.rsvp_to_event(uuid, smallint) from public;
grant execute on function public.rsvp_to_event(uuid, smallint) to authenticated;

-- Reducing a confirmed guest count can open seats for a waiting RSVP.
drop trigger if exists rsvps_promote_waitlist on public.rsvps;
create trigger rsvps_promote_waitlist
  after update of status, seats_claimed or delete on public.rsvps
  for each row execute function public.promote_waitlist();
