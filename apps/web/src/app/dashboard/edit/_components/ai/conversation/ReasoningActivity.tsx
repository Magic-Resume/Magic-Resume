"use client";

import { ChevronDown } from "@magic-resume/icons";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import AgentDisclosure from "./AgentDisclosure";

// Exact beUI motion tokens. Do not retune these locally; animation changes should
// stay aligned with the source component.
const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SPRING_SWAP = {
  type: "spring" as const,
  stiffness: 460,
  damping: 30,
  mass: 0.55,
};
const SPRING_LAYOUT = {
  type: "spring" as const,
  stiffness: 360,
  damping: 32,
  mass: 0.6,
};
const MAX_REASONING_HEIGHT = 180;

const TEXT_SHIMMER_KEYFRAMES =
  "@keyframes beui-text-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}" +
  "@media (prefers-reduced-motion: reduce){.beui-text-shimmer{animation:none !important}}";

type ReasoningItem = {
  id: string;
  content: string;
};

type ReasoningActivityProps = {
  text: string;
  running: boolean;
  onCollapseComplete?: () => void;
};

function formatDuration(duration: number) {
  const seconds = Math.max(0, Math.round(duration));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function reasoningItems(text: string): ReasoningItem[] {
  return text
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((content, index) => ({
      id: `reasoning-${index}`,
      // Provider reasoning sometimes wraps a whole line in Markdown emphasis.
      // Strip the marker only; the row styling remains the original TextRow.
      content: content
        .replace(/^\*\*(.+?)\*\*$/, "$1")
        .replace(/\*\*(.+?)\*\*/g, "$1"),
    }));
}

/** Local data adapter: beUI receives duration as a prop; our stream exposes status only. */
function useReasoningDuration(running: boolean) {
  const [startedAt] = useState(() => (running ? Date.now() : null));
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (startedAt === null) return;
    const update = () =>
      setSeconds(Math.round((Date.now() - startedAt) / 1000));
    update();
    if (!running) return;
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);

  return seconds;
}

function ThinkingShimmer({ children }: { children: string }) {
  return (
    <>
      <style>{TEXT_SHIMMER_KEYFRAMES}</style>
      <span
        style={{ animation: "beui-text-shimmer 1.8s linear infinite" }}
        className="beui-text-shimmer inline-block bg-[linear-gradient(110deg,var(--ink-3)_30%,var(--ink)_50%,var(--ink-3)_70%)] bg-[length:200%_100%] bg-clip-text font-medium text-transparent"
      >
        {children}
      </span>
    </>
  );
}

function TextRow({ item }: { item: ReasoningItem }) {
  return (
    <div className="rounded-md px-1.5 py-1 leading-5 text-neutral-500">
      {item.content}
    </div>
  );
}

/**
 * beUI AgentActivity's streaming-text path. Product adapters are limited to localized
 * labels, our reasoning-string input, and a content-sized viewport capped at 180px.
 */
export default function ReasoningActivity({
  text,
  running,
  onCollapseComplete,
}: ReasoningActivityProps) {
  const { t } = useTranslation();
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const items = reasoningItems(text);
  const duration = useReasoningDuration(running);
  const contentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousStatus = useRef(running ? "working" : "complete");
  const [contentHeight, setContentHeight] = useState(0);
  // The source preview uses defaultOpen={reduce} and collapseOnComplete={!reduce}.
  const [currentOpen, setOpen] = useState(reduce);
  const status = running ? "working" : "complete";
  const working = status === "working";
  const expanded = working || currentOpen;
  const cappedHeight = Math.min(
    contentHeight,
    Math.max(0, MAX_REASONING_HEIGHT),
  );
  const viewportHeight = cappedHeight;
  const capped = contentHeight > MAX_REASONING_HEIGHT;
  const streamOffset = working
    ? Math.min(0, viewportHeight - contentHeight)
    : 0;

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const measure = () => setContentHeight(node.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (previousStatus.current === "working" && status === "complete") {
      setOpen(reduce);
    }
    previousStatus.current = status;
  }, [reduce, status]);

  const toggle = () => {
    const next = !currentOpen;
    setOpen(next);
    if (next) {
      requestAnimationFrame(() => viewportRef.current?.scrollTo({ top: 0 }));
    }
  };

  const maskImage = capped
    ? working
      ? "linear-gradient(to bottom, transparent, black 12px)"
      : "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)"
    : undefined;

  return (
    <div
      data-state={working ? "working" : expanded ? "open" : "closed"}
      data-content="text"
      aria-busy={working}
      className="mb-2 w-full text-sm"
    >
      {working ? (
        <div
          id={triggerId}
          role="status"
          className="flex h-7 min-w-0 items-center text-neutral-500"
        >
          <ThinkingShimmer>{t("aiLab.activity.thinking")}</ThinkingShimmer>
        </div>
      ) : (
        <button
          id={triggerId}
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={toggle}
          className="group flex h-7 min-w-0 items-center gap-1.5 rounded-md text-left text-xs font-medium text-neutral-500 outline-none transition-colors hover:text-neutral-300 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
        >
          <span className="truncate">
            {duration === null
              ? t("aiLab.reasoning.done")
              : t("aiLab.reasoning.thought", {
                  duration: formatDuration(duration),
                })}
          </span>
          <motion.span
            aria-hidden="true"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : SPRING_SWAP}
            className="inline-flex shrink-0 text-neutral-600 group-hover:text-neutral-300"
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>
      )}

      <AgentDisclosure
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        open={expanded}
        openHeight={viewportHeight}
        onAnimationComplete={() => {
          if (!expanded) onCollapseComplete?.();
        }}
      >
        <div
          ref={viewportRef}
          className={cn(
            "scrollbar-hide pr-1",
            capped && expanded && !working
              ? "overflow-y-auto"
              : "overflow-y-hidden",
          )}
          style={{
            height: viewportHeight,
            maskImage,
            WebkitMaskImage: maskImage,
          }}
        >
          <motion.div
            ref={contentRef}
            role="list"
            initial={false}
            animate={{ y: streamOffset }}
            transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
            className="space-y-0.5 py-2"
          >
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <motion.div
                  layout="position"
                  key={item.id}
                  role="listitem"
                  initial={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : {
                          opacity: { duration: 0.18, ease: EASE_OUT },
                          y: SPRING_LAYOUT,
                          layout: SPRING_LAYOUT,
                        }
                  }
                >
                  <TextRow item={item} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </AgentDisclosure>
    </div>
  );
}
