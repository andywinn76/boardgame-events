'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ConsiderationCard } from '@/components/consideration-card';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';

export function ConsiderationsList({ considerations, initialNotice }) {
  const [notice, setNotice] = useState(
    initialNotice ? { id: 'initial', message: initialNotice } : null,
  );

  useEffect(() => {
    if (!initialNotice) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('notice');
    url.searchParams.delete('noticeId');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [initialNotice]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function showNotice(message) {
    setNotice({ id: Date.now(), message });
  }

  return (
    <>
      {notice && (
        <Alert className="border-green-300 bg-green-100 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <AlertDescription className="px-8 text-center text-green-900 dark:text-green-200">
            {notice.message}
          </AlertDescription>
          <AlertAction>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
              className="inline-flex size-6 items-center justify-center rounded-md text-current/70 hover:bg-black/5 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
            >
              <X className="size-4" />
            </button>
          </AlertAction>
        </Alert>
      )}

      <ul className="space-y-2">
        {considerations.map((consideration) => (
          <li key={consideration.id}>
            <ConsiderationCard consideration={consideration} onNotice={showNotice} />
          </li>
        ))}
      </ul>
    </>
  );
}
