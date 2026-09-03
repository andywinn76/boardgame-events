import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatDateTimeInput } from '@/lib/dates';
import { updateEvent } from '../../actions';
import { PageShell } from '@/components/page-shell';
import { FeaturedGamesPicker } from '@/components/featured-games-picker';
import { SeatLimitField } from '@/components/seat-limit-field';
import { VenueMapPreview } from '@/components/venue-map-preview';
import { EventScheduleFields } from '@/components/event-schedule-fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

export default async function EditEventPage({ params, searchParams }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: event } = await supabase
    .from('events')
    .select(
      'id, slug, title, description, starts_at, ends_at, timezone, venue_id, location_label, neighborhood, cross_streets, city, region, seat_limit, allow_waitlist, allow_plus_ones, allow_anonymous_rsvps, max_guests_per_rsvp, featured_games_enabled, visibility'
    )
    .eq('slug', slug)
    .single();
  if (!event) notFound();

  const { data: hostRow } = await supabase
    .from('event_hosts')
    .select('role')
    .eq('event_id', event.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!hostRow) notFound();

  const venueFilter = [`created_by.eq.${user.id}`];
  if (event.venue_id) venueFilter.push(`id.eq.${event.venue_id}`);

  const [{ data: venues }, { data: eventGames }] = await Promise.all([
    supabase.from('venues').select('id, name, city, region').or(venueFilter.join(',')).order('name'),
    event.featured_games_enabled
      ? supabase
          .from('event_games')
          .select(
            'sort_order, games(bgg_id, name, year_published, min_players, max_players, playtime_minutes, weight, thumbnail_url, image_url)'
          )
          .eq('event_id', event.id)
          .order('sort_order')
      : Promise.resolve({ data: [] }),
  ]);

  const initialGames = (eventGames || []).map(({ games }) => games).filter(Boolean);

  return (
    <PageShell>
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Edit event</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Back to{' '}
          <Link href={`/events/${slug}`} className="underline underline-offset-2">
            {event.title}
          </Link>
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form
        action={updateEvent}
        className="space-y-4 [&_[data-slot=input]]:bg-card [&_[data-slot=textarea]]:bg-card"
      >
        <input type="hidden" name="event_id" value={event.id} />
        <input type="hidden" name="slug" value={event.slug} />

        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required defaultValue={event.title} />
        </div>

        <EventScheduleFields
          defaultStartsAt={formatDateTimeInput(event.starts_at, event.timezone)}
          defaultEndsAt={formatDateTimeInput(event.ends_at, event.timezone)}
          defaultTimezone={event.timezone}
        />

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={4} defaultValue={event.description || ''} />
        </div>

        <FeaturedGamesPicker defaultEnabled={event.featured_games_enabled} initialGames={initialGames} />

        <fieldset className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Venue and location</legend>

          <div className="space-y-1.5">
            <Label htmlFor="venue_id">Saved venue</Label>
            <p className="text-xs text-muted-foreground">Only venues you have added appear here.</p>
            <select id="venue_id" name="venue_id" defaultValue={event.venue_id || ''} className={selectClass}>
              <option value="">No saved venue. Use the general location fields</option>
              {(venues || []).map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                  {venue.city || venue.region ? ` · ${[venue.city, venue.region].filter(Boolean).join(', ')}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location_label">Location name</Label>
            <Input id="location_label" name="location_label" defaultValue={event.location_label || ''} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="neighborhood">Neighborhood</Label>
              <Input id="neighborhood" name="neighborhood" defaultValue={event.neighborhood || ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={event.city || ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="region">State / region</Label>
              <Input id="region" name="region" defaultValue={event.region || ''} placeholder="CO" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cross_streets">Cross streets</Label>
            <Input id="cross_streets" name="cross_streets" defaultValue={event.cross_streets || ''} />
          </div>
          <VenueMapPreview type="event" />
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Attendees</legend>

          <SeatLimitField defaultValue={event.seat_limit} />

          <div className="flex items-center gap-2">
            <input
              id="allow_anonymous_rsvps"
              name="allow_anonymous_rsvps"
              type="checkbox"
              defaultChecked={event.allow_anonymous_rsvps}
              className="size-4 rounded border-input accent-primary"
            />
            <Label htmlFor="allow_anonymous_rsvps" className="font-normal">
              Allow people without an account to RSVP
            </Label>
          </div>
          <p className="-mt-2 ml-6 text-xs text-muted-foreground">
            Unregistered users may RSVP with a first name and last initial. Not recommended for public events.
          </p>

          <div className="flex items-center gap-2">
            <input
              id="allow_waitlist"
              name="allow_waitlist"
              type="checkbox"
              defaultChecked={event.allow_waitlist}
              className="size-4 rounded border-input accent-primary"
            />
            <Label htmlFor="allow_waitlist" className="font-normal">Allow a waitlist once seats fill up</Label>
          </div>

          <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2">
            <input
              id="allow_plus_ones"
              name="allow_plus_ones"
              type="checkbox"
              defaultChecked={event.allow_plus_ones}
              className="peer size-4 rounded border-input accent-primary"
            />
            <Label htmlFor="allow_plus_ones" className="font-normal">
              Allow attendees to bring guests
            </Label>
            <div className="col-span-2 ml-6 hidden items-center gap-2 peer-checked:flex">
              <Label htmlFor="max_guests_per_rsvp" className="font-normal">Guests allowed per attendee</Label>
              <select
                id="max_guests_per_rsvp"
                name="max_guests_per_rsvp"
                defaultValue={event.max_guests_per_rsvp}
                className={`${selectClass} max-w-16 shrink-0`}
              >
                {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="visibility">Event discoverability</Label>
          <p className="text-xs text-muted-foreground">
            Choose whether people can find this event without its direct link.
          </p>
          <select id="visibility" name="visibility" defaultValue={event.visibility} className={selectClass}>
            <option value="public">Listed: appears in event browsing</option>
            <option value="unlisted">Unlisted: only people with the direct link</option>
            <option value="invite_only">Invite only: only accepted invitees</option>
          </select>
        </div>

        <div className="flex gap-2">
          <Button type="submit">Save changes</Button>
          <Button variant="outline" nativeButton={false} render={<Link href={`/events/${slug}`} />}>
            Cancel
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
