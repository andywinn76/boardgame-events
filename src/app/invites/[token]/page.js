import { Ticket } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatEventTime } from '@/lib/dates';
import { claimInvite } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default async function InvitePage({ params, searchParams }) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: previewRows } = await supabase.rpc('preview_invite', { _token: token });
  const preview = previewRows?.[0];

  return (
    <PageShell size="sm" center className="text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Ticket className="size-6" />
      </div>

      {!preview ? (
        <>
          <h1 className="font-heading text-2xl font-bold text-foreground">Invite not found</h1>
          <p className="text-sm text-muted-foreground">This invite link is invalid or has expired.</p>
        </>
      ) : (
        <>
          <h1 className="font-heading text-2xl font-bold text-foreground">You&rsquo;re invited</h1>
          <p className="text-muted-foreground">
            {preview.event_title}
            <br />
            {formatEventTime(preview.starts_at, preview.timezone, 'EEE, MMM d, yyyy · h:mm a zzz')}
          </p>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form action={claimInvite}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" size="lg" className="w-full">
              {preview.already_claimed ? 'View event' : 'Accept invite'}
            </Button>
          </form>
        </>
      )}
    </PageShell>
  );
}
