'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';

export function DismissibleNotice({ children }) {
  const [visible, setVisible] = useState(true);

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
