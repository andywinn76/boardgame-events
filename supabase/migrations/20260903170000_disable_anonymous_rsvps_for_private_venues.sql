-- Account-free attendees cannot safely recover private address access on a
-- different browser, so private residences require registered accounts.

create or replace function public.enforce_private_venue_rsvp_privacy()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.allow_anonymous_rsvps and new.venue_id is not null and exists (
    select 1 from public.venues v
    where v.id = new.venue_id and v.kind = 'private_residence'
  ) then
    new.allow_anonymous_rsvps := false;
  end if;
  return new;
end;
$$;

create trigger events_enforce_private_venue_rsvp_privacy
  before insert or update of venue_id, allow_anonymous_rsvps on public.events
  for each row execute function public.enforce_private_venue_rsvp_privacy();

create or replace function public.disable_anonymous_rsvps_when_venue_becomes_private()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.kind = 'private_residence' and old.kind is distinct from new.kind then
    update public.events set allow_anonymous_rsvps = false
    where venue_id = new.id and allow_anonymous_rsvps;
  end if;
  return null;
end;
$$;

create trigger venues_disable_anonymous_rsvps_when_private
  after update of kind on public.venues
  for each row execute function public.disable_anonymous_rsvps_when_venue_becomes_private();

update public.events e
set allow_anonymous_rsvps = false
where e.allow_anonymous_rsvps
  and exists (
    select 1 from public.venues v
    where v.id = e.venue_id and v.kind = 'private_residence'
  );
