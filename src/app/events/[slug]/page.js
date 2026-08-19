import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, ExternalLink, CalendarPlus, Settings, Users, MessageSquare, Flag } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatEventTime } from '@/lib/dates';
import { venueMapUrl, coarseMapUrl } from '@/lib/maps';
import { rsvpToEvent, cancelRsvp, postMessage, reportEvent } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default async function EventDetailPage({ params, searchParams }) {
  const { slug } = await params;
  const { error, reported } = await searchParams;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from('events')
    .select(
      'id, title, description, starts_at, ends_at, timezone, location_label, neighborhood, cross_streets, city, venue_id, seat_limit, allow_waitlist, visibility, status, cancellation_reason, created_by, profiles!events_created_by_fkey(username, display_name)'
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

  const [{ data: seatCounts }, { data: myRsvp }, { data: venue }, { data: hostRow }] = await Promise.all([
    supabase.from('event_seat_counts').select('seats_taken, seats_left').eq('event_id', event.id).single(),
    user
      ? supabase.from('rsvps').select('status').eq('event_id', event.id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    // RLS-gated: only resolves for public venues, or private residences the
    // caller hosts or has RSVP'd to (docs/architecture.md "Two-layer location").
    event.venue_id
      ? supabase
          .from('venues')
          .select('name, address_line1, address_line2, city, region, postal_code, access_notes, website, lat, lng, google_place_id')
          .eq('id', event.venue_id)
          .maybeSingle()
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
        .select('id, body, created_at, profiles(username, display_name)')
        .eq('event_id', event.id)
        .order('created_at', { ascending: true })
    : { data: null };

  const preciseMapUrl = venueMapUrl(venue);
  const fallbackMapUrl = coarseMapUrl({ crossStreets: event.cross_streets, city: event.city });
  const mapUrl = preciseMapUrl || fallbackMapUrl;

  return (
    <PageShell size="2xl">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">{event.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {formatEventTime(event.starts_at, event.timezone)}
          {event.ends_at ? ` – ${formatEventTime(event.ends_at, event.timezone, 'h:mm a zzz')}` : ''}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>Hosted by {host?.display_name || host?.username || 'a member'}</span>
          <a href={`/api/ics/${event.id}`} className="inline-flex items-center gap-1 underline underline-offset-2">
            <CalendarPlus className="size-3.5" />
            Add to calendar
          </a>
          {isHost && (
            <Link href={`/events/${slug}/manage`} className="inline-flex items-center gap-1 underline underline-offset-2">
              <Settings className="size-3.5" />
              Manage
            </Link>
          )}
        </p>
      </div>

      {reported && (
        <Alert>
          <AlertDescription>Thanks — this event has been reported to the moderation team.</AlertDescription>
        </Alert>
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
              {event.location_label && <span className="block font-medium">{event.location_label}</span>}
              {[event.neighborhood, event.cross_streets, event.city].filter(Boolean).join(' · ')}
            </p>

            {venue?.address_line1 && (
              <p className="text-muted-foreground">
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

      {event.description && <p className="whitespace-pre-wrap text-foreground">{event.description}</p>}

      <Card>
        <CardContent className="flex items-center gap-2 text-sm">
          <Users className="size-4 text-muted-foreground" />
          <div>
            <p className="text-foreground">
              {event.seat_limit
                ? isFull
                  ? `Full — ${event.seat_limit} seats`
                  : `${seatsLeft} of ${event.seat_limit} seats left`
                : 'Unlimited seats'}
            </p>
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
              <Button type="submit" size="lg" className="w-full">
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
                    <span className="font-medium text-foreground">{m.profiles?.display_name || m.profiles?.username}</span>{' '}
                    <span className="text-muted-foreground">{m.body}</span>
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
