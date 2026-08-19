import Link from 'next/link';
import Image from 'next/image';
import { Bell, Sparkles } from 'lucide-react';
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
  let unreadCount = 0;
  let isAdmin = false;
  if (user) {
    const [{ data }, { count }, { data: adminRole }] = await Promise.all([
      supabase.from('profiles').select('username, display_name').eq('id', user.id).single(),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
      supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
    ]);
    profile = data;
    unreadCount = count || 0;
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
                <Badge variant="secondary" render={<Link href="/notifications" />}>
                  <Bell />
                  Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
                </Badge>
                <Badge variant="secondary" render={<Link href="/settings/preferences" />}>
                  Preferences
                </Badge>
                <Badge variant="secondary" render={<Link href="/settings/considerations" />}>
                  Considerations
                </Badge>
                {isAdmin && (
                  <Badge variant="secondary" render={<Link href="/admin" />}>
                    <Sparkles />
                    Admin
                  </Badge>
                )}
              </div>
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
