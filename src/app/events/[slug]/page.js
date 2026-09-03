import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ExternalLink,
  Flag,
  Dices,
  MapPin,
  MessageSquare,
  Pencil,
  Settings,
  Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatEventTime } from '@/lib/dates';
import { venueMapUrl, coarseMapUrl } from '@/lib/maps';
import { anonymousRsvpToEvent, cancelAnonymousRsvp, rsvpToEvent, cancelRsvp, postMessage, reportEvent } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DismissibleNotice } from '@/components/dismissible-notice';
import { CalendarMenu } from '@/components/calendar-menu';
import { GameFactIcon } from '@/components/game-fact-icon';
import { eventCalendarLinks } from '@/lib/calendar-links';
import { cookies, headers } from 'next/headers';
import { formatInTimeZone } from 'date-fns-tz';

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

function GuestCountSelect({ defaultValue = 0, maxGuests = 5 }) {
  return (
    <select name="guest_count" defaultValue={defaultValue} className={selectClass} aria-label="Number of guests">
      {Array.from({ length: maxGuests + 1 }, (_, guestCount) => (
        <option key={guestCount} value={guestCount}>
          {guestCount === 0 ? 'No guests' : `${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}`}
        </option>
      ))}
    </select>
  );
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase
    .from('events')
    .select('title, description, starts_at, timezone, location_label, city, region')
    .eq('slug', slug)
    .maybeSingle();

  if (!event) return { title: 'Event | Board Game Events' };

  const time = formatEventTime(event.starts_at, event.timezone);
  const location = [event.location_label, [event.city, event.region].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ');
  const description = [time, location, event.description].filter(Boolean).join(' — ').slice(0, 200);

  return {
    title: `${event.title} | Board Game Events`,
    description,
    openGraph: {
      title: event.title,
      description,
      type: 'website',
      images: [{ url: '/banner.png', width: 1536, height: 1024, alt: 'Board Game Events' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: event.title,
      description,
      images: ['/banner.png'],
    },
  };
}

export default async function EventDetailPage({ params, searchParams }) {
  const { slug } = await params;
  const { error, reported, updated, guest_rsvp: guestRsvp } = await searchParams;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from('events')
    .select(
      'id, title, description, starts_at, ends_at, timezone, location_label, neighborhood, cross_streets, city, region, venue_id, seat_limit, allow_waitlist, allow_plus_ones, allow_anonymous_rsvps, max_guests_per_rsvp, featured_games_enabled, visibility, status, cancellation_reason, created_by, profiles!events_created_by_fkey(username, display_name)'
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
  const guestAccessToken = (await cookies()).get(`guest_rsvp_${event.id}`)?.value;
  const { data: anonymousRsvp } = !user && guestAccessToken
    ? await supabase.rpc('anonymous_rsvp_details', { _event: event.id, _access_token: guestAccessToken }).maybeSingle()
    : { data: null };

  const [{ data: seatCounts }, { data: featuredGames }, { data: myRsvp }, { data: hostRow }] = await Promise.all([
    supabase.rpc('event_seat_count', { _event: event.id }).single(),
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
      ? supabase.from('rsvps').select('status, seats_claimed').eq('event_id', event.id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from('event_hosts').select('role').eq('event_id', event.id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const seatsLeft = seatCounts?.seats_left;
  const isFull = event.seat_limit != null && seatsLeft <= 0;
  const activeStatus = myRsvp && myRsvp.status !== 'cancelled' ? myRsvp.status : null;
  const isHost = Boolean(hostRow);
  const canViewPrivateDetails = isHost || activeStatus === 'going' || anonymousRsvp?.status === 'going';
  const canViewMessages = isHost || activeStatus === 'going';

  const [{ data: attendeeNames }, { data: venue }, { data: messages }] = await Promise.all([
    canViewPrivateDetails
      ? anonymousRsvp
        ? supabase.rpc('anonymous_event_attendee_names', { _event: event.id, _access_token: guestAccessToken })
        : supabase.rpc('event_attendee_names', { _event: event.id })
      : Promise.resolve({ data: [] }),
    event.venue_id
      ? anonymousRsvp
        ? supabase.rpc('anonymous_event_venue_details', { _event: event.id, _access_token: guestAccessToken }).maybeSingle()
        : supabase.rpc('event_venue_details', { _event: event.id }).maybeSingle()
      : Promise.resolve({ data: null }),
    canViewMessages
      ? supabase
          .from('event_messages')
          .select('id, body, created_at, profiles(id, username, display_name)')
          .eq('event_id', event.id)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: null }),
  ]);

  const confirmedAttendeeCount = attendeeNames?.length || 0;
  const confirmedGuestCount = canViewPrivateDetails
    ? Math.max(0, Number(seatCounts?.seats_taken || 0) - confirmedAttendeeCount)
    : 0;
  const cityAndRegion = [event.city || venue?.city, event.region || venue?.region].filter(Boolean).join(', ');

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
  const eventPath = `/events/${slug}`;
  const loginForRsvp = `/login?next=${encodeURIComponent(eventPath)}&reason=rsvp`;
  const signupForRsvp = `/signup?next=${encodeURIComponent(eventPath)}&reason=rsvp`;
  const loginForReport = `/login?next=${encodeURIComponent(eventPath)}&reason=report`;
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
          <span>
            Hosted by <span className="text-primary">{host?.display_name || host?.username || 'a member'}</span>
          </span>
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
        <DismissibleNotice clearParams={['reported']}>Thanks. This event has been reported to the moderation team.</DismissibleNotice>
      )}

      {updated === 'event' && (
        <DismissibleNotice clearParams={['updated']}>Your event has been updated.</DismissibleNotice>
      )}
      {guestRsvp === 'confirmed' && (
        <DismissibleNotice clearParams={['guest_rsvp']}>Your guest RSVP has been saved.</DismissibleNotice>
      )}
      {guestRsvp === 'cancelled' && (
        <DismissibleNotice clearParams={['guest_rsvp']}>Your guest RSVP was cancelled.</DismissibleNotice>
      )}

      {event.description && (
        <Card className="bg-sky-50/80 ring-primary/20">
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
            <CardTitle className="flex items-center gap-1.5 text-lg text-muted-foreground">
              <MapPin className="size-4" />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-foreground">
              {event.location_label && <span className="block text-lg font-semibold">{event.location_label}</span>}
              {[event.neighborhood, event.cross_streets, cityAndRegion].filter(Boolean).join(' · ')}
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
                  {!preciseMapUrl && event.cross_streets ? 'View approximate area' : 'View map'}
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
              <p className="text-xs text-muted-foreground/80">
                {user ? 'RSVP to see the exact address.' : 'Log in and RSVP to see the exact address.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {event.featured_games_enabled && featuredGames?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-lg text-muted-foreground">
              <Dices className="size-4" aria-hidden="true" />
              Featured Games
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Games the organizer is planning to bring to the table.</p>
            <ul className="mx-auto grid max-w-lg gap-3">
              {featuredGames.map(({ games: game }) => (
                <li key={game.bgg_id}>
                  <Card className="h-full bg-muted/40">
                  <CardContent className="flex h-full flex-col gap-4 sm:flex-row">
                    <div className="flex shrink-0 flex-col items-center sm:w-[200px]">
                      {game.thumbnail_url || game.image_url ? (
                        <Image
                          src={game.image_url || game.thumbnail_url}
                          alt={`${game.name} box art`}
                          width={200}
                          height={200}
                          className="size-[200px] rounded-lg object-contain"
                        />
                      ) : (
                        <div className="size-[200px] rounded-lg bg-muted" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col items-center text-center sm:items-stretch sm:text-left">
                      <h3 className="font-heading text-[21px] font-semibold leading-tight text-foreground">{game.name}</h3>
                      <div className="mt-2 space-y-2 text-sm text-muted-foreground sm:space-y-1">
                        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:block sm:space-y-1">
                          {game.year_published && (
                            <div className="flex items-center gap-1 sm:gap-1.5">
                              <GameFactIcon icon="calendar" label="Published" />
                              <span className="sr-only">Published:</span>
                              {game.year_published}
                            </div>
                          )}
                          {game.min_players && game.max_players && (
                            <div className="flex items-center gap-1 sm:gap-1.5">
                              <GameFactIcon icon="users" label="Players" />
                              <span className="sr-only">Players:</span>
                              {game.min_players}–{game.max_players} players
                            </div>
                          )}
                          {game.playtime_minutes && (
                            <div className="flex items-center gap-1 sm:gap-1.5">
                              <GameFactIcon icon="clock" label="Play time" />
                              <span className="sr-only">Play time:</span>
                              {game.playtime_minutes} minutes
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-center gap-4 sm:block sm:space-y-1">
                          {game.weight && (
                            <div className="flex items-center gap-1 sm:gap-1.5">
                              <GameFactIcon icon="gauge" label="Complexity" />
                              <span className="sr-only">Complexity:</span>
                              {Number(game.weight).toFixed(1)}/5
                            </div>
                          )}
                          {game.weight && (
                            <div className="flex items-center gap-1 sm:gap-1.5">
                              <GameFactIcon icon="dumbbell" label="Weight" />
                              <span className="sr-only">Weight:</span>
                              {Number(game.weight).toFixed(1)}/5
                            </div>
                          )}
                        </div>
                      </div>
                      <a
                        href={`https://boardgamegeek.com/boardgame/${game.bgg_id}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-4 inline-block self-center text-sm font-medium text-primary underline underline-offset-2 sm:self-start"
                      >
                        View on BoardGameGeek
                      </a>
                    </div>
                  </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
            <div className="mx-auto flex max-w-lg justify-center">
              <a
                href="https://boardgamegeek.com"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Powered by BoardGameGeek"
              >
                <Image
                  src="https://cf.geekdo-images.com/HZy35cmzmmyV9BarSuk6ug__small/img/gbE7sulIurZE_Tx8EQJXnZSKI6w=/fit-in/200x150/filters:strip_icc()/pic7779581.png"
                  alt="Powered by BoardGameGeek"
                  width={128}
                  height={38}
                  className="h-auto w-32"
                />
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-lg text-muted-foreground">
            <Users className="size-4" />
            Attendees
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-foreground">
            <span className="font-semibold">{seatCounts?.seats_taken || 0} seats claimed</span> ·{' '}
            {event.seat_limit
              ? isFull
                ? `Full: ${event.seat_limit} seats`
                : `${seatsLeft} of ${event.seat_limit} seats left`
              : 'Unlimited seats'}
          </p>
          {canViewPrivateDetails && attendeeNames?.length > 0 && (
            <p className="text-muted-foreground">
              {attendeeNames
                .map(({ attendee_name: attendeeName, is_organizer: isOrganizer }) =>
                  isOrganizer ? `${attendeeName} (organizer)` : attendeeName
                )
                .join(', ')}
            </p>
          )}
          {canViewPrivateDetails && confirmedGuestCount > 0 && (
            <p className="text-muted-foreground">
              {confirmedAttendeeCount} registered {confirmedAttendeeCount === 1 ? 'attendee' : 'attendees'} and{' '}
              {confirmedGuestCount} {confirmedGuestCount === 1 ? 'guest' : 'guests'}
            </p>
          )}
          {event.seat_limit && (
            <p className="mt-2 text-muted-foreground">
              {event.allow_waitlist ? 'Waitlist available once full' : 'No waitlist'}
            </p>
          )}
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
          {!user && !anonymousRsvp && (
            <Card className="px-(--card-spacing)">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="font-heading text-lg font-semibold text-foreground">Interested in attending?</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {event.allow_anonymous_rsvps
                      ? 'Use an account, or RSVP below with just your name.'
                      : 'Log in or create an account to RSVP.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button nativeButton={false} variant="outline" render={<Link href={loginForRsvp} />}>
                    Log in
                  </Button>
                  <Button nativeButton={false} render={<Link href={signupForRsvp} />}>
                    Sign up
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {!user && !anonymousRsvp && event.allow_anonymous_rsvps && (isFull ? event.allow_waitlist : true) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">RSVP without an account</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={anonymousRsvpToEvent} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <label className="min-w-44 flex-1 text-sm font-medium text-foreground">
                    First name
                    <Input name="first_name" required maxLength={40} autoComplete="given-name" className="mt-1" />
                  </label>
                  <label className="w-32 text-sm font-medium text-foreground">
                    Last initial
                    <Input name="last_initial" required maxLength={1} autoComplete="family-name" className="mt-1" />
                  </label>
                  <Button type="submit">{isFull ? 'Join waitlist' : 'RSVP as guest'}</Button>
                  <p className="w-full text-xs text-muted-foreground">
                    Your name will appear as your first name and last initial. An account is not required.
                  </p>
                </form>
              </CardContent>
            </Card>
          )}

          {!user && anonymousRsvp && (
            <Card className="px-(--card-spacing)">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-heading text-lg font-semibold text-primary">
                    {anonymousRsvp.status === 'going' ? 'You’re going!' : 'You’re on the waitlist'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    RSVP for {anonymousRsvp.guest_first_name} {anonymousRsvp.guest_last_initial}.
                  </p>
                </div>
                <form action={cancelAnonymousRsvp}>
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <Button type="submit" variant="outline">
                    {anonymousRsvp.status === 'going' ? 'Cancel RSVP' : 'Leave waitlist'}
                  </Button>
                </form>
              </div>
            </Card>
          )}

          {activeStatus === 'going' && (
            <Card className="px-(--card-spacing)">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-heading text-lg font-semibold text-primary">You&rsquo;re going!</p>
                  {myRsvp.seats_claimed > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Your RSVP includes {myRsvp.seats_claimed - 1} {myRsvp.seats_claimed === 2 ? 'guest' : 'guests'}.
                    </p>
                  )}
                </div>
                <form action={cancelRsvp}>
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <Button type="submit" variant="outline">Cancel RSVP</Button>
                </form>
              </div>
              {(event.allow_plus_ones || myRsvp.seats_claimed > 1) && (
                <form action={rsvpToEvent} className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <GuestCountSelect
                    defaultValue={myRsvp.seats_claimed - 1}
                    maxGuests={event.allow_plus_ones ? event.max_guests_per_rsvp : myRsvp.seats_claimed - 1}
                  />
                  <Button type="submit" size="sm">Update guests</Button>
                  <p className="w-full text-xs text-muted-foreground">Guest seats count toward event capacity.</p>
                </form>
              )}
            </Card>
          )}

          {activeStatus === 'waitlist' && (
            <Card className="px-(--card-spacing)">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-heading text-lg font-semibold text-foreground">You&rsquo;re on the waitlist</p>
                  <p className="text-xs text-muted-foreground">
                    Waiting for {myRsvp.seats_claimed} {myRsvp.seats_claimed === 1 ? 'seat' : 'seats'}.
                  </p>
                </div>
                <form action={cancelRsvp}>
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <Button type="submit" variant="outline">Leave waitlist</Button>
                </form>
              </div>
              {(event.allow_plus_ones || myRsvp.seats_claimed > 1) && (
                <form action={rsvpToEvent} className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <GuestCountSelect
                    defaultValue={myRsvp.seats_claimed - 1}
                    maxGuests={event.allow_plus_ones ? event.max_guests_per_rsvp : myRsvp.seats_claimed - 1}
                  />
                  <Button type="submit" size="sm">Update guests</Button>
                </form>
              )}
            </Card>
          )}

          {user && !activeStatus && (isFull ? event.allow_waitlist : true) && (
            <Card className="px-(--card-spacing)">
              <form action={rsvpToEvent} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="event_id" value={event.id} />
                <input type="hidden" name="slug" value={slug} />
                {event.allow_plus_ones && <GuestCountSelect maxGuests={event.max_guests_per_rsvp} />}
                <Button type="submit">
                  {isFull ? 'Join waitlist' : 'RSVP'}
                </Button>
                {event.allow_plus_ones && (
                  <p className="w-full text-xs text-muted-foreground">You and each guest claim one seat.</p>
                )}
              </form>
            </Card>
          )}

          {user && !activeStatus && isFull && !event.allow_waitlist && (
            <p className="text-center text-sm text-muted-foreground">This event is full.</p>
          )}
        </div>
      )}

      {canViewMessages && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-lg text-muted-foreground">
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

      {!user && (
        <Link href={loginForReport} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Flag className="size-3.5" />
          Log in to report this event
        </Link>
      )}
    </PageShell>
  );
}
