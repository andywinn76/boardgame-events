import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveReport } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export default async function AdminReportsPage({ searchParams }) {
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
    .in('role', ['admin', 'moderator'])
    .maybeSingle();

  if (!adminRole) {
    notFound();
  }

  const { data: reports } = await supabase
    .from('reports')
    .select(
      'id, reason, created_at, resolved_at, reporter:profiles!reports_reporter_id_fkey(username), subject:profiles!reports_subject_user_fkey(username), event:events(slug, title)'
    )
    .order('resolved_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  return (
    <PageShell size="2xl">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin" className="underline underline-offset-2">
            Admin
          </Link>
        </p>
        <h1 className="font-heading text-3xl font-bold text-foreground">Reports</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!reports?.length ? (
        <p className="text-sm text-muted-foreground">No reports.</p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id}>
              <Card className={cn(!r.resolved_at && 'border-primary/40')}>
                <CardContent>
                  <p className="text-sm text-foreground">{r.reason}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Reported by {r.reporter?.username || 'someone'}
                      {r.subject ? ` about ${r.subject.username}` : ''}
                      {r.event ? (
                        <>
                          {' on '}
                          <Link href={`/events/${r.event.slug}`} className="underline underline-offset-2">
                            {r.event.title}
                          </Link>
                        </>
                      ) : (
                        ''
                      )}
                    </span>
                    {r.resolved_at && <Badge variant="secondary">Resolved</Badge>}
                  </p>
                  {!r.resolved_at && (
                    <form action={resolveReport} className="mt-2">
                      <input type="hidden" name="report_id" value={r.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Mark resolved
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
