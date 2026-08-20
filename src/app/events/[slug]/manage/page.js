import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Users, HeartHandshake, ShieldCheck, Mail, PartyPopper } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  addCohost,
  removeCohost,
  createInvite,
  cancelEvent,
  completeEvent,
  setCheckin,
  setNoShow,
} from '../../actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

const KIND_LABEL = {
  vision: 'Vision',
  hearing: 'Hearing',
  mobility: 'Mobility',
  allergy: 'Allergy',
  dietary: 'Dietary',
  sensory: 'Sensory',
  other: 'Other',
};

const RSVP_STATUS_LABEL = {
  going: 'Going',
  waitlist: 'Waitlist',
  maybe: 'Maybe',
};

export default async function ManageEventPage({ params, searchParams }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, visibility, status, cancellation_reason')
    .eq('slug', slug)
    .single();

  if (!event) {
    notFound();
  }

  const { data: hostRow } = await supabase
    .from('event_hosts')
    .select('role')
    .eq('event_id', event.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!hostRow) {
    notFound();
  }

  const isOwner = hostRow.role === 'owner';
  const isActive = event.status === 'published';

  const [
    { data: seatCounts },
    { data: digest },
    { data: roster },
    { data: hosts },
    { data: invites },
  ] = await Promise.all([
    supabase.rpc('event_seat_count', { _event: event.id }).single(),
    // Pre-aggregated by event_considerations_digest() -- never the raw per-person rows.
    supabase.rpc('event_considerations_digest', { _event: event.id }),
    supabase
      .from('rsvps')
      .select('user_id, status, seats_claimed, checked_in_at, no_show, profiles(username, display_name)')
      .eq('event_id', event.id)
      .in('status', ['going', 'waitlist', 'maybe'])
      .order('created_at', { ascending: true }),
    supabase
      .from('event_hosts')
      .select('user_id, role, profiles(username, display_name)')
      .eq('event_id', event.id)
      .order('added_at', { ascending: true }),
    event.visibility === 'invite_only'
      ? supabase
          .from('event_invites')
          .select('id, email, token, claimed_by, created_at')
          .eq('event_id', event.id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const goingUserIds = (roster || []).filter((r) => r.status === 'going').map((r) => r.user_id);
  const { data: reliability } = goingUserIds.length
    ? await supabase.from('attendee_reliability').select('user_id, attended, no_shows').in('user_id', goingUserIds)
    : { data: [] };
  const reliabilityByUser = Object.fromEntries((reliability || []).map((r) => [r.user_id, r]));

  return (
    <PageShell size="2xl">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/events/${event.slug}`} className="underline underline-offset-2">
            {event.title}
          </Link>
        </p>
        <h1 className="font-heading text-3xl font-bold text-foreground">Host console</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {event.status === 'cancelled' && (
        <Alert variant="destructive">
          <AlertDescription>This event is cancelled. Reason: {event.cancellation_reason}</AlertDescription>
        </Alert>
      )}
      {event.status === 'completed' && (
        <Alert>
          <AlertDescription>This event is marked completed.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4" />
          {seatCounts?.seats_taken ?? 0} confirmed
          {seatCounts?.seats_left != null ? ` · ${seatCounts.seats_left} seats left` : ''}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Roster</CardTitle>
        </CardHeader>
        <CardContent>
          {!roster?.length ? (
            <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
          ) : (
            <ul className="space-y-3">
              {roster.map((r) => {
                const rel = reliabilityByUser[r.user_id];
                return (
                  <li key={r.user_id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-foreground">{r.profiles?.display_name || r.profiles?.username}</span>
                      <Badge variant="secondary">{RSVP_STATUS_LABEL[r.status]}</Badge>
                      {r.seats_claimed > 1 && <Badge variant="secondary">{r.seats_claimed} seats</Badge>}
                      {r.checked_in_at && <Badge className="bg-success text-success-foreground">Checked in</Badge>}
                      {r.no_show && <Badge variant="destructive">No-show</Badge>}
                      {rel && (rel.attended > 0 || rel.no_shows > 0) && (
                        <span className="text-xs text-muted-foreground">
                          ({rel.attended} attended{rel.no_shows > 0 ? `, ${rel.no_shows} no-show` : ''})
                        </span>
                      )}
                    </div>
                    {r.status === 'going' && isActive && (
                      <span className="flex shrink-0 gap-3">
                        <form action={setCheckin}>
                          <input type="hidden" name="event_id" value={event.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="user_id" value={r.user_id} />
                          <input type="hidden" name="checked_in" value={(!r.checked_in_at).toString()} />
                          <button type="submit" className="text-xs font-medium text-primary underline underline-offset-2">
                            {r.checked_in_at ? 'Undo check-in' : 'Check in'}
                          </button>
                        </form>
                        <form action={setNoShow}>
                          <input type="hidden" name="event_id" value={event.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="user_id" value={r.user_id} />
                          <input type="hidden" name="no_show" value={(!r.no_show).toString()} />
                          <button type="submit" className="text-xs font-medium text-primary underline underline-offset-2">
                            {r.no_show ? 'Unmark no-show' : 'Mark no-show'}
                          </button>
                        </form>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <HeartHandshake className="size-4" />
            Considerations digest
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">Aggregated across the confirmed roster and never tied to a name.</p>

          {!digest?.length ? (
            <p className="text-sm text-muted-foreground">Nothing shared yet.</p>
          ) : (
            <ul className="space-y-1">
              {digest.map((item) => (
                <li key={`${item.kind}-${item.label}`} className="text-sm text-foreground">
                  <span className="font-medium">{item.attendee_count}</span>{' '}
                  {item.attendee_count === 1 ? 'attendee' : 'attendees'}: {item.label}
                  <span className="text-muted-foreground"> ({KIND_LABEL[item.kind]})</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" />
            Co-hosts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1.5">
            {hosts?.map((h) => (
              <li key={h.user_id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">{h.profiles?.display_name || h.profiles?.username}</span>
                  <Badge variant="outline">{h.role}</Badge>
                </span>
                {isOwner && h.role === 'cohost' && (
                  <form action={removeCohost}>
                    <input type="hidden" name="event_id" value={event.id} />
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="user_id" value={h.user_id} />
                    <button type="submit" className="text-xs font-medium text-destructive underline underline-offset-2">
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>

          {isOwner && (
            <form action={addCohost} className="flex gap-2">
              <input type="hidden" name="event_id" value={event.id} />
              <input type="hidden" name="slug" value={slug} />
              <Input name="username" type="text" required placeholder="username" className="flex-1" />
              <Button type="submit">Add co-host</Button>
            </form>
          )}
        </CardContent>
      </Card>

      {event.visibility === 'invite_only' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="size-4" />
              Invites
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              This event is invite-only. Share a claim link with the people you want there.
            </p>

            {invites?.length > 0 && (
              <ul className="space-y-2">
                {invites.map((invite) => (
                  <li key={invite.id} className="text-sm">
                    <span className="block truncate text-foreground">/invites/{invite.token}</span>
                    <span className="text-xs text-muted-foreground">
                      {invite.email ? `${invite.email} · ` : ''}
                      {invite.claimed_by ? 'Claimed' : 'Pending'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <form action={createInvite} className="flex gap-2">
              <input type="hidden" name="event_id" value={event.id} />
              <input type="hidden" name="slug" value={slug} />
              <Input name="email" type="email" placeholder="email (optional)" className="flex-1" />
              <Button type="submit">Create invite</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isActive && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <PartyPopper className="size-4" />
              Wrap up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <form action={completeEvent}>
              <input type="hidden" name="event_id" value={event.id} />
              <input type="hidden" name="slug" value={slug} />
              <Button type="submit" variant="outline">
                Mark event completed
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              If anyone was checked in, everyone else still &ldquo;going&rdquo; gets marked a no-show.
            </p>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            <form action={cancelEvent} className="space-y-2">
              <input type="hidden" name="event_id" value={event.id} />
              <input type="hidden" name="slug" value={slug} />
              <Label htmlFor="reason">Cancel this event</Label>
              <Textarea id="reason" name="reason" required rows={2} placeholder="Reason (shown to everyone who RSVP'd)" />
              <Button type="submit" variant="destructive">
                Cancel event
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}
    </PageShell>
  );
}
