import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { grantRole, revokeRole } from '../actions';
import { PageShell } from '@/components/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const ROLES = ['admin', 'moderator', 'host', 'player'];

const selectClass =
  'h-7 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export default async function AdminUsersPage({ searchParams }) {
  const { error } = await searchParams;
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

  const { data: users } = await supabase
    .from('profiles')
    .select('id, username, display_name, user_roles!user_roles_user_id_fkey(role)')
    .order('created_at', { ascending: false });

  return (
    <PageShell size="2xl">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin" className="underline underline-offset-2">
            Admin
          </Link>
        </p>
        <h1 className="font-heading text-3xl font-bold text-foreground">Users &amp; roles</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ul className="space-y-2">
        {users?.map((u) => {
          const roles = u.user_roles.map((r) => r.role);
          const availableRoles = ROLES.filter((r) => !roles.includes(r));
          return (
            <li key={u.id}>
              <Card>
                <CardContent>
                  <p className="text-sm font-medium text-foreground">
                    {u.display_name || u.username}
                    <span className="font-normal text-muted-foreground"> @{u.username}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {roles.map((role) => (
                      <form key={role} action={revokeRole} className={cn(badgeVariants({ variant: 'secondary' }))}>
                        {role}
                        <input type="hidden" name="user_id" value={u.id} />
                        <input type="hidden" name="role" value={role} />
                        <button
                          type="submit"
                          className="ml-0.5 text-muted-foreground hover:text-destructive"
                          aria-label={`Revoke ${role}`}
                        >
                          ×
                        </button>
                      </form>
                    ))}
                    {availableRoles.length > 0 && (
                      <form action={grantRole} className="flex items-center gap-1.5">
                        <input type="hidden" name="user_id" value={u.id} />
                        <select name="role" className={selectClass}>
                          {availableRoles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" size="xs" variant="outline">
                          Grant
                        </Button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
