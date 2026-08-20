import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatDateTimeInput, SUPPORTED_TIMEZONES } from '@/lib/dates';
import { updateEvent } from '../../actions';
import { PageShell } from '@/components/page-shell';
import { FeaturedGamesPicker } from '@/components/featured-games-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

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
      'id, slug, title, description, starts_at, ends_at, timezone, venue_id, location_label, neighborhood, cross_streets, city, seat_limit, allow_waitlist, featured_games_enabled, visibility'
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

  const venueFilter = [`is_shared.eq.true`, `created_by.eq.${user.id}`];
  if (event.venue_id) venueFilter.push(`id.eq.${event.venue_id}`);

  const [{ data: venues }, { data: eventGames }] = await Promise.all([
    supabase.from('venues').select('id, name, city').or(venueFilter.join(',')).order('name'),
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
        <p className="text-sm text-muted-foreground">
          <Link href={`/events/${slug}`} className="underline underline-offset-2">
            {event.title}
          </Link>
        </p>
        <h1 className="font-heading text-3xl font-bold text-foreground">Edit event</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form action={updateEvent} className="space-y-4">
        <input type="hidden" name="event_id" value={event.id} />
        <input type="hidden" name="slug" value={event.slug} />

        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required defaultValue={event.title} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="starts_at">Starts</Label>
            <Input
              id="starts_at"
              name="starts_at"
              type="datetime-local"
              required
              defaultValue={formatDateTimeInput(event.starts_at, event.timezone)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <select id="timezone" name="timezone" defaultValue={event.timezone} className={selectClass}>
              {SUPPORTED_TIMEZONES.map((timezone) => (
                <option key={timezone.value} value={timezone.value}>
                  {timezone.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ends_at">
            Ends <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="ends_at"
            name="ends_at"
            type="datetime-local"
            defaultValue={formatDateTimeInput(event.ends_at, event.timezone)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={4} defaultValue={event.description || ''} />
        </div>

        <FeaturedGamesPicker defaultEnabled={event.featured_games_enabled} initialGames={initialGames} />

        <fieldset className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Venue and location</legend>

          <div className="space-y-1.5">
            <Label htmlFor="venue_id">Saved venue</Label>
            <select id="venue_id" name="venue_id" defaultValue={event.venue_id || ''} className={selectClass}>
              <option value="">No saved venue. Use the general location fields</option>
              {(venues || []).map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}{venue.city ? ` · ${venue.city}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location_label">Location name</Label>
            <Input id="location_label" name="location_label" defaultValue={event.location_label || ''} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="neighborhood">Neighborhood</Label>
              <Input id="neighborhood" name="neighborhood" defaultValue={event.neighborhood || ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={event.city || ''} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cross_streets">Cross streets</Label>
            <Input id="cross_streets" name="cross_streets" defaultValue={event.cross_streets || ''} />
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="seat_limit">
            Seat limit <span className="font-normal text-muted-foreground">(blank = unlimited)</span>
          </Label>
          <Input id="seat_limit" name="seat_limit" type="number" min="1" defaultValue={event.seat_limit ?? ''} />
        </div>

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

        <div className="space-y-1.5">
          <Label htmlFor="visibility">Visibility</Label>
          <select id="visibility" name="visibility" defaultValue={event.visibility} className={selectClass}>
            <option value="public">Public: anyone can find it</option>
            <option value="unlisted">Unlisted: only people with the link</option>
            <option value="invite_only">Invite only</option>
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
