import { MailCheck } from 'lucide-react';
import { PageShell } from '@/components/page-shell';

export default function CheckEmailPage() {
  return (
    <PageShell size="sm" center className="text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <MailCheck className="size-6" />
      </div>
      <h1 className="font-heading text-2xl font-bold text-foreground">Check your email</h1>
      <p className="text-sm text-muted-foreground">
        We sent a confirmation link. Follow it to finish creating your account.
      </p>
    </PageShell>
  );
}
