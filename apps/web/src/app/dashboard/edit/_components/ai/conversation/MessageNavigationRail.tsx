"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  type RefObject,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "../types";

const PREVIEW_TITLE_LENGTH = 46;
const PREVIEW_DESCRIPTION_LENGTH = 82;

type MessageRailItem = {
  id: string;
  role: "user" | "assistant";
  label: string;
  description?: string;
};

type RailMetrics = {
  overflowing: boolean;
  step: number;
};

type MessageNavigationRailProps = {
  messages: ChatMessage[];
  viewportRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  visible: boolean;
  onNavigate: (atLiveEdge: boolean) => void;
};

function plainText(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  const excerpt = value.slice(0, limit);
  const boundary = excerpt.lastIndexOf(" ");
  const end = boundary > limit * 0.65 ? boundary : limit;
  return `${value.slice(0, end).trim()}…`;
}

/**
 * The source component discovers messages through DOM slots. Polaris already owns
 * structured ChatMessage data, so deriving previews here avoids a second MutationObserver
 * parsing the streamed markdown tree on every token.
 */
function buildRailItems(messages: ChatMessage[]): MessageRailItem[] {
  const visibleMessages = messages.filter(
    (message): message is ChatMessage & { role: "user" | "assistant" } =>
      (message.role === "user" || message.role === "assistant") &&
      Boolean(message.content?.trim()),
  );

  return visibleMessages.map((message, index) => {
    const text = plainText(message.content ?? "");
    const followingAssistant =
      message.role === "user"
        ? visibleMessages
            .slice(index + 1)
            .find((candidate) => candidate.role === "assistant")
        : undefined;
    const response = followingAssistant?.content
      ? plainText(followingAssistant.content)
      : "";

    if (text.length <= PREVIEW_TITLE_LENGTH) {
      return {
        id: message.id,
        role: message.role,
        label: text,
        description: response
          ? truncate(response, PREVIEW_DESCRIPTION_LENGTH)
          : undefined,
      };
    }

    return {
      id: message.id,
      role: message.role,
      label: truncate(text, PREVIEW_TITLE_LENGTH),
      description: truncate(
        response || text.slice(PREVIEW_TITLE_LENGTH),
        PREVIEW_DESCRIPTION_LENGTH,
      ),
    };
  });
}

function rowsById(content: HTMLDivElement) {
  return new Map(
    Array.from(
      content.querySelectorAll<HTMLElement>("[data-message-id]"),
    ).map((row) => [row.dataset.messageId ?? "", row]),
  );
}

export default function MessageNavigationRail({
  messages,
  viewportRef,
  contentRef,
  visible,
  onNavigate,
}: MessageNavigationRailProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion() ?? false;
  const deferredMessages = useDeferredValue(messages);
  const items = useMemo(
    () => buildRailItems(deferredMessages),
    [deferredMessages],
  );
  const [activeId, setActiveId] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<RailMetrics>({
    overflowing: false,
    step: 14,
  });
  const frameRef = useRef<number | null>(null);

  const schedule = useCallback((task: () => void) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      task();
    });
  }, []);

  const syncMetrics = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const overflowing =
      items.length > 1 && viewport.scrollHeight > viewport.clientHeight + 24;
    // PreviewRail keeps the ticks as one centered cluster. Long conversations
    // compress the spacing inside that cluster instead of stretching it over the
    // entire transcript height.
    const clusterHeight = Math.min(240, viewport.clientHeight * 0.56);
    const step = Math.max(
      3,
      Math.min(14, clusterHeight / Math.max(1, items.length - 1)),
    );

    setMetrics((current) => {
      return current.overflowing === overflowing &&
        Math.abs(current.step - step) < 0.2
        ? current
        : { overflowing, step };
    });
  }, [contentRef, items, viewportRef]);

  const syncActiveItem = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content || items.length === 0) return;

    const distanceFromEnd =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (viewport.scrollTop <= 64) {
      setActiveId(items[0]?.id ?? "");
      return;
    }
    if (distanceFromEnd <= 96) {
      setActiveId(items.at(-1)?.id ?? "");
      return;
    }

    const center =
      viewport.getBoundingClientRect().top + viewport.clientHeight / 2;
    const rows = rowsById(content);
    let nearestId = items[0]?.id ?? "";
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const item of items) {
      const rect = rows.get(item.id)?.getBoundingClientRect();
      if (!rect) continue;
      const distance = Math.abs(rect.top + rect.height / 2 - center);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = item.id;
      }
    }
    setActiveId((current) => (current === nearestId ? current : nearestId));
  }, [contentRef, items, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const sync = () =>
      schedule(() => {
        syncMetrics();
        syncActiveItem();
      });
    sync();
    viewport.addEventListener("scroll", sync, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(viewport);
    observer?.observe(content);

    return () => {
      viewport.removeEventListener("scroll", sync);
      observer?.disconnect();
    };
  }, [contentRef, items, schedule, syncActiveItem, syncMetrics, viewportRef]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const scrollToItem = (item: MessageRailItem) => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const row = content ? rowsById(content).get(item.id) : undefined;
    if (!viewport || !row) return;

    const isLast = items.at(-1)?.id === item.id;
    onNavigate(isLast);
    setActiveId(item.id);
    const viewportRect = viewport.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const top = isLast
      ? viewport.scrollHeight
      : viewport.scrollTop +
        rowRect.top -
        viewportRect.top -
        (viewport.clientHeight - rowRect.height) / 2;
    viewport.scrollTo({
      top,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  const previewItem = items.find((item) => item.id === previewId);
  const previewIndex = previewItem
    ? items.findIndex((item) => item.id === previewItem.id)
    : -1;
  const clusteredTop = (index: number) =>
    `calc(50% + ${(index - (items.length - 1) / 2) * metrics.step}px)`;
  const showRail = visible && metrics.overflowing && items.length > 1;

  return (
    <AnimatePresence initial={false}>
      {showRail && (
        <motion.nav
          key="message-navigation-rail"
          aria-label={t("aiLab.chat.navigation")}
          className="pointer-events-none absolute inset-y-3 right-1 z-10 hidden w-7 overflow-visible xl:block"
          initial={{ opacity: 0, x: 12, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 14, scale: 0.97 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  duration: 0.2,
                  delay: visible ? 0.1 : 0,
                  ease: [0.22, 1, 0.36, 1],
                }
          }
          onMouseLeave={() => setPreviewId(null)}
        >
          <div className="absolute inset-0 right-0 w-7">
            {items.map((item, index) => {
              const active = activeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={t("aiLab.chat.navigationItem", {
                    index: index + 1,
                    count: items.length,
                    actor:
                      item.role === "user"
                        ? t("aiLab.chat.navigationUser")
                        : "Polaris",
                  })}
                  aria-current={active ? "location" : undefined}
                  onClick={() => scrollToItem(item)}
                  onMouseEnter={() => setPreviewId(item.id)}
                  onFocus={() => setPreviewId(item.id)}
                  onBlur={() => setPreviewId(null)}
                  className="pointer-events-auto absolute right-0 flex h-4 w-7 -translate-y-1/2 items-center justify-end rounded-sm pr-0.5 outline-none focus-visible:ring-1 focus-visible:ring-white/70"
                  style={{ top: clusteredTop(index) }}
                >
                  <motion.span
                    aria-hidden="true"
                    className={cn(
                      "h-px w-4 origin-right rounded-full",
                      active ? "bg-neutral-100" : "bg-neutral-500",
                    )}
                    animate={{
                      opacity: active ? 1 : 0.62,
                      scaleX: active ? 1 : 0.52,
                    }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 420, damping: 34 }
                    }
                  />
                </button>
              );
            })}
          </div>

          <AnimatePresence>
            {previewItem && (
              <div
                className="absolute right-8 mr-1 w-64 -translate-y-1/2"
                style={{
                  top: clusteredTop(previewIndex),
                }}
              >
                <motion.div
                  className="h-20 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1b1b1b]/95 p-3 shadow-[0_14px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl"
                  initial={{ opacity: 0, x: 8, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 6, scale: 0.98 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: 0.14, ease: [0.22, 1, 0.36, 1] }
                  }
                >
                  <p className="line-clamp-1 text-xs font-medium leading-4 text-neutral-100">
                    {previewItem.label}
                  </p>
                  {previewItem.description && (
                    <p className="mt-1 line-clamp-2 text-xs leading-4 text-neutral-500">
                      {previewItem.description}
                    </p>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
