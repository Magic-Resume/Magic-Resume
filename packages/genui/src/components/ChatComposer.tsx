"use client";

import { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * CHAT — interactive panel with tabs, replies, and composer.
 * The reply sequence begins only after the user sends.
 * ───────────────────────────────────────────────────────── */

type Phase = "idle" | "sent" | "reply1" | "reply2" | "done";

function Section({
  label,
  sub,
  time,
  body,
  resolving,
}: {
  label: string;
  sub: string;
  time: string;
  body: string;
  resolving?: boolean;
}) {
  return (
    <div
      className="flex w-full flex-col gap-1.5 transition-[opacity,filter,transform] duration-400"
      style={{
        opacity: resolving ? 0.55 : 1,
        filter: resolving ? "blur(0.5px)" : "blur(0)",
        transform: resolving ? "scale(0.985)" : "scale(1)",
        transformOrigin: "top left",
        transitionTimingFunction: "var(--narrate-ease)",
        animation: "fade-up 400ms var(--narrate-ease) both",
      }}
    >
      <div className="flex items-center gap-1 text-mr-overline leading-[1.3]">
        <span className="font-medium text-mr-ink">{label}</span>
        <span className="text-mr-ink-secondary">{sub}</span>
        <span className="text-mr-ink">for {time}</span>
      </div>
      <p className="text-mr-caption leading-normal text-mr-ink">{body}</p>
    </div>
  );
}

export default function ChatComposer() {
  const [phase, setPhase] = useState<Phase>("done");
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState("Compare mint chip to last summer");
  const [tab, setTab] = useState("Flavors");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "sent") t = setTimeout(() => setPhase("reply1"), 500);
    else if (phase === "reply1") t = setTimeout(() => setPhase("reply2"), 1400);
    else if (phase === "reply2") t = setTimeout(() => setPhase("done"), 1200);
    else return;
    return () => clearTimeout(t);
  }, [phase]);

  const sent = phase !== "idle";
  const canSend = draft.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    setSubmitted(draft.trim());
    setDraft("");
    setPhase("sent");
  };

  return (
    <div className="flex h-[288px] w-full max-w-95 flex-col self-start overflow-hidden rounded-mr-panel bg-mr-surface shadow-mr-panel">
      {/* header — tabs + actions */}
      <div className="flex shrink-0 items-center justify-between border-b border-mr-line p-1.5">
        <div className="flex items-center">
          {["Flavors", "Suppliers"].map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
              className={`rounded-md px-2 py-[3px] text-mr-caption text-mr-ink transition-[background-color,opacity] duration-100 ${tab === item ? "bg-mr-sunk" : "opacity-50 hover:opacity-75"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {[
            <path key="p" d="M12 5v14M5 12h14" />,
            <g key="h"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></g>,
            <g key="e" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></g>,
          ].map((icon, i) => (
            <button
              key={i}
              type="button"
              aria-label="Action"
              className="flex size-6 items-center justify-center rounded-md text-mr-muted
                transition-colors duration-100 hover:bg-mr-surface-soft hover:text-mr-ink-secondary"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {icon}
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* conversation — fixed region so the card never changes shape */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pt-2.5 pb-1">
        {/* user bubble — right aligned, soft block */}
        <div className="flex justify-end pl-14">
          <div
            className="rounded-xl bg-mr-sunk px-3 py-1.5 text-mr-caption leading-[1.4] text-mr-ink
              transition-[opacity,transform] duration-300"
            style={{
              opacity: sent ? 1 : 0,
              transform: sent ? "translateY(0)" : "translateY(10px)",
              transitionTimingFunction: "var(--narrate-ease)",
            }}
          >
            {submitted}
          </div>
        </div>

        {phase === "reply1" || phase === "reply2" || phase === "done" ? (
          <Section
            label="Sales History"
            sub="Flavor Data"
            time="4s"
            body="Pulled 3 summers of mint chip sales for comparison."
          />
        ) : null}
        {phase === "reply2" || phase === "done" ? (
          <Section
            label="Comparison"
            sub="Trend Detection"
            time="2s"
            body="Mint chip is up 12% with stronger weekend peaks."
            resolving={phase === "reply2"}
          />
        ) : null}
      </div>

      {/* composer */}
      <div className="mt-auto shrink-0 p-1.5">
        <div
          role="presentation"
          onClick={() => inputRef.current?.focus()}
          className="flex cursor-text flex-col gap-2 rounded-mr-control border border-mr-line bg-mr-sunk p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.035)] transition-[border-color,box-shadow] duration-150 focus-within:border-mr-line-strong focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            placeholder="Prompt or tag a flavor with @"
            aria-label="Chat prompt"
            className="min-h-4.5 bg-transparent text-mr-caption leading-[1.4] text-mr-ink outline-none placeholder:text-mr-muted"
          />
          <div className="flex items-center justify-end">
            <button
              type="button"
              aria-label="Send"
              disabled={!canSend}
              onClick={send}
              className="flex size-7 items-center justify-center rounded-mr-control
                transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.96]"
              style={{
                background: canSend ? "var(--mr-ink)" : "var(--mr-line-strong)",
                color: canSend ? "var(--mr-surface)" : "var(--mr-ink-secondary)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
