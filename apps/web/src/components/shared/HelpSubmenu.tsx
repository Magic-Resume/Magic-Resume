"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bug,
  ChevronRight,
  FileText,
  HelpCircle,
  LifeBuoy,
  Shield,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { OPERATOR } from "@/app/legal/operator";

/**
 * The help fly-out on the account menu.
 *
 * This is where the policy documents belong in the product. They are not a
 * feature anyone goes looking for in settings; they are reference material you
 * reach for when something is wrong or you want to check what you agreed to —
 * which is the same drawer as "help centre" and "report a bug".
 *
 * (The consent links at sign-up are a separate thing and stay there: those have
 * to be in front of someone at the moment they agree, not filed under help.)
 *
 * The help centre entry is hidden unless `NEXT_PUBLIC_DOCS_URL` is set. The docs
 * site has no committed domain yet, and a menu item that 404s is worse than one
 * that is not there — same rule as the unfilled facts in `legal/operator.ts`.
 */
const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL;

export function HelpSubmenu({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // A short close delay so the pointer can cross the gap between the trigger
  // and the panel without the panel vanishing underneath it.
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  React.useEffect(() => cancelClose, []);

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
      >
        <span className="shrink-0 text-neutral-500 transition-colors group-hover:text-neutral-300">
          <LifeBuoy size={16} />
        </span>
        {t("account.menu.help")}
        <ChevronRight size={16} className="ml-auto shrink-0 text-neutral-500" />
      </button>

      {open && (
        <div
          role="menu"
          // Opens to the left: the account menu already sits at the right edge
          // of the viewport, so a right-hand fly-out would land off-screen.
          className="absolute right-full top-0 z-10 mr-1 w-[184px] rounded-xl border border-white/[0.08] bg-[#141414] p-1.5 shadow-2xl shadow-black/60"
        >
          {DOCS_URL && (
            <HelpLink
              href={DOCS_URL}
              external
              icon={<HelpCircle size={15} />}
              label={t("account.menu.helpCenter")}
              onNavigate={onNavigate}
            />
          )}
          <HelpLink
            href="/legal/terms"
            external
            icon={<FileText size={15} />}
            label={t("account.menu.terms")}
            onNavigate={onNavigate}
          />
          <HelpLink
            href="/legal/privacy"
            external
            icon={<Shield size={15} />}
            label={t("account.menu.privacy")}
            onNavigate={onNavigate}
          />
          <div className="mx-1 my-1 h-px bg-white/[0.06]" />
          <HelpLink
            href={`mailto:${OPERATOR.supportEmail}`}
            external
            icon={<Bug size={15} />}
            label={t("account.menu.reportBug")}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
}

function HelpLink({
  href,
  icon,
  label,
  external,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
  onNavigate: () => void;
}) {
  const className =
    "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40";
  const body = (
    <>
      <span className="shrink-0 text-neutral-500 transition-colors group-hover:text-neutral-300">
        {icon}
      </span>
      {label}
    </>
  );

  // Reference material opens in a new tab: someone checking the refund policy
  // mid-task should not lose what they were doing.
  return (
    <Link
      href={href}
      role="menuitem"
      className={className}
      onClick={onNavigate}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {body}
    </Link>
  );
}
