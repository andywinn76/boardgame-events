import Link from 'next/link';
import { CalendarDays, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatEventTime } from '@/lib/dates';
import { PageShell } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { EventBrowser } from '@/components/event-browser';

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: hostRows } = user
    ? await supabase.from('event_hosts').select('event_id').eq('user_id', user.id)
    : { data: [] };
  const myHostRows = hostRows || [];
  const hostedEventIds = myHostRows.map((hostRow) => hostRow.event_id);

  let eventsQuery = supabase
    .from('events')
    .select('id, slug, title, starts_at, timezone, location_label, city, region, seat_limit, approx_lat, approx_lng, visibility')
    .eq('status', 'published')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });

  eventsQuery = hostedEventIds.length
    ? eventsQuery.or(`visibility.eq.public,id.in.(${hostedEventIds.join(',')})`)
    : eventsQuery.eq('visibility', 'public');

  const { data: events } = await eventsQuery;

  const eventIds = (events || []).map((event) => event.id);
  const { data: seatCounts } = eventIds.length
    ? await supabase.rpc('event_seat_counts_for', { _events: eventIds })
    : { data: [] };
  let myRsvps = [];

  if (user && eventIds.length) {
    const { data: rsvps } = await supabase
      .from('rsvps')
      .select('event_id, status')
      .eq('user_id', user.id)
      .in('event_id', eventIds);
    myRsvps = rsvps || [];
  }

  const seatsByEvent = new Map((seatCounts || []).map((row) => [row.event_id, row]));
  const rsvpByEvent = new Map(myRsvps.map((rsvp) => [rsvp.event_id, rsvp.status]));
  const hostedEventIdSet = new Set(hostedEventIds);
  const browserEvents = (events || []).map((event) => ({
    ...event,
    seats_left: seatsByEvent.get(event.id)?.seats_left ?? event.seat_limit,
    seats_taken: seatsByEvent.get(event.id)?.seats_taken ?? 0,
    formatted_time: formatEventTime(event.starts_at, event.timezone),
    involvement: hostedEventIdSet.has(event.id)
      ? 'hosting'
      : rsvpByEvent.get(event.id) === 'going'
        ? 'attending'
        : rsvpByEvent.get(event.id) === 'waitlist'
          ? 'waitlisted'
          : null,
  }));

  return (
    <PageShell size="2xl">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-3xl font-bold text-foreground">Upcoming Events</h1>
        <div className="flex items-center gap-2">
          <Button nativeButton={false} variant="outline" render={<Link href="/events/calendar" />}>
            <CalendarDays />
            Calendar
          </Button>
          <Button
            nativeButton={false}
            render={<Link href={user ? '/events/new' : '/login?next=%2Fevents%2Fnew&reason=host'} />}
          >
            <Plus />
            Host an event
          </Button>
        </div>
      </div>

      <EventBrowser events={browserEvents} showInvolvementFilters={Boolean(user)} />
    </PageShell>
  );
}
