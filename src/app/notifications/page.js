import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { markNotificationRead, markAllNotificationsRead } from './actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function describe(notification) {
  const title = notification.event?.title || 'an event';
  switch (notification.type) {
    case 'promoted_from_waitlist':
      return `You're off the waitlist and going to ${title}.`;
    case 'event_cancelled':
      return `${title} was cancelled.`;
    default:
      return `Update for ${title}.`;
  }
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, type, payload, read_at, created_at, event:events(slug, title)')
    .order('created_at', { ascending: false });

  const hasUnread = notifications?.some((n) => !n.read_at);

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl font-bold text-foreground">Notifications</h1>
        {hasUnread && (
          <form action={markAllNotificationsRead}>
            <Button type="submit" variant="ghost" size="sm">
              Mark all read
            </Button>
          </form>
        )}
      </div>

      {!notifications?.length ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Card className={cn(!n.read_at && 'border-primary/40')}>
                <CardContent className="flex items-center justify-between gap-3 text-sm">
                  <span className={n.read_at ? 'text-muted-foreground' : 'font-medium text-foreground'}>
                    {n.event?.slug ? (
                      <Link href={`/events/${n.event.slug}`} className="underline underline-offset-2">
                        {describe(n)}
                      </Link>
                    ) : (
                      describe(n)
                    )}
                  </span>
                  {!n.read_at && (
                    <form action={markNotificationRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="shrink-0 text-xs font-medium text-primary underline underline-offset-2">
                        Mark read
                      </button>
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
