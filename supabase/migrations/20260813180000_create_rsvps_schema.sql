-- Step 3: RSVP RPC, seat counts, waitlist + promotion trigger.
-- docs/architecture.md section 2 ("Seat counting" / "Waitlist auto-promotion").
-- notifications table doesn't exist yet (build order step 7), so promote_waitlist
-- only flips status here — no notification row is inserted until that lands.

create type rsvp_status as enum ('going','waitlist','maybe','declined','cancelled');

create table rsvps (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  status        rsvp_status not null default 'going',
  seats_claimed smallint not null default 1 check (seats_claimed between 1 and 6),
  waitlist_pos  int,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (event_id, user_id)
);
create index on rsvps (event_id, status);
create index on rsvps (user_id);

create trigger rsvps_set_updated_at
  before update on rsvps
  for each row execute function public.set_updated_at();

-- ---------- seat counting ----------
create view event_seat_counts as
select e.id as event_id,
       e.seat_limit,
       coalesce(sum(r.seats_claimed) filter (where r.status = 'going'), 0) as seats_taken,
       case when e.seat_limit is null then null
            else e.seat_limit - coalesce(sum(r.seats_claimed) filter (where r.status = 'going'), 0)
       end as seats_left
from events e
left join rsvps r on r.event_id = e.id
group by e.id;

-- ---------- RSVP RPC ----------
-- Row-locks the event so two people can't take the last seat at once; a direct
-- client insert into rsvps can't provide that lock, which is why this is an RPC
-- (CLAUDE.md architecture rule 3).
create or replace function public.rsvp_to_event(_event uuid, _seats smallint default 1)
returns rsvps language plpgsql security definer set search_path = public as $$
declare
  _limit int;
  _allow_waitlist boolean;
  _status event_status;
  _taken int;
  _row rsvps;
begin
  select seat_limit, allow_waitlist, status into _limit, _allow_waitlist, _status
    from events where id = _event for update;

  if not found then
    raise exception 'event not found';
  end if;
  if _status <> 'published' then
    raise exception 'event is not open for rsvp';
  end if;

  select coalesce(sum(seats_claimed), 0) into _taken
    from rsvps where event_id = _event and status = 'going';

  if _limit is not null and _taken + _seats > _limit and not _allow_waitlist then
    raise exception 'event is full';
  end if;

  insert into rsvps (event_id, user_id, seats_claimed, status)
  values (_event, auth.uid(), _seats,
          case when _limit is null or _taken + _seats <= _limit
               then 'going'::rsvp_status else 'waitlist'::rsvp_status end)
  on conflict (event_id, user_id)
    do update set seats_claimed = excluded.seats_claimed,
                  status        = excluded.status,
                  cancelled_at  = null,
                  updated_at    = now()
  returning * into _row;

  return _row;
end $$;

create or replace function public.cancel_rsvp(_event uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update rsvps
     set status = 'cancelled', cancelled_at = now(), updated_at = now()
   where event_id = _event and user_id = auth.uid()
     and status in ('going', 'waitlist', 'maybe');
end $$;

-- ---------- waitlist auto-promotion ----------
-- Covers every way a seat frees up: an attendee cancels, or a host raises
-- seat_limit. (Host-initiated removal of someone else's RSVP lands with the
-- host console in build order step 7.)
create or replace function public.promote_waitlist()
returns trigger language plpgsql security definer set search_path = public as $$
declare _event uuid; _limit int; _taken int; _cand rsvps;
begin
  if pg_trigger_depth() > 1 then return null; end if;   -- our own update re-fires this

  if tg_table_name = 'events' then
    _event := new.id;
  elsif tg_op = 'DELETE' then
    _event := old.event_id;
  else
    _event := new.event_id;
  end if;

  select seat_limit into _limit from events where id = _event for update;
  if _limit is null then return null; end if;            -- unlimited, nothing to promote into

  loop
    select coalesce(sum(seats_claimed), 0) into _taken
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
  end loop;

  return null;   -- AFTER trigger, return value ignored
end $$;

create trigger rsvps_promote_waitlist
  after update of status or delete on rsvps
  for each row execute function public.promote_waitlist();

create trigger events_promote_waitlist
  after update of seat_limit on events
  for each row execute function public.promote_waitlist();

-- ---------- RLS ----------
alter table rsvps enable row level security;

-- narrow on purpose: writes go through rsvp_to_event()/cancel_rsvp() only (both
-- security definer), never a direct client insert/update. Broadened for host
-- roster visibility when the host console lands in build order step 7.
create policy "users read own rsvps" on rsvps for select using (
  user_id = auth.uid()
);

-- ---------- grants ----------
grant select on public.rsvps to authenticated;
grant select on public.event_seat_counts to anon, authenticated;
