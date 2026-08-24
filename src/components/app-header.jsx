import Link from 'next/link';
import { Bell, CalendarDays, Home, LogIn, Settings, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { HeaderBrand } from '@/components/header-brand';

export async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-border bg-card/80">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3" aria-label="Main navigation">
        <HeaderBrand />

        <div className="ml-auto flex items-center justify-end gap-0.5 sm:gap-1">
          <Button nativeButton={false} variant="ghost" size="sm" aria-label="Home" render={<Link href="/" />}>
            <Home />
            <span className="hidden sm:inline">Home</span>
          </Button>
          <Button nativeButton={false} variant="ghost" size="sm" aria-label="Events" render={<Link href="/events" />}>
            <CalendarDays />
            <span className="hidden sm:inline">Events</span>
          </Button>
          {user ? (
            <>
              <Button nativeButton={false} variant="ghost" size="sm" aria-label="Notifications" render={<Link href="/notifications" />}>
                <Bell />
                <span className="hidden sm:inline">Notifications</span>
              </Button>
              <Button nativeButton={false} variant="ghost" size="sm" aria-label="Settings" render={<Link href="/settings/preferences" />}>
                <Settings />
                <span className="hidden sm:inline">Settings</span>
              </Button>
              <form action={logout}>
                <Button type="submit" variant="outline" size="sm">
                  Log out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/signup" />}>
                <UserPlus />
                <span className="hidden sm:inline">Sign up</span>
              </Button>
              <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/login" />}>
                <LogIn />
                Log in
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
