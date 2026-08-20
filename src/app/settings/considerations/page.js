import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { addConsideration } from '../actions';
import { ConsiderationCard } from '@/components/consideration-card';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SeveritySelect } from '@/components/severity-select';

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
    <>
      <div>
        <h2 className="font-heading text-xl font-bold text-foreground">Considerations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Share accessibility, dietary, sensory, or other needs that can help make game night more
          comfortable and welcoming for you.
        </p>
        <p className="mt-2 text-xs text-muted-foreground/80">
          Each item has its own visibility. Hosts of events you&rsquo;ve RSVP&rsquo;d to only ever see an
          aggregated summary. To respect your privacy, items you create here are never tied to your name.
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
              <ConsiderationCard consideration={c} />
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardContent>
          <details className="group" open={Boolean(error)}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              Add a consideration
              <Plus className="size-4 text-muted-foreground transition-transform group-open:rotate-45" />
            </summary>
            <form action={addConsideration} className="mt-4 space-y-4 border-t border-border pt-4">

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
                  Severity <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <SeveritySelect className={selectClass} />
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
                <option value="private">Private: just me</option>
                <option value="hosts_only">Hosts only</option>
                <option value="attendees">Attendees of shared events</option>
                <option value="public">Public</option>
              </select>
            </div>

            <Button type="submit">
              Add
            </Button>
            </form>
          </details>
        </CardContent>
      </Card>
    </>
  );
}
