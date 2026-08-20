'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CalendarFeedControls({ feedUrl }) {
  const [copied, setCopied] = useState(false);

  async function copyFeedUrl() {
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={feedUrl} aria-label="Personal calendar subscription URL" className="min-w-0 text-xs text-muted-foreground" />
      <Button type="button" size="sm" variant="outline" onClick={copyFeedUrl} className="shrink-0">
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? 'Copied' : 'Copy URL'}
      </Button>
    </div>
  );
}
