create or replace function public.disable_event_featured_games(_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_event_host(_event) and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only an event host can update featured games';
  end if;

  delete from public.event_games where event_id = _event;

  update public.events
  set featured_games_enabled = false
  where id = _event;
end;
$$;

revoke all on function public.disable_event_featured_games(uuid) from public;
grant execute on function public.disable_event_featured_games(uuid) to authenticated;
