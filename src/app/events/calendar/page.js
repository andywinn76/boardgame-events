import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatInTimeZone } from 'date-fns-tz';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  format,
  parse,
  isSameMonth,
  isToday,
} from 'date-fns';
import { PageShell } from '@/components/page-shell';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function CalendarPage({ searchParams }) {
  const { month: monthParam } = await searchParams;
  const supabase = await createClient();

  const monthDate = monthParam ? parse(monthParam, 'yyyy-MM', new Date()) : new Date();
  const monthStart = startOfMonth(monthDate);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(endOfMonth(monthStart));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const { data: events } = await supabase
    .from('events')
    .select('id, slug, title, starts_at, timezone')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('starts_at', gridStart.toISOString())
    .lte('starts_at', gridEnd.toISOString())
    .order('starts_at', { ascending: true });

  // Grouped by each event's own local calendar day -- a 7pm game night in Denver
  // belongs on that Denver date, not whatever date it'd be for the viewer.
  const eventsByDay = new Map();
  for (const event of events || []) {
    const key = formatInTimeZone(new Date(event.starts_at), event.timezone, 'yyyy-MM-dd');
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key).push(event);
  }

  const prevMonth = format(subMonths(monthStart, 1), 'yyyy-MM');
  const nextMonth = format(addMonths(monthStart, 1), 'yyyy-MM');

  return (
    <PageShell size="3xl">
      <div className="flex items-center justify-between">
        <Link href={`/events/calendar?month=${prevMonth}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          <ChevronLeft />
          Prev
        </Link>
        <h1 className="font-heading text-2xl font-bold text-foreground">{format(monthStart, 'MMMM yyyy')}</h1>
        <Link href={`/events/calendar?month=${nextMonth}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          Next
          <ChevronRight />
        </Link>
      </div>

      <Card className="overflow-hidden py-0">
        <div className="grid grid-cols-7 gap-px overflow-hidden bg-border text-xs">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="bg-muted p-2 text-center font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDay.get(key) || [];
            return (
              <div
                key={key}
                className={cn('min-h-24 bg-card p-1.5', !isSameMonth(day, monthStart) && 'opacity-40')}
              >
                <p className={cn('text-right', isToday(day) ? 'font-bold text-primary' : 'text-muted-foreground')}>
                  {format(day, 'd')}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {dayEvents.map((event) => (
                    <li key={event.id}>
                      <Link
                        href={`/events/${event.slug}`}
                        className="block truncate rounded-md bg-secondary px-1 py-0.5 text-secondary-foreground hover:bg-primary hover:text-primary-foreground"
                      >
                        {formatInTimeZone(new Date(event.starts_at), event.timezone, 'h:mma')} {event.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>
    </PageShell>
  );
}
