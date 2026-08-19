import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Users, CalendarDays, Flag, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { Card } from '@/components/ui/card';

const LINKS = [
  { href: '/admin/users', label: 'Users & roles', icon: Users },
  { href: '/admin/events', label: 'Events', icon: CalendarDays },
  { href: '/admin/reports', label: 'Reports', icon: Flag },
];

export default async function AdminPage() {
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
    .eq('role', 'admin')
    .maybeSingle();

  if (!adminRole) {
    notFound();
  }

  return (
    <PageShell size="md">
      <h1 className="font-heading text-3xl font-bold text-foreground">Admin</h1>
      <ul className="space-y-2">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Card className="transition-colors hover:border-primary/40">
              <Link href={href} className="flex items-center justify-between gap-2 px-(--card-spacing)">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <Icon className="size-4 text-muted-foreground" />
                  {label}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
