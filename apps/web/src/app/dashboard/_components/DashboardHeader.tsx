'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AccountMenu from '@/components/shared/AccountMenu';
import { BrandMark, BrandWordmark } from './BrandMark';

/**
 * Dashboard top bar: the logo on the left, the settings menu on the right.
 *
 * It replaces a sidebar whose only destination was the resume library: one
 * link does not need a navigation column. It shares the page container
 * (`max-w-[1400px]`, same gutters) so the logo lines up with the library title
 * below it. Editor pages bring their own full-screen shell, so it steps aside
 * there the way the sidebar did.
 */
export default function DashboardHeader() {
  const pathname = usePathname();
  if (pathname.includes('/edit')) return null;

  return (
    <header className="shrink-0">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-6 md:px-12">
        <Link
          href="/dashboard"
          className="-mx-1.5 flex items-center gap-2.5 rounded-xl px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
        >
          <BrandMark size={28} />
          <BrandWordmark />
        </Link>
        <AccountMenu placement="down" />
      </div>
    </header>
  );
}
