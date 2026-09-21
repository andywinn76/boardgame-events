-- Let anyone who can browse a public or unlisted event see the privacy-conscious
-- names of registered confirmed attendees before RSVPing. Account-free RSVP names
-- remain limited to hosts and confirmed attendees through the existing roster RPCs.

create or replace function public.public_event_registered_attendee_names(_event uuid)
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
    and r.user_id is not null
    and r.status = 'going'
    and e.status in ('published', 'cancelled', 'completed')
    and e.visibility in ('public', 'unlisted')
  order by is_organizer desc, attendee_name;
$$;

revoke all on function public.public_event_registered_attendee_names(uuid) from public;
grant execute on function public.public_event_registered_attendee_names(uuid) to anon, authenticated;
