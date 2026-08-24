-- Keep exact venue details, attendee identities, and event messages limited to
-- event hosts and confirmed attendees while public event summaries remain
-- available to signed-out visitors.

drop policy if exists "public venues readable" on public.venues;
drop policy if exists "residence readable by confirmed participants" on public.venues;

create policy "event venues readable by hosts and confirmed attendees"
on public.venues for select using (
  exists (
    select 1
    from public.events e
    where e.venue_id = venues.id
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

  _is_host := exists (
    select 1 from public.event_hosts h where h.event_id = _event and h.user_id = auth.uid()
  );
  _is_going := exists (
    select 1 from public.rsvps r
    where r.event_id = _event and r.user_id = auth.uid() and r.status = 'going'
  );

  if not (_is_host or _is_going) then return; end if;

  select * into _venue_row from public.venues where id = _event_row.venue_id;
  if not found then return; end if;

  if _venue_row.kind = 'private_residence' and not exists (
    select 1 from public.event_hosts h
    where h.event_id = _event and h.user_id = _venue_row.created_by
  ) then
    return;
  end if;

  return query select
    _venue_row.name,
    _venue_row.address_line1,
    _venue_row.address_line2,
    _venue_row.city,
    _venue_row.region,
    _venue_row.postal_code,
    _venue_row.access_notes,
    _venue_row.website,
    _venue_row.lat,
    _venue_row.lng,
    _venue_row.google_place_id;
end;
$$;

revoke all on function public.event_venue_details(uuid) from public;
grant execute on function public.event_venue_details(uuid) to anon, authenticated;

create or replace function public.event_attendee_names(_event uuid)
returns table (attendee_name text, is_organizer boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(
      nullif(btrim(p.first_name), ''),
      nullif(split_part(btrim(p.display_name), ' ', 1), ''),
      p.username,
      'A member'
    ) || coalesce(' ' || left(nullif(btrim(p.last_name), ''), 1) || '.', '') as attendee_name,
    r.user_id = e.created_by as is_organizer
  from public.rsvps r
  join public.profiles p on p.id = r.user_id
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

drop policy if exists "roster reads messages" on public.event_messages;
drop policy if exists "roster posts messages" on public.event_messages;

create policy "hosts and confirmed attendees read messages"
on public.event_messages for select using (
  exists (
    select 1 from public.event_hosts h
    where h.event_id = event_messages.event_id and h.user_id = auth.uid()
  )
  or exists (
    select 1 from public.rsvps r
    where r.event_id = event_messages.event_id
      and r.user_id = auth.uid()
      and r.status = 'going'
  )
);

create policy "hosts and confirmed attendees post messages"
on public.event_messages for insert with check (
  user_id = auth.uid()
  and (
    exists (
      select 1 from public.event_hosts h
      where h.event_id = event_messages.event_id and h.user_id = auth.uid()
    )
    or exists (
      select 1 from public.rsvps r
      where r.event_id = event_messages.event_id
        and r.user_id = auth.uid()
        and r.status = 'going'
    )
  )
);
