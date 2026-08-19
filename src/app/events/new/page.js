import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SUPPORTED_TIMEZONES } from '@/lib/dates';
import { createEvent } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FeaturedGamesPicker } from '@/components/featured-games-picker';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

export default async function NewEventPage({ searchParams }) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: sharedVenues } = await supabase
    .from('venues')
    .select('id, name, city')
    .eq('is_shared', true)
    .order('name');

  return (
    <PageShell>
      <h1 className="font-heading text-3xl font-bold text-foreground">Host an event</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form action={createEvent} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" type="text" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="starts_at">Starts</Label>
            <Input id="starts_at" name="starts_at" type="datetime-local" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <select id="timezone" name="timezone" defaultValue="America/Denver" className={selectClass}>
              {SUPPORTED_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ends_at">
            Ends <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id="ends_at" name="ends_at" type="datetime-local" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea id="description" name="description" rows={3} />
        </div>

        <FeaturedGamesPicker />

        <fieldset className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
          <legend className="px-1 text-sm font-medium text-foreground">
            Venue <span className="font-normal text-muted-foreground">(optional)</span>
          </legend>

          {sharedVenues?.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="venue_id">Saved venue</Label>
              <select id="venue_id" name="venue_id" defaultValue="" className={selectClass}>
                <option value="">None — describe the location below</option>
                {sharedVenues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                    {venue.city ? ` · ${venue.city}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <details className="rounded-lg border border-border bg-card p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground">Add a new venue</summary>
            <div className="mt-3 space-y-4">
              <p className="text-xs text-muted-foreground">
                Ignored if a saved venue is selected above. The exact address here is only ever shown to
                hosts and people who&rsquo;ve RSVP&rsquo;d — everyone else sees just the neighborhood and
                cross streets.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="new_venue_name">Venue name</Label>
                <Input id="new_venue_name" name="new_venue_name" type="text" placeholder="Meeple Mountain Café" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new_venue_kind">Kind</Label>
                  <select id="new_venue_kind" name="new_venue_kind" defaultValue="public_venue" className={selectClass}>
                    <option value="public_venue">Public venue</option>
                    <option value="private_residence">Private residence</option>
                    <option value="online">Online</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex items-end pb-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      id="new_venue_is_shared"
                      name="new_venue_is_shared"
                      type="checkbox"
                      className="size-4 rounded border-input accent-primary"
                    />
                    <Label htmlFor="new_venue_is_shared" className="font-normal">
                      Save for future events
                    </Label>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_venue_address_line1">Street address</Label>
                <Input id="new_venue_address_line1" name="new_venue_address_line1" type="text" />
                <Input
                  id="new_venue_address_line2"
                  name="new_venue_address_line2"
                  type="text"
                  placeholder="Unit, floor, etc. (optional)"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new_venue_city">City</Label>
                  <Input id="new_venue_city" name="new_venue_city" type="text" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new_venue_region">State / region</Label>
                  <Input id="new_venue_region" name="new_venue_region" type="text" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new_venue_postal_code">Postal code</Label>
                  <Input id="new_venue_postal_code" name="new_venue_postal_code" type="text" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new_venue_neighborhood">Neighborhood</Label>
                  <Input id="new_venue_neighborhood" name="new_venue_neighborhood" type="text" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_venue_cross_streets">Cross streets</Label>
                <Input
                  id="new_venue_cross_streets"
                  name="new_venue_cross_streets"
                  type="text"
                  placeholder="Downing & Louisiana"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new_venue_lat">
                    Latitude <span className="font-normal text-muted-foreground">(optional, for a map pin)</span>
                  </Label>
                  <Input id="new_venue_lat" name="new_venue_lat" type="number" step="any" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new_venue_lng">
                    Longitude <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="new_venue_lng" name="new_venue_lng" type="number" step="any" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_venue_access_notes">
                  Access notes <span className="font-normal text-muted-foreground">(parking, buzzer code — attendees only)</span>
                </Label>
                <Input id="new_venue_access_notes" name="new_venue_access_notes" type="text" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_venue_website">
                  Website <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="new_venue_website" name="new_venue_website" type="url" />
              </div>
            </div>
          </details>

          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Or just describe the location without saving a venue:</p>
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="location_label">Location name</Label>
              <Input id="location_label" name="location_label" type="text" placeholder="Someone's back yard" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="neighborhood">Neighborhood</Label>
                <Input id="neighborhood" name="neighborhood" type="text" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" type="text" />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="cross_streets">Cross streets</Label>
              <Input id="cross_streets" name="cross_streets" type="text" placeholder="Downing & Louisiana" />
            </div>
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="seat_limit">
            Seat limit <span className="font-normal text-muted-foreground">(blank = unlimited)</span>
          </Label>
          <Input id="seat_limit" name="seat_limit" type="number" min="1" />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="allow_waitlist"
            name="allow_waitlist"
            type="checkbox"
            defaultChecked
            className="size-4 rounded border-input accent-primary"
          />
          <Label htmlFor="allow_waitlist" className="font-normal">
            Allow a waitlist once seats fill up
          </Label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visibility">Visibility</Label>
          <select id="visibility" name="visibility" defaultValue="public" className={selectClass}>
            <option value="public">Public — anyone can find it</option>
            <option value="unlisted">Unlisted — only people with the link</option>
            <option value="invite_only">Invite only</option>
          </select>
        </div>

        <Button type="submit" size="lg" className="w-full">
          Publish event
        </Button>
      </form>
    </PageShell>
  );
}
