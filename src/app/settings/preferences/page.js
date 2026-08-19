import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { CalendarClock, Info } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { updatePreferences, regenerateIcsToken } from '../actions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

const KM_TO_MILES = 0.621371;

function milesFromKilometers(kilometers) {
  if (kilometers == null) return '';
  return Math.round(kilometers * KM_TO_MILES);
}

function WeightInfo({ id }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="What does board game weight mean?"
        aria-describedby={id}
        className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="size-4" />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-10 mt-2 hidden w-64 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs font-normal leading-relaxed text-background shadow-lg group-hover:block group-focus-within:block"
      >
        Board game weight describes complexity: 1 is light and easy to learn, while 5 is highly complex with heavier rules and strategy.
      </span>
    </span>
  );
}

export default async function PreferencesPage({ searchParams }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: prefs }, { data: profile }, headersList] = await Promise.all([
    supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('ics_token').eq('id', user.id).single(),
    headers(),
  ]);

  const host = headersList.get('host');
  const feedUrl = `${host?.startsWith('localhost') ? 'http' : 'https'}://${host}/api/ics/me?token=${profile?.ics_token}`;

  return (
    <>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gaming Preferences</CardTitle>
          <CardDescription>
            Optional hints hosts can use to suggest games and events you&rsquo;ll like.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updatePreferences} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="preferred_weight_min">
                    Min. Weight <span className="font-normal text-muted-foreground">(1&ndash;5)</span>
                  </Label>
                  <WeightInfo id="min-weight-help" />
                </div>
                <Input
                  id="preferred_weight_min"
                  name="preferred_weight_min"
                  type="number"
                  min="1"
                  max="5"
                  step="0.25"
                  defaultValue={prefs?.preferred_weight_min ?? ''}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="preferred_weight_max">Max. Weight</Label>
                  <WeightInfo id="max-weight-help" />
                </div>
                <Input
                  id="preferred_weight_max"
                  name="preferred_weight_max"
                  type="number"
                  min="1"
                  max="5"
                  step="0.25"
                  defaultValue={prefs?.preferred_weight_max ?? ''}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="max_playtime_minutes">
                Max playtime <span className="font-normal text-muted-foreground">(minutes)</span>
              </Label>
              <Input
                id="max_playtime_minutes"
                name="max_playtime_minutes"
                type="number"
                min="1"
                defaultValue={prefs?.max_playtime_minutes ?? ''}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="preferred_player_min">Min. Player Count</Label>
                <Input
                  id="preferred_player_min"
                  name="preferred_player_min"
                  type="number"
                  min="1"
                  defaultValue={prefs?.preferred_player_min ?? ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preferred_player_max">Max. Player Count</Label>
                <Input
                  id="preferred_player_max"
                  name="preferred_player_max"
                  type="number"
                  min="1"
                  defaultValue={prefs?.preferred_player_max ?? ''}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="travel_radius_miles">
                Travel radius <span className="font-normal text-muted-foreground">(miles)</span>
              </Label>
              <Input
                id="travel_radius_miles"
                name="travel_radius_miles"
                type="number"
                min="1"
                defaultValue={milesFromKilometers(prefs?.travel_radius_km)}
              />
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  id="teaching_ok"
                  name="teaching_ok"
                  type="checkbox"
                  defaultChecked={prefs?.teaching_ok ?? true}
                  className="size-4 rounded border-input accent-primary"
                />
                <Label htmlFor="teaching_ok" className="font-normal">
                  I&rsquo;m happy to teach newcomers
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="new_to_hobby"
                  name="new_to_hobby"
                  type="checkbox"
                  defaultChecked={prefs?.new_to_hobby ?? false}
                  className="size-4 rounded border-input accent-primary"
                />
                <Label htmlFor="new_to_hobby" className="font-normal">
                  I&rsquo;m new to the hobby
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="notify_email"
                  name="notify_email"
                  type="checkbox"
                  defaultChecked={prefs?.notify_email ?? true}
                  className="size-4 rounded border-input accent-primary"
                />
                <Label htmlFor="notify_email" className="font-normal">
                  Email me about my RSVPs
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="notify_new_nearby"
                  name="notify_new_nearby"
                  type="checkbox"
                  defaultChecked={prefs?.notify_new_nearby ?? false}
                  className="size-4 rounded border-input accent-primary"
                />
                <Label htmlFor="notify_new_nearby" className="font-normal">
                  Email me about new nearby events
                </Label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="default_share_scope">Default sharing for new considerations</Label>
              <select
                id="default_share_scope"
                name="default_share_scope"
                defaultValue={prefs?.default_share_scope || 'hosts_only'}
                className={selectClass}
              >
                <option value="private">Private — just me</option>
                <option value="hosts_only">Hosts only</option>
                <option value="attendees">Attendees of shared events</option>
                <option value="public">Public</option>
              </select>
            </div>

            <Button type="submit">
              Save preferences
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-4" />
            Calendar feed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Subscribe in Google/Apple/Outlook to keep your RSVPs synced automatically.
          </p>
          <Input readOnly defaultValue={feedUrl} className="text-xs text-muted-foreground" />
          <form action={regenerateIcsToken}>
            <Button type="submit" size="sm">
              Regenerate link
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
