'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useReducedMotion } from 'framer-motion';
import { FileText, ChevronLeft } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import AccountMenu from '@/components/shared/AccountMenu';
import { BrandMark, BrandWordmark } from './BrandMark';
import {
  HoverSurface,
  useHoverSurface,
  type HoverSurfaceBinding,
} from '@/components/ui/hover-surface';

const RAIL_WIDTH = 60;
const PANEL_WIDTH = 232;
const STORAGE_KEY = 'dashboard:sidebar-collapsed';
const EASE = 'var(--narrate-ease)';
const DUR = 300;

/**
 * Top-level navigation — one nav model, two forms that morph smoothly between a
 * 232px labelled panel and a 60px icon rail. The morph is the point: icons live in
 * fixed 36px columns so they never jump; only the panel width and the label
 * reveals animate, and they share the same 300ms curve so everything moves as one.
 * Collapse preference persists; the first paint is transition-free (no collapse
 * animation on load) and stilled under reduced-motion. Editor pages own their
 * OutlineRail, so this returns null there.
 *
 * The animated `transition` is applied via inline style (not Tailwind arbitrary
 * classes, which can't be generated from runtime-interpolated strings).
 */
export default function DashboardSidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();

  /* 导航高亮：一块共享的面在各项之间滑动。activeKey 用 href，和 bind() 那边同一套值。 */
  const navActiveKey = pathname === '/dashboard' ? '/dashboard' : null;
  const navSurface = useHoverSurface({ activeKey: navActiveKey });
  const reduce = useReducedMotion();

  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [animReady, setAnimReady] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true);
    } catch {
      /* ignore */
    }
    // Enable transitions only after the initial (persisted) state has painted, so
    // reloading with a collapsed pref doesn't animate the collapse on load.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimReady(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });

  // 编辑器自带全屏外壳。父级 dashboard/layout 是复合的，挡不住侧栏，
  // 所以由侧栏自己按路由隐身——这是这个仓库既有的做法。
  if (pathname.includes('/edit')) return null;

  const anim = animReady && !reduce;
  const labelStyle: React.CSSProperties | undefined = anim
    ? { transition: `max-width ${DUR}ms ${EASE}, opacity ${DUR}ms ${EASE}` }
    : undefined;
  // i18n labels resolve client-side; keep them empty until mount so SSR and the
  // first client render agree (icons are language-independent and render on both).
  const label = (key: string) => (mounted ? t(key) : undefined);

  return (
    <aside
      className="group relative z-30 h-full shrink-0 border-r border-mr-line-soft bg-desk"
      style={{
        width: collapsed ? RAIL_WIDTH : PANEL_WIDTH,
        transition: anim ? `width ${DUR}ms ${EASE}` : undefined,
      }}
    >
      <div className="flex h-full flex-col overflow-hidden px-3 py-4">
        {/* brand */}
        <Link
          href="/dashboard"
          aria-label={label('common.logoAlt')}
          className="flex items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
        >
          <span className="grid w-9 shrink-0 place-items-center">
            <BrandMark size={28} />
          </span>
          <span
            className={cn('overflow-hidden pl-2', collapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100')}
            style={labelStyle}
          >
            <BrandWordmark />
          </span>
        </Link>

        <div className="my-4 h-px bg-mr-surface-soft" />

        {/*
          nav。高亮不再由每一项各自的 hover 底承担，而是下面这一块共享的面在项与项
          之间滑动（见 `useHoverSurface`）——指针快速划过时读到的是连续位移，不是
          一串闪烁。没在 hover 时它停在当前页那一项上，并借 `data-on-active` 换成
          品牌色底；选中项的 sky 文字色始终在，所以面滑走时「我在哪一页」不会丢。
        */}
        <nav className="relative flex flex-col gap-1" {...navSurface.containerProps}>
          <HoverSurface
            {...navSurface.surfaceProps}
            className="rounded-xl bg-mr-surface-muted data-[on-active]:bg-sky-400/10"
          />
          <NavItem
            surface={navSurface.bind('/dashboard')}
            href="/dashboard"
            label={label('sidebar.resumes')}
            active={pathname === '/dashboard'}
            icon={<FileText size={18} />}
            collapsed={collapsed}
            labelStyle={labelStyle}
          />
        </nav>

        <div className="flex-1" />

        {/* settings, help and language live behind the avatar menu */}
        <div className="h-px bg-mr-surface-soft" />
        <div className="mt-3">
          <AccountMenu placement={collapsed ? 'right' : 'up'} />
        </div>
      </div>

      {/* hover-revealed edge toggle — floats on the divider seam, tracks the animating edge */}
      <button
        type="button"
        onClick={toggle}
        aria-label={label(collapsed ? 'common.expand' : 'common.collapse')}
        className="absolute right-0 top-[76px] z-40 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-neutral-900 text-neutral-400 opacity-0 shadow-md shadow-black/50 transition-opacity duration-200 hover:text-sky-300 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 group-hover:opacity-100"
      >
        <ChevronLeft className={cn('h-3.5 w-3.5 transition-transform duration-300', collapsed && 'rotate-180')} />
      </button>
    </aside>
  );
}

/** One nav destination. Icon lives in a fixed 36px column (never moves); the label
 *  slides open/closed via max-width so the collapsed pill sizes to the icon alone. */
function NavItem({
  href,
  label,
  active,
  icon,
  collapsed,
  labelStyle,
  dot = false,
  surface,
}: {
  href: string;
  label?: string;
  active: boolean;
  icon: React.ReactNode;
  collapsed: boolean;
  labelStyle?: React.CSSProperties;
  dot?: boolean;
  /** `useHoverSurface().bind(key)` 的返回值。底交给共享面，这一项自己不带。 */
  surface?: HoverSurfaceBinding;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-label={label}
      {...surface}
      className={cn(
        // 没有 hover 底、没有选中底——两者都由 nav 上那块共享面承担。这里只剩
        // 文字和图标的换色，以及焦点环。
        'group/nav relative flex h-9 items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40',
      )}
    >
      <span
        className={cn(
          'relative z-[1] grid w-9 shrink-0 place-items-center transition-colors duration-150',
          active ? 'text-sky-300' : 'text-neutral-500 group-hover/nav:text-neutral-200',
        )}
      >
        {icon}
        {dot && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-sky-400 ring-2 ring-desk" />}
      </span>
      <span
        className={cn(
          'relative z-[1] overflow-hidden whitespace-nowrap pl-1 text-sm',
          collapsed ? 'max-w-0 opacity-0' : 'max-w-[150px] opacity-100',
          active ? 'text-sky-200' : 'text-neutral-400 group-hover/nav:text-neutral-100',
        )}
        style={labelStyle}
      >
        {/* 文案要等挂载后才由 i18n 解析出来（见 `label()`）。这段空窗里画一条骨架，
            而不是留空：一个没有标签的孤零零图标，和右侧主区域的骨架屏并排时更像
            渲染坏了而不是在加载。 */}
        {label ?? (
          <span
            aria-hidden
            className="my-1 block h-3 w-16 animate-pulse rounded bg-mr-surface-soft"
          />
        )}
      </span>
    </Link>
  );
}
