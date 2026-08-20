import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, ExternalLink, Pencil, Settings, Users, MessageSquare, Flag } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatEventTime } from '@/lib/dates';
import { venueMapUrl, coarseMapUrl } from '@/lib/maps';
import { rsvpToEvent, cancelRsvp, postMessage, reportEvent } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CalendarMenu } from '@/components/calendar-menu';
import { eventCalendarLinks } from '@/lib/calendar-links';
import { headers } from 'next/headers';
import { formatInTimeZone } from 'date-fns-tz';

export default async function EventDetailPage({ params, searchParams }) {
  const { slug } = await params;
  const { error, reported, updated } = await searchParams;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from('events')
    .select(
      'id, title, description, starts_at, ends_at, timezone, location_label, neighborhood, cross_streets, city, venue_id, seat_limit, allow_waitlist, featured_games_enabled, visibility, status, cancellation_reason, created_by, profiles!events_created_by_fkey(username, display_name)'
    )
    .eq('slug', slug)
    .single();

  if (!event) {
    notFound();
  }

  const host = event.profiles;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: seatCounts },
    { data: attendeeNames },
    { data: featuredGames },
    { data: myRsvp },
    { data: venue },
    { data: hostRow },
  ] = await Promise.all([
    supabase.rpc('event_seat_count', { _event: event.id }).single(),
    user
      ? supabase.rpc('event_attendee_names', { _event: event.id })
      : Promise.resolve({ data: [] }),
    event.featured_games_enabled
      ? supabase
          .from('event_games')
          .select(
            'sort_order, games(bgg_id, name, year_published, min_players, max_players, playtime_minutes, weight, thumbnail_url, image_url)'
          )
          .eq('event_id', event.id)
          .order('sort_order')
      : Promise.resolve({ data: [] }),
    user
      ? supabase.from('rsvps').select('status').eq('event_id', event.id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    event.venue_id
      ? supabase.rpc('event_venue_details', { _event: event.id }).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from('event_hosts').select('role').eq('event_id', event.id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const seatsLeft = seatCounts?.seats_left;
  const isFull = event.seat_limit != null && seatsLeft <= 0;
  const activeStatus = myRsvp && myRsvp.status !== 'cancelled' ? myRsvp.status : null;
  const isHost = Boolean(hostRow);
  const onRoster = isHost || ['going', 'waitlist', 'maybe'].includes(activeStatus);

  // RLS-gated the same way as the roster itself -- resolves to real rows only
  // for hosts and RSVP'd attendees, so this doubles as the visibility check.
  const { data: messages } = onRoster
    ? await supabase
        .from('event_messages')
        .select('id, body, created_at, profiles(id, username, display_name)')
        .eq('event_id', event.id)
        .order('created_at', { ascending: true })
    : { data: null };

  const preciseMapUrl = venueMapUrl(venue);
  const fallbackMapUrl = coarseMapUrl({
    locationLabel: event.location_label,
    neighborhood: event.neighborhood,
    crossStreets: event.cross_streets,
    city: event.city,
  });
  const mapUrl = preciseMapUrl || fallbackMapUrl;
  const headersList = await headers();
  const hostName = headersList.get('host');
  const protocol = hostName?.startsWith('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${hostName}`;
  const eventUrl = `${baseUrl}/events/${slug}`;
  const calendarLinks = eventCalendarLinks({
    event,
    venue,
    eventUrl,
    icsUrl: `${baseUrl}/api/ics/${event.id}`,
  });

  return (
    <PageShell size="2xl">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">{event.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {formatEventTime(event.starts_at, event.timezone)}
          {event.ends_at ? ` – ${formatEventTime(event.ends_at, event.timezone, 'h:mm a zzz')}` : ''}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>Hosted by {host?.display_name || host?.username || 'a member'}</span>
          <CalendarMenu links={calendarLinks} />
          {isHost && (
            <>
              <Link href={`/events/${slug}/edit`} className="inline-flex items-center gap-1 underline underline-offset-2">
                <Pencil className="size-3.5" />
                Edit event
              </Link>
              <Link href={`/events/${slug}/manage`} className="inline-flex items-center gap-1 underline underline-offset-2">
                <Settings className="size-3.5" />
                Manage
              </Link>
            </>
          )}
        </div>
      </div>

      {reported && (
        <Alert>
          <AlertDescription>Thanks. This event has been reported to the moderation team.</AlertDescription>
        </Alert>
      )}

      {updated === 'event' && (
        <Alert>
          <AlertDescription>Your event has been updated.</AlertDescription>
        </Alert>
      )}

      {event.description && (
        <Card className="bg-primary/5 ring-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <MessageSquare className="size-5 text-primary" />
              About this event
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-base leading-7 text-foreground">{event.description}</p>
          </CardContent>
        </Card>
      )}

      {(event.location_label || event.neighborhood || event.cross_streets || event.city) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-foreground">
              {event.location_label && <span className="block text-[1.3125rem] font-semibold">{event.location_label}</span>}
              {[event.neighborhood, event.cross_streets, event.city].filter(Boolean).join(' · ')}
            </p>

            {venue?.address_line1 && (
              <p className="my-2 text-muted-foreground">
                {venue.address_line1}
                {venue.address_line2 ? `, ${venue.address_line2}` : ''}
                <br />
                {[venue.city, venue.region, venue.postal_code].filter(Boolean).join(', ')}
              </p>
            )}

            {venue?.access_notes && <p className="text-muted-foreground">{venue.access_notes}</p>}

            <div className="flex items-center gap-4 pt-1">
              {mapUrl && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
                >
                  View map
                  <ExternalLink className="size-3.5" />
                </a>
              )}
              {venue?.website && (
                <a
                  href={venue.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
                >
                  Website
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>

            {event.venue_id && !venue && (
              <p className="text-xs text-muted-foreground/80">RSVP to see the exact address.</p>
            )}
          </CardContent>
        </Card>
      )}

      {event.featured_games_enabled && featuredGames?.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-heading text-xl font-bold text-foreground">Featured Games</h2>
            <p className="mt-1 text-sm text-muted-foreground">Games the organizer is planning to bring to the table.</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featuredGames.map(({ games: game }) => (
              <li key={game.bgg_id}>
                <Card className="h-full">
                  <CardContent className="flex h-full gap-3">
                    {game.thumbnail_url || game.image_url ? (
                      <Image
                        src={game.thumbnail_url || game.image_url}
                        alt={`${game.name} box art`}
                        width={80}
                        height={80}
                        className="size-20 shrink-0 rounded-md object-contain"
                      />
                    ) : (
                      <div className="size-20 shrink-0 rounded-md bg-muted" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <h3 className="font-heading font-semibold text-foreground">{game.name}</h3>
                      {game.year_published && <p className="text-xs text-muted-foreground">{game.year_published}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {game.min_players && game.max_players
                          ? `${game.min_players}–${game.max_players} players`
                          : null}
                        {game.playtime_minutes ? ` · ${game.playtime_minutes} min` : ''}
                        {game.weight ? ` · Weight ${Number(game.weight).toFixed(1)}` : ''}
                      </p>
                      <a
                        href={`https://boardgamegeek.com/boardgame/${game.bgg_id}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-2 inline-block text-xs font-medium text-primary underline underline-offset-2"
                      >
                        View on BoardGameGeek
                      </a>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Game information and images provided by{' '}
            <a href="https://boardgamegeek.com" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
              BoardGameGeek
            </a>
            .
          </p>
        </section>
      )}

      <Card>
        <CardContent className="flex items-center gap-2 text-sm">
          <Users className="size-4 text-muted-foreground" />
          <div>
            <p className="text-foreground">
              {seatCounts?.seats_taken || 0} attending ·{' '}
              {event.seat_limit
                ? isFull
                  ? `Full: ${event.seat_limit} seats`
                  : `${seatsLeft} of ${event.seat_limit} seats left`
                : 'Unlimited seats'}
            </p>
            {attendeeNames?.length > 0 && (
              <p className="text-muted-foreground">
                {attendeeNames
                  .map(({ attendee_name: attendeeName, is_organizer: isOrganizer }) =>
                    isOrganizer ? `${attendeeName} (organizer)` : attendeeName
                  )
                  .join(', ')}
              </p>
            )}
            {event.seat_limit && (
              <p className="text-muted-foreground">{event.allow_waitlist ? 'Waitlist available once full' : 'No waitlist'}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {event.status === 'cancelled' && (
        <Alert variant="destructive">
          <AlertDescription>This event was cancelled. {event.cancellation_reason}</AlertDescription>
        </Alert>
      )}
      {event.status === 'completed' && (
        <Alert>
          <AlertDescription>This event already happened.</AlertDescription>
        </Alert>
      )}

      {event.status === 'published' && (
        <div>
          {activeStatus === 'going' && (
            <Card className="flex-row items-center justify-between px-(--card-spacing)">
              <p className="text-sm font-medium text-foreground">You&rsquo;re going</p>
              <form action={cancelRsvp}>
                <input type="hidden" name="event_id" value={event.id} />
                <input type="hidden" name="slug" value={slug} />
                <Button type="submit" variant="outline">
                  Cancel RSVP
                </Button>
              </form>
            </Card>
          )}

          {activeStatus === 'waitlist' && (
            <Card className="flex-row items-center justify-between px-(--card-spacing)">
              <p className="text-sm font-medium text-foreground">You&rsquo;re on the waitlist</p>
              <form action={cancelRsvp}>
                <input type="hidden" name="event_id" value={event.id} />
                <input type="hidden" name="slug" value={slug} />
                <Button type="submit" variant="outline">
                  Leave waitlist
                </Button>
              </form>
            </Card>
          )}

          {!activeStatus && (isFull ? event.allow_waitlist : true) && (
            <form action={rsvpToEvent}>
              <input type="hidden" name="event_id" value={event.id} />
              <input type="hidden" name="slug" value={slug} />
              <Button type="submit">
                {isFull ? 'Join waitlist' : 'RSVP'}
              </Button>
            </form>
          )}

          {!activeStatus && isFull && !event.allow_waitlist && (
            <p className="text-center text-sm text-muted-foreground">This event is full.</p>
          )}
        </div>
      )}

      {onRoster && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MessageSquare className="size-4" />
              Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!messages?.length ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => (
                  <li key={m.id} className="text-sm">
                    <p>
                      <span className={`font-semibold ${m.profiles?.id === user.id ? 'text-primary' : 'text-foreground'}`}>
                        {m.profiles?.display_name || m.profiles?.username}
                      </span>{' '}
                      <span className="text-[0.6875rem] text-muted-foreground/60">
                        • <time dateTime={m.created_at}>{formatInTimeZone(new Date(m.created_at), event.timezone, 'M/d/yy, h:mmaaa')}</time>
                      </span>
                      <span className="text-foreground">:</span>{' '}
                      <span className="text-muted-foreground">{m.body}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <form action={postMessage} className="mt-4 flex gap-2">
              <input type="hidden" name="event_id" value={event.id} />
              <input type="hidden" name="slug" value={slug} />
              <Input name="body" type="text" required placeholder="Say something to the group" className="flex-1" />
              <Button type="submit">Post</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {user && (
        <details className="text-sm text-muted-foreground">
          <summary className="flex cursor-pointer items-center gap-1.5">
            <Flag className="size-3.5" />
            Report this event
          </summary>
          <form action={reportEvent} className="mt-2 flex gap-2">
            <input type="hidden" name="event_id" value={event.id} />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="subject_user" value={event.created_by} />
            <Input name="reason" type="text" required placeholder="What's wrong with this event?" className="flex-1" />
            <Button type="submit" variant="outline">
              Report
            </Button>
          </form>
        </details>
      )}
    </PageShell>
  );
}
