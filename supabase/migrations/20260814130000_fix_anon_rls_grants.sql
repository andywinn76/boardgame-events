-- Anonymous browsing was broken: the events "read published or own" policy (step 2)
-- and the venues "residence readable by hosts and attendees" policy (step 4) both
-- reference event_hosts/rsvps inside an EXISTS subquery. Postgres requires table-level
-- SELECT on every table referenced anywhere in a combined RLS USING expression for the
-- querying role -- even when RLS would always filter those rows to zero for anon --
-- because the permission check happens at query-rewrite time, not per-row at runtime.
-- Only `authenticated` had these grants, so anon got "permission denied for table
-- event_hosts" on plain published-event/public-venue reads.
--
-- Safe to grant: neither table has a SELECT policy that matches anon (both key off
-- auth.uid(), which is null for anon), so this doesn't expose any row anon couldn't
-- already reason about.

grant select on public.event_hosts to anon;
grant select on public.rsvps to anon;
