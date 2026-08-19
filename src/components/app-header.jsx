import Link from 'next/link';
import { Bell, CalendarDays, Home, LogIn, Settings } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';

export async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-border bg-card/80">
      <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3" aria-label="Main navigation">
        <Link href="/" className="font-heading text-lg font-bold text-foreground">
          Board Game Events
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/" />}>
            <Home />
            Home
          </Button>
          <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/events" />}>
            <CalendarDays />
            Events
          </Button>
          {user ? (
            <>
              <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/notifications" />}>
                <Bell />
                Notifications
              </Button>
              <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/settings/preferences" />}>
                <Settings />
                Settings
              </Button>
              <form action={logout}>
                <Button type="submit" variant="outline" size="sm">
                  Log out
                </Button>
              </form>
            </>
          ) : (
            <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/login" />}>
              <LogIn />
              Log in
            </Button>
          )}
        </div>
      </nav>
    </header>
  );
}
