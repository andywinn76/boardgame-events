import Link from 'next/link';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { logout } from './(auth)/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  let isAdmin = false;
  if (user) {
    const [{ data }, { data: adminRole }] = await Promise.all([
      supabase.from('profiles').select('username, display_name').eq('id', user.id).single(),
      supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
    ]);
    profile = data;
    isAdmin = Boolean(adminRole);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <Image
            src="/banner.png"
            alt=""
            width={2172}
            height={724}
            priority
            className="mb-6 h-auto w-full rounded-2xl shadow-sm shadow-primary/20"
          />
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-foreground">
            Board Game Events
          </h1>
          <p className="mt-2 text-muted-foreground">Find your next game night, or host one yourself.</p>
        </div>

        {user ? (
          <Card>
            <CardHeader>
              <CardDescription>Signed in as</CardDescription>
              <CardTitle className="text-xl">{profile?.display_name || profile?.username || user.email}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <Link href="/events" className={cn(buttonVariants({ size: 'lg' }))}>
                  Browse events
                </Link>
                <form action={logout}>
                  <Button type="submit" variant="outline" size="lg" className="w-full">
                    Log out
                  </Button>
                </form>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Link href="/settings/preferences" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  Preferences
                </Link>
                <Link href="/settings/profile" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  Profile
                </Link>
                <Link href="/settings/considerations" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  Considerations
                </Link>
              </div>
              {isAdmin && (
                <div>
                  <Badge variant="secondary" render={<Link href="/admin" />}>
                    <Sparkles />
                    Admin
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex justify-center gap-3">
            <Link href="/login" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              Log in
            </Link>
            <Link href="/signup" className={cn(buttonVariants({ size: 'lg' }))}>
              Sign up
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
