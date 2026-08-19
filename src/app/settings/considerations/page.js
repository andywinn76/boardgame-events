import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { addConsideration, deleteConsideration } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

const VISIBILITY_LABEL = {
  private: 'Private — just me',
  hosts_only: 'Hosts only',
  attendees: 'Attendees of shared events',
  public: 'Public',
};

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

export default async function ConsiderationsPage({ searchParams }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: considerations } = await supabase
    .from('user_considerations')
    .select('id, kind, label, details, severity, visibility')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <PageShell>
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Accessibility &amp; dietary considerations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each item has its own visibility. Hosts of events you&rsquo;ve RSVP&rsquo;d to only ever see an
          aggregated, de-duplicated summary — never a list tied to your name.{' '}
          <Link href="/settings/preferences" className="underline underline-offset-2">
            Matching preferences
          </Link>{' '}
          live separately.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {considerations?.length > 0 && (
        <ul className="space-y-2">
          {considerations.map((c) => (
            <li key={c.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.label}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{c.kind}</Badge>
                      <Badge variant="outline">{VISIBILITY_LABEL[c.visibility]}</Badge>
                      {c.severity && <Badge variant="outline">severity {c.severity}</Badge>}
                    </div>
                    {c.details && <p className="mt-1.5 text-sm text-muted-foreground">{c.details}</p>}
                  </div>
                  <form action={deleteConsideration}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="shrink-0 text-sm font-medium text-destructive underline underline-offset-2">
                      Remove
                    </button>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardContent>
          <form action={addConsideration} className="space-y-4">
            <h2 className="text-sm font-medium text-foreground">Add a consideration</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="kind">Kind</Label>
                <select id="kind" name="kind" defaultValue="other" className={selectClass}>
                  <option value="vision">Vision</option>
                  <option value="hearing">Hearing</option>
                  <option value="mobility">Mobility</option>
                  <option value="allergy">Allergy</option>
                  <option value="dietary">Dietary</option>
                  <option value="sensory">Sensory</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="severity">
                  Severity <span className="font-normal text-muted-foreground">(optional, 1&ndash;3)</span>
                </Label>
                <select id="severity" name="severity" defaultValue="" className={selectClass}>
                  <option value="">Not set</option>
                  <option value="1">1 — mild</option>
                  <option value="2">2 — moderate</option>
                  <option value="3">3 — severe</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="label">Label</Label>
              <Input id="label" name="label" type="text" required placeholder="Tree nuts" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="details">
                Details <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="details" name="details" type="text" placeholder="Avoid red/green player colors" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="visibility">Visibility</Label>
              <select id="visibility" name="visibility" defaultValue="hosts_only" className={selectClass}>
                <option value="private">Private — just me</option>
                <option value="hosts_only">Hosts only</option>
                <option value="attendees">Attendees of shared events</option>
                <option value="public">Public</option>
              </select>
            </div>

            <Button type="submit" size="lg" className="w-full">
              Add
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
