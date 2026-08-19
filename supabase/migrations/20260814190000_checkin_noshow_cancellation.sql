-- Step 8: check-in, no-shows, cancellation.
-- docs/architecture.md section 2 ("Attendance and no-shows" / "Cancellation").
--
-- The nightly job the doc describes (auto-complete past events, mark un-checked-in
-- goers as no-show) would need real scheduling infra (pg_cron or an Edge Function
-- cron trigger) that this project doesn't have yet. Rather than take on that
-- infrastructure decision silently, complete_event() below does the same logic
-- host-triggered instead of time-triggered -- a "mark this event completed" button
-- in the console. Swapping in real scheduling later is additive, not a rewrite.

alter table rsvps add column checked_in_at timestamptz;
alter table rsvps add column no_show boolean not null default false;

-- ---------- cancellation ----------
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
   where r.event_id = _event and r.status in ('going', 'waitlist', 'maybe');
end $$;

-- ---------- check-in / no-show ----------
create or replace function public.set_checkin(_event uuid, _user uuid, _checked_in boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from event_hosts where event_id = _event and user_id = auth.uid())
     and not has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  update rsvps
     set checked_in_at = case when _checked_in then now() else null end,
         updated_at = now()
   where event_id = _event and user_id = _user;
end $$;

create or replace function public.set_no_show(_event uuid, _user uuid, _no_show boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from event_hosts where event_id = _event and user_id = auth.uid())
     and not has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  update rsvps
     set no_show = _no_show, updated_at = now()
   where event_id = _event and user_id = _user;
end $$;

-- host-triggered stand-in for the nightly job: completes the event, and only
-- marks un-checked-in 'going' RSVPs as no-show if at least one attendee WAS
-- checked in (a host who never used check-in shouldn't have it silently flag
-- their entire roster as no-shows).
create or replace function public.complete_event(_event uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _any_checked_in boolean;
begin
  if not exists (select 1 from event_hosts where event_id = _event and user_id = auth.uid())
     and not has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  select exists (
    select 1 from rsvps where event_id = _event and status = 'going' and checked_in_at is not null
  ) into _any_checked_in;

  if _any_checked_in then
    update rsvps
       set no_show = true, updated_at = now()
     where event_id = _event and status = 'going' and checked_in_at is null;
  end if;

  update events set status = 'completed', updated_at = now() where id = _event;
end $$;

-- ---------- reliability ----------
-- security_invoker makes this obey the caller's own rsvps RLS: a host querying it
-- only ever sees the slice of an attendee's history that overlaps events they
-- themselves host, never that attendee's full cross-host record. Host console only
-- ever renders this as a quiet per-attendee badge, never a public score.
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

grant select on public.attendee_reliability to authenticated;
