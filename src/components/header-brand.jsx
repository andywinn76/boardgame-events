'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function HeaderBrand() {
  const pathname = usePathname();

  if (pathname === '/') return null;

  return (
    <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold text-foreground" aria-label="Board Game Events home">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground sm:hidden" aria-hidden="true">
        BG
      </span>
      <span className="hidden sm:inline">Board Game Events</span>
    </Link>
  );
}
