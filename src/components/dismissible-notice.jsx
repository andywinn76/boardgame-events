'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';

export function DismissibleNotice({ children, clearParams = [] }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    clearParams.forEach((param) => {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        changed = true;
      }
    });
    if (changed) window.history.replaceState(window.history.state, '', url);
  }, [clearParams]);

  if (!visible) return null;

  return (
    <Alert className="border-primary/40 bg-primary/5 pr-10 text-primary">
      <AlertDescription className="font-medium text-primary">{children}</AlertDescription>
      <AlertAction>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss message"
          className="flex size-6 items-center justify-center rounded-md text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </AlertAction>
    </Alert>
  );
}
