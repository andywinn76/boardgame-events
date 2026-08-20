import { CalendarPlus, ChevronDown, Download, ExternalLink } from 'lucide-react';

export function CalendarMenu({ links }) {
  return (
    <details className="group relative inline-block">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 underline underline-offset-2 [&::-webkit-details-marker]:hidden">
        <CalendarPlus className="size-3.5" />
        Add to calendar
        <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute top-full left-0 z-20 mt-2 w-52 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
        <a
          href={links.google}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center justify-between rounded-md px-2.5 py-2 no-underline hover:bg-muted"
        >
          Google Calendar
          <ExternalLink className="size-3.5 text-muted-foreground" />
        </a>
        <a
          href={links.outlook}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center justify-between rounded-md px-2.5 py-2 no-underline hover:bg-muted"
        >
          Outlook
          <ExternalLink className="size-3.5 text-muted-foreground" />
        </a>
        <a href={links.ics} className="flex items-center justify-between rounded-md px-2.5 py-2 no-underline hover:bg-muted">
          Apple / ICS file
          <Download className="size-3.5 text-muted-foreground" />
        </a>
      </div>
    </details>
  );
}
