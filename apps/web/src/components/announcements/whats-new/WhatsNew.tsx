'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, X } from '@magic-resume/icons';
import type { Release, ReleaseAction, ReleaseSlide } from './types';
import './whats-new.css';
import { defaultLabels, type WhatsNewLabels } from './labels';

type Props = {
  release: Release;
  /** Override the sample links when integrating with your app. */
  onAction?: (action: ReleaseAction) => void;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDismiss?: () => void;
  labels?: WhatsNewLabels;
  showTeaser?: boolean;
};

const productName = 'Magic';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ActionLink({ action, onAction, className = '' }: {
  action: ReleaseAction; onAction?: Props['onAction']; className?: string;
}) {
  return <a className={`wn-button wn-button--outline ${className}`} href={action.href}
    onClick={event => { if (onAction) { event.preventDefault(); onAction(action); } }}>
    {action.label}<ArrowUpRight size={16} aria-hidden="true" />
  </a>;
}

function SlideCopy({ slide, release, titleId, onAction, labels }: {
  slide: ReleaseSlide; release: Release; titleId?: string; onAction?: Props['onAction']; labels: WhatsNewLabels;
}) {
  return <>
    <div className="wn-meta">
      <span className={`wn-badge ${slide.category === 'Improvement' ? 'wn-badge--improvement' : ''}`}>{slide.category === 'Improvement' ? labels.improvement : labels.feature}</span>
      <span>{release.label} · {release.date}</span>
    </div>
    <h2 id={titleId}>{slide.title}</h2>
    <p className="wn-description">{slide.description}</p>
    <ul className="wn-highlights" aria-label={labels.highlights}>
      {slide.highlights.map((text, index) => <li key={index}><span className="wn-check"><Check size={10} aria-hidden="true" /></span><span>{text}</span></li>)}
    </ul>
    {slide.action && <ActionLink action={slide.action} onAction={onAction} />}
  </>;
}

function SlideMedia({ slide }: { slide: ReleaseSlide }) {
  // i18n-ignore: Magic is the product brand.
  return slide.media ?? (slide.image ? <img className={`wn-art ${slide.id === 'timeline' ? 'wn-art--timeline' : ''}`}
    src={slide.image.src} alt={slide.image.alt} draggable={false} decoding="async" /> : <div className="wn-art-placeholder" aria-hidden="true"><span>{productName}</span></div>);
}

export function ReleaseDialog({ release, onClose, onAction, labels = defaultLabels }: {
  release: Release; onClose: () => void; onAction?: Props['onAction']; labels?: WhatsNewLabels;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gesture = useRef<{ x: number; y: number; time: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const [closing, setClosing] = useState(false);
  const [copyHeight, setCopyHeight] = useState<number>();
  const [drag, setDrag] = useState(0);
  const titleId = useId();
  const slide = release.slides[index];
  const isLast = index === release.slides.length - 1;

  useEffect(() => {
    const el = dialog.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    el.showModal();
    nextButton.current?.focus({ preventScroll: true });
    return () => {
      clearTimeout(closeTimer.current);
      clearTimeout(transitionTimer.current);
      el.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    const el = copy.current;
    if (!el) return;
    // Layout dimensions stay accurate while the dialog is scaling into view.
    const measure = () => setCopyHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [index]);

  function close(afterClose?: () => void) {
    if (closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      onClose();
      afterClose?.();
    }, prefersReducedMotion() ? 0 : 180);
  }

  function goTo(target: number) {
    const next = Math.max(0, Math.min(release.slides.length - 1, target));
    if (next === index || closing) return;
    clearTimeout(transitionTimer.current);
    setDirection(next > index ? 1 : -1);
    setPrevious(prefersReducedMotion() ? null : index);
    setIndex(next);
    transitionTimer.current = setTimeout(() => setPrevious(null), 420);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    gesture.current = { x: event.clientX, y: event.clientY, time: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    setDrag(0);
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const isFlick = Math.abs(dx) > 24 && performance.now() - start.time < 220;
    if ((Math.abs(dx) > 60 || isFlick) && Math.abs(dx) > Math.abs(dy) * 1.2) goTo(index + (dx < 0 ? 1 : -1));
  }

  const handleAction = onAction ? (action: ReleaseAction) => close(() => onAction(action)) : undefined;
  const motionStyle = { '--wn-direction': direction } as CSSProperties;

  return <dialog ref={dialog} className="wn-dialog" aria-labelledby={titleId} data-closing={closing || undefined}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}
    onKeyDown={event => {
      if (event.key === 'Tab') {
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]')]
          .filter(item => !item.closest('[inert]') && item.getClientRects().length > 0);
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if ((event.target as HTMLElement).closest('input, select, textarea')) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); goTo(index + (event.key === 'ArrowRight' ? 1 : -1));
      }
    }} style={motionStyle}>
    <div className="wn-media" onPointerDown={onPointerDown} onPointerUp={onPointerUp}
      onPointerCancel={() => { gesture.current = null; setDrag(0); }}
      onPointerMove={event => {
        if (gesture.current && !prefersReducedMotion()) setDrag((event.clientX - gesture.current.x) * .16);
      }}>
      <div className="wn-media-drag" style={{ transform: `translateX(${drag}px)`, transition: gesture.current ? 'none' : undefined }}>
        {previous !== null && <div key={`out-${previous}`} className="wn-media-layer wn-media-layer--out" aria-hidden="true"><SlideMedia slide={release.slides[previous]} /></div>}
        <div key={index} className="wn-media-layer wn-media-layer--in"><SlideMedia slide={slide} /></div>
      </div>
      <button type="button" className="wn-button wn-close" aria-label={labels.close} onClick={() => close()}><X size={16} aria-hidden="true" /></button>
    </div>
    <div className="wn-body">
      <div className="wn-copy-stage" style={{ height: copyHeight }}>
        {previous !== null && <div className="wn-copy wn-copy--out" key={`out-${previous}`} aria-hidden="true" inert>
          <SlideCopy slide={release.slides[previous]} release={release} labels={labels} />
        </div>}
        <div ref={copy} className="wn-copy wn-copy--in" key={index}>
          <SlideCopy slide={slide} release={release} titleId={titleId} onAction={handleAction} labels={labels} />
        </div>
      </div>
      <p className="wn-sr-only" aria-live="polite">{labels.position(index + 1, release.slides.length)}</p>
      <div className="wn-footer">
        <div className="wn-dots" aria-label={labels.slides}>
          {release.slides.map((item, number) => <button key={item.id} type="button"
            aria-label={labels.goTo(number + 1, item.title)} aria-current={number === index ? 'step' : undefined}
            onClick={() => goTo(number)}><span /></button>)}
        </div>
        <div className="wn-navigation">
          {isLast && release.changelog && <a className="wn-changelog" href={release.changelog.href}
            onClick={event => { if (handleAction) { event.preventDefault(); handleAction(release.changelog!); } }}>{release.changelog.label}</a>}
          <button type="button" className="wn-button wn-button--outline wn-back" aria-label={labels.back} disabled={index === 0} onClick={() => goTo(index - 1)}>
            <ArrowLeft size={16} aria-hidden="true" /><span>{labels.back}</span>
          </button>
          <button type="button" ref={nextButton} className="wn-button wn-button--primary wn-next" onClick={() => isLast ? close() : goTo(index + 1)}>
            <span key={isLast ? 'done' : 'next'}>{isLast ? labels.done : <>{labels.next}<ArrowRight size={16} aria-hidden="true" /></>}</span>
          </button>
        </div>
      </div>
    </div>
  </dialog>;
}

export function WhatsNew({ release, onAction, className = '', open: controlledOpen, onOpenChange, onDismiss, labels = defaultLabels, showTeaser = true }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => { setInternalOpen(value); onOpenChange?.(value); };
  const [dismissed, setDismissed] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(dismissTimer.current), []);
  const images = release.slides.flatMap(item => item.image ? [item.image] : []).slice(0, 3);

  return <>
    {showTeaser && !dismissed && <aside className={`wn-teaser ${className}`} aria-label={release.label} data-dismissing={dismissing || undefined}>
      <div className="wn-teaser-top">
        <div className="wn-thumbnails" aria-hidden="true">
          {images.map((img, i) => <div className="wn-thumbnail" style={{ '--wn-thumb': i } as CSSProperties} key={img.src}><img src={img.src} alt="" draggable={false} /></div>)}
        </div>
        <div className="wn-teaser-copy">
          <p className="wn-teaser-label"><span className="wn-status-dot" /><span>{release.label}</span></p>
          <p className="wn-teaser-summary">{release.summary}</p>
        </div>
        <button type="button" className="wn-button wn-dismiss" aria-label={labels.dismiss} onClick={() => {
          onDismiss?.();
          setDismissing(true);
          dismissTimer.current = setTimeout(() => setDismissed(true), prefersReducedMotion() ? 0 : 200);
        }}><X size={16} aria-hidden="true" /></button>
      </div>
      <button type="button" className="wn-button wn-button--primary wn-open" aria-haspopup="dialog" onClick={() => setOpen(true)}>{labels.open}</button>
    </aside>}
    {open && <ReleaseDialog release={release} onClose={() => setOpen(false)} onAction={onAction} labels={labels} />}
  </>;
}
