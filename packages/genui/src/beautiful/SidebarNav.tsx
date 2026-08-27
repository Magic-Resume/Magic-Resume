"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * SIDEBAR NAV — 工作区导航：分组条目 + 滑动高亮 + 搜索。
 *
 * 原版是自演示 demo：条目写死成 Home/Agent tasks/Inbox/Suppliers/Inventory，
 * 图标按 key 查一张内置的 path 表（加条目必须同时改那张表），徽章数字点一下加一、
 * 搜索框存了 query 却从不过滤。这里全部换成 props——**图标由调用方给 ReactNode**，
 * 组件不再拥有一张必须同步的图标表。
 *
 * 保留的是它真正值钱的东西：那块跟着 hover/active 位移的高亮（220ms 缓动），
 * 以及分组标题的排版。
 * ───────────────────────────────────────────────────────── */

export interface SidebarItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** 右侧计数徽章。 */
  badge?: string | number;
  /** 悬停才显形的「新建」小按钮。 */
  onAdd?: () => void;
  /**
   * 替掉纯文本 `label` 的渲染。`label` 仍必填，继续承担 `title` 与读屏。
   * 用途之一：删除确认时把整行文案换成「删掉这条？」。
   */
  labelNode?: ReactNode;
  /**
   * 行尾控件（删除按钮、确认时的取消/确认两颗）。
   *
   * 做成插槽而不是 `onDelete` 回调：确认交互的形态各家不同——我们的是**行内变形**
   * 而不是弹模态，那不是一个布尔量能表达的。
   */
  trailing?: ReactNode;
}

export interface SidebarSection {
  key: string;
  /** 分组标题；不给就不画标题，直接排条目。 */
  label?: string;
  items: SidebarItem[];
}

export interface SidebarNavProps {
  sections: SidebarSection[];
  activeKey?: string;
  onSelect?: (key: string) => void;
  /** 顶部工作区行；不给就整行不渲染。 */
  workspace?: { name: string; caption?: string; monogram?: string; onClick?: () => void };
  /**
   * 主行动（如「新对话」）。
   *
   * `quiet` 把它降成与导航条目同一分量：默认那套（accent 文字 + 实心圆加号）在
   * 一屏只有它一个彩色元素时会压过整列历史，而「新建」并不比「打开哪一条」更重要。
   */
  action?: { label: string; onClick: () => void; icon?: ReactNode; quiet?: boolean };
  /** 搜索框。受控——过滤逻辑归调用方，组件不猜该按什么字段过滤。 */
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  /** 列表底部（如空态、骨架、加载更多）。 */
  footer?: ReactNode;
  /**
   * 嵌在别人的容器里（抽屉、面板）：去掉自己的卡片外观与固定宽度，改为撑满宿主。
   *
   * 做成显式开关而不是让调用方用 `className` 覆盖——Tailwind 的同类工具类
   * （`w-60` vs `w-full`）不按书写顺序决胜负，靠产物里的先后，覆盖不了就是一条
   * 看不出原因的死带。
   */
  embedded?: boolean;
  className?: string;
}

export default function SidebarNav({
  sections,
  activeKey,
  onSelect,
  workspace,
  action,
  search,
  footer,
  embedded = false,
  className = "",
}: SidebarNavProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  const active = activeKey;
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useLayoutEffect(() => {
    const container = navRef.current;
    const key = hovered ?? active;
    const target = key ? itemRefs.current[key] : null;
    // 没有 hover、也没有选中项时把高亮收起来，而不是让它停在上一处。
    if (!container || !target) {
      setBox(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    setBox({
      top: targetRect.top - containerRect.top,
      height: targetRect.height,
    });
  }, [hovered, active, sections]);

  return (
    <div
      className={`flex flex-col ${
        embedded ? "w-full p-3" : "w-60 rounded-card bg-surface p-2 shadow-raised"
      } ${className}`}
    >
      {workspace && (
        <button
          type="button"
          onClick={workspace.onClick}
          disabled={!workspace.onClick}
          className={`mb-2 flex w-full items-center gap-2.5 rounded-control p-1.5 text-left
            transition-[background-color,transform] duration-100 ${
              workspace.onClick ? "hover:bg-hover active:scale-[0.96]" : "cursor-default"
            }`}
        >
          {workspace.monogram && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-ink text-[13px] font-semibold text-surface">
              {workspace.monogram}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-tight text-ink">{workspace.name}</span>
            {workspace.caption && (
              <span className="block truncate text-[11px] leading-tight text-ink-3">{workspace.caption}</span>
            )}
          </span>
          {/* 没有 onClick 就不画这个箭头：一个看起来能点、点了没反应的控件，
              比没有控件更糟。 */}
          {workspace.onClick && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
            </svg>
          )}
        </button>
      )}

      {search && (
        <label className="mb-1 flex h-8 items-center gap-2 rounded-control bg-inset px-2.5 shadow-hairline">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`mb-2 flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-[13px]
            font-medium transition-[background-color,transform] duration-100 active:scale-[0.96] ${
              action.quiet
                ? "text-ink-2 hover:bg-hover hover:text-ink"
                : "text-accent hover:bg-accent-tint"
            }`}
        >
          {action.quiet && action.icon && (
            <span className="flex size-5 shrink-0 items-center justify-center text-ink-3">
              {action.icon}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-left">{action.label}</span>
          {!action.quiet && (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-[#fff]">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          )}
        </button>
      )}

      <div
        ref={navRef}
        onMouseLeave={() => setHovered(null)}
        className="scrollbar-hide relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
      >
        {/* 跟着 hover/active 位移的高亮。这是这套组件最值钱的手感——一块底色在条目
            之间滑过去，而不是每一行各自亮灭。 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 rounded-[7px] bg-hover"
          style={{
            top: box?.top ?? 0,
            height: box?.height ?? 0,
            opacity: box ? 1 : 0,
            transition:
              "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
          }}
        />
        {sections.map((section) => (
          <div key={section.key}>
            {section.label && (
              <div className="px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
                {section.label}
              </div>
            )}
            <div className="flex flex-col gap-px">
              {section.items.map((item) => {
                const isActive = item.key === active;
                return (
                  <button
                    key={item.key}
                    ref={(el) => {
                      itemRefs.current[item.key] = el;
                    }}
                    type="button"
                    title={item.label}
                    onMouseEnter={() => setHovered(item.key)}
                    onFocus={() => setHovered(item.key)}
                    onBlur={() => setHovered(null)}
                    onClick={() => onSelect?.(item.key)}
                    aria-current={isActive ? "page" : undefined}
                    className="group relative z-10 flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left
                      transition-[color,transform] duration-150 active:scale-[0.96]"
                  >
                    {/* 固定 20px 的图标列，和上面 `action` 行同宽同 gap——否则两行的
                        文字起点会差几像素，而它们上下紧挨着，一眼就看得出没对齐。
                        `shrink-0`：图标不参与挤压，被压扁的图标比错位更难看。 */}
                    {item.icon && (
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center ${
                          isActive ? "text-ink" : "text-ink-3"
                        }`}
                      >
                        {item.icon}
                      </span>
                    )}
                    <span
                      className={`min-w-0 flex-1 truncate text-[13px] transition-colors duration-150
                        ${isActive ? "font-medium text-ink" : "text-ink-2"}`}
                    >
                      {item.labelNode ?? item.label}
                    </span>
                    {item.trailing}
                    {item.badge !== undefined && (
                      <span
                        key={String(item.badge)}
                        className={`flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums ${
                          isActive ? "bg-surface text-ink-2 shadow-hairline" : "bg-accent-tint text-accent-ink"
                        }`}
                        style={{ animation: "pop-in 250ms cubic-bezier(0.23,1,0.32,1) both" }}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.onAdd && (
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(event) => {
                          event.stopPropagation();
                          item.onAdd?.();
                        }}
                        className="flex size-4.5 items-center justify-center rounded-[5px] text-ink-3 opacity-0
                          transition-[background-color,color,opacity] duration-100 group-hover:opacity-100 hover:bg-line/70 hover:text-ink-2"
                        style={isActive ? { opacity: 1 } : undefined}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {footer}
      </div>
    </div>
  );
}
