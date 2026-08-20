import Link from 'next/link';
import { CalendarDays, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatEventTime } from '@/lib/dates';
import { PageShell } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { EventBrowser } from '@/components/event-browser';

export default async function EventsPage() {
  const supabase = await createClient();
  const { data: events } = await supabase
    .from('events')
    .select('id, slug, title, starts_at, timezone, location_label, city, seat_limit, approx_lat, approx_lng')
    .eq('status', 'published')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });

  const eventIds = (events || []).map((event) => event.id);
  const { data: seatCounts } = eventIds.length
    ? await supabase.from('event_seat_counts').select('event_id, seats_left').in('event_id', eventIds)
    : { data: [] };
  const seatsByEvent = new Map((seatCounts || []).map((row) => [row.event_id, row.seats_left]));
  const browserEvents = (events || []).map((event) => ({
    ...event,
    seats_left: seatsByEvent.get(event.id) ?? event.seat_limit,
    formatted_time: formatEventTime(event.starts_at, event.timezone),
  }));

  return (
    <PageShell size="2xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold text-foreground">Upcoming events</h1>
        <div className="flex items-center gap-2">
          <Button nativeButton={false} variant="outline" render={<Link href="/events/calendar" />}>
            <CalendarDays />
            Calendar
          </Button>
          <Button nativeButton={false} render={<Link href="/events/new" />}>
            <Plus />
            Host an event
          </Button>
        </div>
      </div>

      <EventBrowser events={browserEvents} />
    </PageShell>
  );
}
