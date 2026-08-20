import Link from 'next/link';
import Image from 'next/image';
import { CalendarDays, MapPin, Plus, Search, Sparkles, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatEventTime } from '@/lib/dates';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const EVENT_FIELDS = 'id, slug, title, starts_at, timezone, location_label, city, seat_limit';

function EventSummary({ event, showSeats = false }) {
  return (
    <li className="border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <Link href={`/events/${event.slug}`} className="font-heading font-semibold text-foreground hover:text-primary">
        {event.title}
      </Link>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarDays className="size-3.5" />
        {formatEventTime(event.starts_at, event.timezone, 'EEE, MMM d · h:mm a')}
      </p>
      {showSeats ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" />
          {event.seats_taken || 0} attending
          {event.seat_limit == null
            ? ' · Unlimited seats'
            : ` · ${Math.max(event.seat_limit - (event.seats_taken || 0), 0)} seats left`}
        </p>
      ) : (
        (event.location_label || event.city) && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5" />
            {[event.location_label, event.city].filter(Boolean).join(' · ')}
          </p>
        )
      )}
    </li>
  );
}

function EventSection({ title, events, emptyText, emptyAction, emptyHref, viewAllText, showSeats = false }) {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-baseline justify-between gap-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <span className="shrink-0 text-xs text-muted-foreground">
          {events.length} upcoming
        </span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {events.length > 0 ? (
          <>
            <ul className="flex-1">
              {events.map((event) => (
                <EventSummary key={event.id} event={event} showSeats={showSeats} />
              ))}
            </ul>
            <Link href="/events" className="mt-4 text-sm font-semibold text-primary hover:underline">
              {viewAllText} →
            </Link>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-muted-foreground">{emptyText}</p>
            <Link href={emptyHref} className="mt-2 text-sm font-semibold text-primary hover:underline">
              {emptyAction}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  let isAdmin = false;
  let attendingEvents = [];
  let hostedEvents = [];
  if (user) {
    const now = new Date().toISOString();
    const [{ data }, { data: adminRole }, { data: rsvps }, { data: hosted }] = await Promise.all([
      supabase.from('profiles').select('username, display_name').eq('id', user.id).single(),
      supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
      supabase
        .from('rsvps')
        .select(`event:events(${EVENT_FIELDS})`)
        .eq('user_id', user.id)
        .eq('status', 'going')
        .gte('events.starts_at', now)
        .order('created_at', { ascending: false }),
      supabase
        .from('events')
        .select(EVENT_FIELDS)
        .eq('created_by', user.id)
        .eq('status', 'published')
        .gte('starts_at', now)
        .order('starts_at', { ascending: true })
        .limit(3),
    ]);
    profile = data;
    isAdmin = Boolean(adminRole);

    attendingEvents = (rsvps || [])
      .map((rsvp) => rsvp.event)
      .filter(Boolean)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 3);

    const hostedIds = (hosted || []).map((event) => event.id);
    const { data: seatCounts } = hostedIds.length
      ? await supabase.rpc('event_seat_counts_for', { _events: hostedIds })
      : { data: [] };
    const seatsByEvent = new Map((seatCounts || []).map((row) => [row.event_id, row.seats_taken]));
    hostedEvents = (hosted || []).map((event) => ({
      ...event,
      seats_taken: seatsByEvent.get(event.id) || 0,
    }));
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-background px-4 pb-12 pt-8 sm:pt-10">
      <div className={cn('w-full space-y-8', user ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="text-center">
          <Image
            src="/banner.png"
            alt=""
            width={2172}
            height={724}
            priority
            className="mb-6 h-auto w-full rounded-2xl shadow-sm shadow-primary/20"
          />
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-foreground">
            Board Game Events
          </h1>
          <p className="mt-2 text-muted-foreground">Find your next game night, or host one yourself.</p>
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm text-muted-foreground">
                  Signed in as {profile?.display_name || profile?.username || user.email}
                </p>
                <h2 className="mt-1 font-heading text-2xl font-bold text-foreground">
                  Welcome back{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/events" className={cn(buttonVariants({ variant: 'outline' }))}>
                  <Search />
                  Browse events
                </Link>
                <Link href="/events/new" className={cn(buttonVariants())}>
                  <Plus />
                  Host an event
                </Link>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <EventSection
                title="Events I’m attending"
                events={attendingEvents}
                emptyText="You have no upcoming RSVPs."
                emptyAction="Find an event"
                emptyHref="/events"
                viewAllText="View all attending events"
              />
              <EventSection
                title="My hosted events"
                events={hostedEvents}
                emptyText="You are not hosting an upcoming event."
                emptyAction="Host your first event"
                emptyHref="/events/new"
                viewAllText="Manage hosted events"
                showSeats
              />
            </div>

            <Card>
              <CardContent className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <p className="text-sm text-muted-foreground">Personalize your experience</p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/settings/preferences" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                    Preferences
                  </Link>
                  <Link href="/settings/profile" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                    Profile
                  </Link>
                  <Link href="/settings/considerations" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                    Considerations
                  </Link>
                  {isAdmin && (
                    <Badge variant="secondary" render={<Link href="/admin" />}>
                      <Sparkles />
                      Admin
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex justify-center gap-3">
            <Link href="/login" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              Log in
            </Link>
            <Link href="/signup" className={cn(buttonVariants({ size: 'lg' }))}>
              Sign up
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
