-- Cancelling or completing an event made its detail page vanish for everyone
-- except hosts: the events SELECT policy's public-visibility branch only ever
-- matched status = 'published'. docs/architecture.md is explicit that cancelled
-- events should still render (greyed, reason shown) and only be filtered out of
-- listings/calendar by querying status = 'published' there -- not by hiding the
-- detail page itself. Listing and calendar queries already filter on status, so
-- broadening this doesn't bring cancelled/completed events back into browse views.
drop policy "read published, own, hosted, or invited" on events;

create policy "read published, own, hosted, or invited" on events for select using (
  (status in ('published', 'cancelled', 'completed') and visibility in ('public', 'unlisted'))
  or created_by = auth.uid()
  or exists (select 1 from event_hosts h where h.event_id = id and h.user_id = auth.uid())
  or exists (select 1 from event_invites i where i.event_id = id and i.claimed_by = auth.uid())
  or has_role(auth.uid(), 'admin')
);
