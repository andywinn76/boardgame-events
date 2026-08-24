import Link from 'next/link';
import { login } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PasswordInput } from '@/components/password-input';

export default async function LoginPage({ searchParams }) {
  const { confirmed, error, next, reason } = await searchParams;
  const reasonMessage = {
    host: 'Log in or sign up to host an event.',
    message: 'Log in or sign up to view and post event messages.',
    report: 'Log in or sign up to report an event.',
    rsvp: 'Log in or sign up to RSVP for this event.',
  }[reason];
  const signupHref = next
    ? `/signup?next=${encodeURIComponent(next)}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`
    : '/signup';

  return (
    <PageShell size="sm" center>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Log in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {confirmed === '1' && (
            <Alert>
              <AlertDescription>Your email is confirmed. Log in to continue.</AlertDescription>
            </Alert>
          )}

          {reasonMessage && (
            <Alert>
              <AlertDescription>{reasonMessage}</AlertDescription>
            </Alert>
          )}

          <form action={login} className="space-y-4">
            {next && <input type="hidden" name="next" value={next} />}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput id="password" name="password" required autoComplete="current-password" />
            </div>
            <Button type="submit" size="lg" className="w-full">
              Log in
            </Button>
          </form>

          <p className="text-sm text-muted-foreground">
            Need an account?{' '}
            <Link href={signupHref} className="font-medium text-foreground underline underline-offset-2">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
