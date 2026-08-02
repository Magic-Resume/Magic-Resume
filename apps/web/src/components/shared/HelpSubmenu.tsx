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
import { SUPPORT_EMAIL } from "@/lib/extensions/legal";
import { cn } from "@/lib/utils";

/**
 * 账户菜单里的帮助浮层——法务文档归在这里，和「帮助中心」「报告问题」同一个抽屉。
 * （注册时的同意链接是另一回事，必须留在当场，不能收进帮助里。）
 *
 * 帮助中心入口在 `NEXT_PUBLIC_DOCS_URL` 未设置时隐藏：会 404 的菜单项比没有更糟。
 */
const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL;

const PANEL_WIDTH = 184;
/** 面板大致的最大高度（4 项 + 分隔线 + 内边距）。 */
const PANEL_HEIGHT = 190;
const GAP = 6;

type Placement = { left: number; top: number };

export function HelpSubmenu({
  menuOpen,
  onNavigate,
}: {
  /** 拥有这一行的账户菜单自身是否展开。 */
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
            // Marks this portaled node as part of the account menu, so the
            // menu's own outside-click handler does not treat a click in here
            // as a click elsewhere on the page.
            data-account-menu-flyout=""
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
            {SUPPORT_EMAIL && (
              <HelpLink
                href={`mailto:${SUPPORT_EMAIL}`}
                icon={<Bug size={15} />}
                label={t("account.menu.reportBug")}
                onNavigate={onNavigate}
              />
            )}
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
