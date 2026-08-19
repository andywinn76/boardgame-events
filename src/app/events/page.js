import Link from 'next/link';
import { CalendarDays, Plus, MapPin, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatEventTime } from '@/lib/dates';
import { PageShell } from '@/components/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function EventsPage() {
  const supabase = await createClient();
  const { data: events } = await supabase
    .from('events')
    .select('id, slug, title, starts_at, timezone, location_label, city, seat_limit')
    .eq('status', 'published')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });

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

      {!events?.length ? (
        <Card className="items-center px-6 py-10 text-center">
          <p className="text-muted-foreground">
            No upcoming events yet.{' '}
            <Link href="/events/new" className="font-medium text-foreground underline underline-offset-2">
              Host the first one
            </Link>
            .
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <Card className="transition-colors hover:border-primary/40">
                <Link href={`/events/${event.slug}`} className="block px-(--card-spacing)">
                  <p className="font-heading text-lg font-semibold text-foreground">{event.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{formatEventTime(event.starts_at, event.timezone)}</p>
                  {(event.location_label || event.city) && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      {[event.location_label, event.city].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {event.seat_limit && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/80">
                      <Users className="size-3.5 shrink-0" />
                      {event.seat_limit} seats
                    </p>
                  )}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
