-- Add an organizer marker without exposing the creator's user ID to clients.
drop function if exists public.event_attendee_names(uuid);

create function public.event_attendee_names(_event uuid)
returns table (attendee_name text, is_organizer boolean)
language sql
stable
security definer
set search_path = public
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
    and (
      (e.status in ('published', 'cancelled', 'completed') and e.visibility in ('public', 'unlisted'))
      or e.created_by = auth.uid()
      or public.is_event_host(e.id)
      or exists (
        select 1
        from public.event_invites i
        where i.event_id = e.id and i.claimed_by = auth.uid()
      )
      or public.has_role(auth.uid(), 'admin')
    )
  order by is_organizer desc, attendee_name;
$$;

revoke all on function public.event_attendee_names(uuid) from public;
grant execute on function public.event_attendee_names(uuid) to anon, authenticated;
