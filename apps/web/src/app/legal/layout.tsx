import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isCloudMode } from '@/lib/config/app';
import { OPERATOR, fact } from './operator';
import './legal.css';

const PAGES = [
  { href: '/legal/terms', label: '用户协议' },
  { href: '/legal/privacy', label: '隐私政策' },
  { href: '/legal/refund', label: '退款政策' },
];

/**
 * The three documents a paying user is entitled to find before they pay.
 *
 * Deliberately NOT behind the beta gate. `middleware.ts` only protects
 * `/dashboard`, `/coming-soon` and `/billing`, and the root page's redirect
 * never reaches here — so these stay readable while the gate is shut, which is
 * exactly when a payment channel's reviewer or a filing check will look for
 * them.
 *
 * Self-hosted builds 404. A self-hosted instance is operated by whoever
 * deployed it: they are the data controller, their users' resumes never reach
 * us, and serving OUR privacy policy there would be a false statement made on
 * their behalf.
 */
export default async function LegalLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!isCloudMode) notFound();

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-neutral-200">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-12">
          <Link
            href="/"
            className="text-sm text-neutral-500 transition-colors hover:text-sky-400"
          >
            ← Magic Resume
          </Link>
          <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {PAGES.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                className="text-neutral-400 transition-colors hover:text-sky-400"
              >
                {page.label}
              </Link>
            ))}
          </nav>
        </header>

        <article className="legal-prose">{children}</article>

        <footer className="mt-16 border-t border-neutral-800 pt-8 text-sm text-neutral-500">
          <p>最后更新：{OPERATOR.updatedAt}</p>
          <p className="mt-2">
            运营主体：{fact(OPERATOR.legalName)}
            {OPERATOR.icpNumber ? (
              <>
                {' · '}
                <a
                  href="https://beian.miit.gov.cn"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-sky-400"
                >
                  {OPERATOR.icpNumber}
                </a>
              </>
            ) : null}
          </p>
          <p className="mt-2">
            联系我们：
            <a
              href={`mailto:${OPERATOR.supportEmail}`}
              className="transition-colors hover:text-sky-400"
            >
              {OPERATOR.supportEmail}
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
