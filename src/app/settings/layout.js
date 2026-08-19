import { PageShell } from '@/components/page-shell';
import { SettingsTabs } from '@/components/settings-tabs';

export default function SettingsLayout({ children }) {
  return (
    <PageShell>
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Settings</h1>
        <SettingsTabs />
      </div>
      {children}
    </PageShell>
  );
}
