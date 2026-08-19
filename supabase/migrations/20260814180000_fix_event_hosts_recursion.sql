-- The "hosts read event roster" policy from the previous migration checks
-- membership by querying event_hosts from inside event_hosts' own USING clause.
-- Postgres re-applies the table's RLS policy to that inner reference too, and
-- since the policy references itself, that's unbounded recursion --
-- "infinite recursion detected in policy for relation event_hosts" on every
-- query that touches event_hosts (including indirectly, e.g. creating an event
-- and reading it back). Same fix as has_role(): a stable security-definer
-- function bypasses RLS for the membership check instead of re-triggering it.
create or replace function public.is_event_host(_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_hosts where event_id = _event and user_id = auth.uid());
$$;

drop policy "hosts read event roster" on event_hosts;

create policy "hosts read event roster" on event_hosts for select using (
  user_id = auth.uid()
  or is_event_host(event_hosts.event_id)
  or has_role(auth.uid(), 'admin')
);
