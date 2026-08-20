import Link from 'next/link';
import { signup } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default async function SignupPage({ searchParams }) {
  const { error } = await searchParams;

  return (
    <PageShell size="sm" center>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Sign up</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form action={signup} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" name="first_name" type="text" required maxLength={80} autoComplete="given-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">
                  Last name <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="last_name" name="last_name" type="text" maxLength={80} autoComplete="family-name" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={6} />
            </div>
            <Button type="submit" size="lg" className="w-full">
              Sign up
            </Button>
          </form>

          <p className="text-sm text-muted-foreground">
            You&apos;ll get a placeholder username to start. Set your real one from settings after you
            confirm your email.
          </p>

          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-foreground underline underline-offset-2">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
