'use client';

import { useRef, useState, type ReactNode } from 'react';

type GlideMenuProps = {
  children: ReactNode;
  className?: string;
  highlightClassName?: string;
  rowSelector?: string;
};

/**
 * 一块跟着指针在菜单项之间**滑动**的高亮，而不是每项各自亮各自的。
 *
 * 差别在切换的那一刻：逐项 `hover:bg-*` 是「上一项灭、下一项亮」，眼睛看到的是两次闪；
 * 一块共用的高亮从上一项**移动**到下一项，读作同一个焦点在走。
 *
 * 位置用 `getBoundingClientRect` 相减而不是 `offsetTop`：菜单常常自己带滚动，
 * `offsetTop` 是相对定位父级的静态值，滚动后高亮会停在错的行上。
 *
 * 移植自 beautiful-ui（`components/primitives/GlideMenu.tsx`），逐行保持一致。
 */
export default function GlideMenu({
  children,
  className = '',
  highlightClassName = 'inset-x-0 rounded-[8px] bg-hover',
  rowSelector = '[data-menu-row]',
}: GlideMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  const [visible, setVisible] = useState(false);

  const moveTo = (target: EventTarget | null) => {
    const container = ref.current;
    if (!(target instanceof Element) || !container) return;
    const row = target.closest(rowSelector);
    if (!(row instanceof HTMLElement) || !container.contains(row)) return;
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    setBox({ top: rowRect.top - containerRect.top, height: rowRect.height });
    setVisible(true);
  };

  return (
    <div
      ref={ref}
      onMouseOver={(event) => moveTo(event.target)}
      onMouseLeave={() => setVisible(false)}
      onFocusCapture={(event) => moveTo(event.target)}
      // 焦点移到菜单内的另一行不该让高亮消失，只有真正离开容器才收。
      onBlurCapture={(event) => {
        if (!ref.current?.contains(event.relatedTarget as Node | null)) {
          setVisible(false);
        }
      }}
      className={`group/glide-menu relative ${className}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute ${highlightClassName}`}
        style={{
          top: box?.top ?? 0,
          height: box?.height ?? 0,
          opacity: box && visible ? 1 : 0,
          transition:
            'top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease',
        }}
      />
      {children}
    </div>
  );
}
