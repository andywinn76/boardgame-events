-- Expose only a privacy-conscious display name for confirmed attendees. Keep the
-- underlying RSVP roster protected by its existing RLS policies.
create or replace function public.event_attendee_names(_event uuid)
returns table (attendee_name text)
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
    ) || coalesce(' ' || left(nullif(btrim(p.last_name), ''), 1) || '.', '') as attendee_name
  from public.rsvps r
  join public.profiles p on p.id = r.user_id
  where r.event_id = _event
    and r.status = 'going'
    and exists (
      select 1
      from public.events e
      where e.id = _event
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
    )
  order by attendee_name;
$$;

revoke all on function public.event_attendee_names(uuid) from public;
grant execute on function public.event_attendee_names(uuid) to anon, authenticated;
