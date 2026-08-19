import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatEventTime } from '@/lib/dates';
import { adminCancelEvent } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default async function AdminEventsPage({ searchParams }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!adminRole) {
    notFound();
  }

  const { data: events } = await supabase
    .from('events')
    .select(
      'id, slug, title, status, visibility, starts_at, timezone, profiles!events_created_by_fkey(username, display_name)'
    )
    .order('starts_at', { ascending: false });

  return (
    <PageShell size="2xl">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin" className="underline underline-offset-2">
            Admin
          </Link>
        </p>
        <h1 className="font-heading text-3xl font-bold text-foreground">Events</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ul className="space-y-2">
        {events?.map((e) => (
          <li key={e.id}>
            <Card>
              <CardContent>
                <p className="text-sm font-medium text-foreground">
                  <Link href={`/events/${e.slug}`} className="underline underline-offset-2">
                    {e.title}
                  </Link>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{formatEventTime(e.starts_at, e.timezone)}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{e.status}</Badge>
                  <Badge variant="outline">{e.visibility}</Badge>
                  <span className="text-xs text-muted-foreground">
                    hosted by {e.profiles?.display_name || e.profiles?.username}
                  </span>
                </div>

                {e.status === 'published' && (
                  <form action={adminCancelEvent} className="mt-3 flex gap-2">
                    <input type="hidden" name="event_id" value={e.id} />
                    <Input name="reason" type="text" required placeholder="Cancellation reason" className="flex-1" />
                    <Button type="submit" variant="destructive" size="sm">
                      Cancel event
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
