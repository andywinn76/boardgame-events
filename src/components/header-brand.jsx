'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function HeaderBrand() {
  const pathname = usePathname();

  if (pathname === '/') return null;

  return (
    <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold text-foreground" aria-label="Board Game Events home">
      <Image src="/logo-icon.png" alt="" width={36} height={36} className="size-9 rounded-lg sm:hidden" />
      <span className="hidden sm:inline">Board Game Events</span>
    </Link>
  );
}
