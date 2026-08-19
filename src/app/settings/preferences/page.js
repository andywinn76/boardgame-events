import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { updatePreferences, regenerateIcsToken } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

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
    <PageShell>
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Matching preferences</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional hints hosts can use to suggest games and events you&rsquo;ll like.{' '}
          <Link href="/settings/considerations" className="underline underline-offset-2">
            Manage accessibility &amp; dietary considerations
          </Link>{' '}
          separately.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <form action={updatePreferences} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="preferred_weight_min">
                  Weight min <span className="font-normal text-muted-foreground">(1&ndash;5)</span>
                </Label>
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
                <Label htmlFor="preferred_weight_max">Weight max</Label>
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
                <Label htmlFor="preferred_player_min">Player count min</Label>
                <Input
                  id="preferred_player_min"
                  name="preferred_player_min"
                  type="number"
                  min="1"
                  defaultValue={prefs?.preferred_player_min ?? ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preferred_player_max">Player count max</Label>
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
              <Label htmlFor="travel_radius_km">
                Travel radius <span className="font-normal text-muted-foreground">(km)</span>
              </Label>
              <Input
                id="travel_radius_km"
                name="travel_radius_km"
                type="number"
                min="1"
                defaultValue={prefs?.travel_radius_km ?? ''}
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

            <Button type="submit" size="lg" className="w-full">
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
            <Button type="submit" variant="outline" size="sm">
              Regenerate link
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
