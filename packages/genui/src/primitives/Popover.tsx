'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 6;
const VIEWPORT_MARGIN = 12;

type Placement = { top: number; left: number; width: number; flipped: boolean };

/**
 * A dropdown anchored to an element, rendered in a portal.
 *
 * Portal + fixed positioning rather than `absolute`: these open inside a
 * scrolling conversation, and an absolutely-positioned menu gets clipped by
 * the thread's own overflow the moment the card is near the bottom — which is
 * exactly where a freshly-arrived card always is.
 *
 * Flips above the anchor when there isn't room below, and re-measures on
 * scroll and resize so it stays attached while the thread moves under it.
 */
export function Popover({
  anchorRef,
  open,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 240;
    const below = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
    const flipped = below < panelHeight && rect.top > below;
    setPlacement({
      top: flipped ? rect.top - GAP - panelHeight : rect.bottom + GAP,
      left: rect.left,
      width: rect.width,
      flipped,
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    // capture: an ancestor scroll container moves us too, and those don't bubble.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: placement?.top ?? -9999,
        left: placement?.left ?? -9999,
        width: placement?.width,
        // Hidden until measured, or it flashes at the wrong spot for one frame.
        visibility: placement ? 'visible' : 'hidden',
        zIndex: 60,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
