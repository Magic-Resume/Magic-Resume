"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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
import { cn } from "@/lib/utils";

/**
 * The help fly-out on the account menu.
 *
 * This is where the policy documents belong in the product. They are not a
 * feature anyone goes looking for in settings; they are reference material you
 * reach for when something is wrong or you want to check what you agreed to —
 * the same drawer as "help centre" and "report a bug".
 *
 * (The consent links at sign-up are a separate thing and stay there: those have
 * to be in front of someone at the moment they agree, not filed under help.)
 *
 * The help centre entry is hidden unless `NEXT_PUBLIC_DOCS_URL` is set. The docs
 * site has no committed domain yet, and a menu item that 404s is worse than one
 * that is not there — same rule as the unfilled facts in `legal/operator.ts`.
 */
const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL;

const PANEL_WIDTH = 184;
/** Roughly the tallest the panel gets (4 items + a divider + padding). */
const PANEL_HEIGHT = 190;
const GAP = 6;

type Placement = { left: number; top: number };

export function HelpSubmenu({
  menuOpen,
  onNavigate,
}: {
  /** Whether the account menu that owns this row is itself open. */
  menuOpen: boolean;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Fixed coordinates measured from the trigger, not `absolute right-full`.
   *
   * The account panel is itself portaled to <body> and anchored to the avatar,
   * which lives in the left sidebar — so a fly-out pinned to the panel's left
   * edge opened off-screen. It looked like the menu was dead; it was rendering
   * at a negative x. Measuring means the side is decided by where there is
   * room, and the same component works whichever edge the avatar sits on.
   */
  const place = React.useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const roomRight = window.innerWidth - rect.right - GAP;
    const left =
      roomRight >= PANEL_WIDTH
        ? rect.right + GAP
        : Math.max(GAP, rect.left - PANEL_WIDTH - GAP);
    // Prefer top-aligned with the row; lift it when that would run off the
    // bottom, which it does whenever the account menu opens upward.
    const top = Math.max(
      GAP,
      Math.min(rect.top, window.innerHeight - PANEL_HEIGHT - GAP),
    );
    setPlacement({ left, top });
  }, []);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  // A short close delay so the pointer can cross the gap between the trigger
  // and the panel without the panel vanishing underneath it.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPlacement(null), 140);
  };
  React.useEffect(() => cancelClose, []);

  // The account menu closing takes this with it. Without this the fly-out is
  // portaled to <body>, so it would survive its own parent and sit on screen
  // pointing at a menu that is no longer there.
  React.useEffect(() => {
    if (!menuOpen) setPlacement(null);
  }, [menuOpen]);

  // Same reason the parent needs one: this panel is not inside the account
  // panel's DOM, so the parent's outside-click check cannot see it, and a click
  // meant for the page must not leave it hanging.
  React.useEffect(() => {
    if (placement === null) return;
    const onMouseDown = (e: MouseEvent) => {
      const node = e.target as Node;
      if (triggerRef.current?.contains(node) || panelRef.current?.contains(node)) return;
      setPlacement(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPlacement(null);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [placement]);

  const open = placement !== null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseEnter={() => {
          cancelClose();
          place();
        }}
        onMouseLeave={scheduleClose}
        onFocus={place}
        onClick={() => (open ? setPlacement(null) : place())}
        className={cn(
          "group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40",
          open
            ? "bg-white/[0.06] text-white"
            : "text-neutral-300 hover:bg-white/[0.06] hover:text-white",
        )}
      >
        <span className="shrink-0 text-neutral-500 transition-colors group-hover:text-neutral-300">
          <LifeBuoy size={16} />
        </span>
        {t("account.menu.help")}
        <ChevronRight size={16} className="ml-auto shrink-0 text-neutral-500" />
      </button>

      {/* Portaled to <body>, like the account panel itself.
          `position: fixed` resolves against the nearest transformed ancestor,
          and that panel is a motion.div with a scale/translate animation — so a
          fixed child left inside it would be positioned relative to the panel
          rather than the viewport, and land nowhere near the coordinates we
          just measured. */}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              position: "fixed",
              left: placement.left,
              top: placement.top,
              width: PANEL_WIDTH,
              // Above the account panel's own 9999 — it is a child of that menu
              // and must never render behind it.
              zIndex: 10000,
            }}
            className="rounded-xl border border-white/[0.08] bg-desk/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
          >
            {DOCS_URL && (
              <HelpLink
                href={DOCS_URL}
                icon={<HelpCircle size={15} />}
                label={t("account.menu.helpCenter")}
                onNavigate={onNavigate}
              />
            )}
            <HelpLink
              href="/legal/terms"
              icon={<FileText size={15} />}
              label={t("account.menu.terms")}
              onNavigate={onNavigate}
            />
            <HelpLink
              href="/legal/privacy"
              icon={<Shield size={15} />}
              label={t("account.menu.privacy")}
              onNavigate={onNavigate}
            />
            <div className="mx-1 my-1 h-px bg-white/[0.06]" />
            <HelpLink
              href={`mailto:${OPERATOR.supportEmail}`}
              icon={<Bug size={15} />}
              label={t("account.menu.reportBug")}
              onNavigate={onNavigate}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

function HelpLink({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  // Reference material opens in a new tab: someone checking the refund policy
  // mid-edit should not lose what they were doing.
  return (
    <Link
      href={href}
      role="menuitem"
      target="_blank"
      rel="noreferrer"
      onClick={onNavigate}
      className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
    >
      <span className="shrink-0 text-neutral-500 transition-colors group-hover:text-neutral-300">
        {icon}
      </span>
      {label}
    </Link>
  );
}
