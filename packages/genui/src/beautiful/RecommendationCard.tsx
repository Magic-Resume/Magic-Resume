"use client";

import { useState } from "react";

/* ─────────────────────────────────────────────────────────
 * RECOMMENDATION CARD
 * The card holds its shape. Pressing "Alternatives" opens a
 * new drawer listing the other options; picking one promotes
 * it to the recommendation. The primary action confirms.
 * ───────────────────────────────────────────────────────── */

export type RecommendationConfidence = "high" | "medium" | "low";

export interface RecommendationOption {
  label: string;
  /** 一句话：为什么是它。没有就只显示标签。 */
  why?: string;
  confidence?: RecommendationConfidence;
}

export interface RecommendationLabels {
  /** 展开备选抽屉的按钮。 */
  alternatives: string;
  /** 抽屉里那行小标题。 */
  others: string;
  accept: string;
  accepted: string;
  /** 三档置信度各自的说法，外加「没说」。 */
  confidence: Record<RecommendationConfidence | "none", string>;
}

export interface RecommendationCardProps {
  message: string;
  options: RecommendationOption[];
  /** 推荐第几个。越界或缺省都落到 0——卡片必须有一个主推项，否则它就只是个列表。 */
  recommended?: number;
  labels: RecommendationLabels;
  /** 已经答过了：给出那次选的是什么，卡片转成静态。 */
  answered?: string;
  /** 会话从记录恢复、后端线程已回收——可读不可点。 */
  disabled?: boolean;
  onAccept?: (label: string) => void;
}

/** 置信度 → 信号格数与色调。没说就 0 格中性色：不编造把握。 */
const SIGNAL: Record<RecommendationConfidence, { bars: number; tone: string }> = {
  high: { bars: 3, tone: "var(--green)" },
  medium: { bars: 2, tone: "var(--orange)" },
  low: { bars: 1, tone: "var(--ink-3)" },
};

function Meter({ signal, tone }: { signal: number; tone: string }) {
  return (
    <span className="flex items-end gap-0.5">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-full transition-colors duration-300"
          style={{ height: 10, background: bar < signal ? tone : "var(--line-strong)" }}
        />
      ))}
    </span>
  );
}

/**
 * 一个主推项 + 抽屉里的备选。
 *
 * 原版把三条冰淇淋订单写死在 `OPTIONS` 里，连 props 都没有。这里全部由外部给：
 * 主推项、每项的理由与置信度、以及三个可点的位置。
 *
 * **它不是一个更花哨的选项列表**——形态本身在表达「我有倾向」：主推项占满卡面并带上
 * 理由，其余的收进抽屉。所以调用方在模型确实没有倾向时应该退回普通的选择卡，
 * 而不是在这里传一个假的推荐。
 */
export default function RecommendationCard({
  message,
  options,
  recommended = 0,
  labels,
  answered,
  disabled = false,
  onAccept,
}: RecommendationCardProps) {
  const initial = recommended >= 0 && recommended < options.length ? recommended : 0;
  const [selected, setSelected] = useState(initial);
  const [open, setOpen] = useState(false);

  if (!options.length) return null;

  const active = options[selected] ?? options[0];
  const others = options.map((o, i) => ({ o, i })).filter(({ i }) => i !== selected);
  const signal = active.confidence ? SIGNAL[active.confidence] : { bars: 0, tone: "var(--ink-3)" };
  const confidenceLabel = labels.confidence[active.confidence ?? "none"];
  const locked = disabled || answered !== undefined;

  return (
    <div className="w-full max-w-95 overflow-hidden rounded-card bg-surface shadow-card">
      <div className="primitive-card-pad">
        <span className="text-[13px] font-semibold text-ink">{message}</span>
        <p
          key={active.label}
          className="mt-1.5 min-h-12 text-[13px] leading-relaxed text-ink-2"
          style={{ animation: "fade-in 180ms ease-out both" }}
        >
          <span className="font-medium text-ink">{active.label}</span>
          {active.why ? <span className="block mt-0.5">{active.why}</span> : null}
        </p>
      </div>

      {/* alternatives drawer — a distinctly new section of the card
          底色用**叠加**（bg-hover）而不是原版的 `bg-inset`：`inset` 在我们的深色主题里是
          0.12，比页面底（0.145）还暗——「凹」直接凹穿了页面，卡片下半截和背景糊成一片。
          叠加在两个主题里方向自动相反：深色叠白、浅色叠黑，都是相对卡片的一层浅浮雕。 */}
      {others.length > 0 && (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{
            gridTemplateRows: open ? "1fr" : "0fr",
            opacity: open ? 1 : 0,
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-line bg-hover px-2 py-2">
              <p className="px-1.5 pb-1 text-[11px] font-medium text-ink-3">{labels.others}</p>
              {others.map(({ o, i }) => {
                const s = o.confidence ? SIGNAL[o.confidence] : { bars: 0, tone: "var(--ink-3)" };
                return (
                  <button
                    key={o.label}
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      setSelected(i);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-control px-1.5 py-1.5
                      text-left transition-colors duration-100 enabled:hover:bg-hover-2 disabled:opacity-50"
                  >
                    <Meter signal={s.bars} tone={s.tone} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{o.label}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">
                      {labels.confidence[o.confidence ?? "none"]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="primitive-card-footer flex items-center justify-between gap-3 border-t border-line bg-hover">
        <span className="flex items-center gap-2">
          <Meter signal={signal.bars} tone={signal.tone} />
          <span className="text-[12.5px] font-medium text-ink-2">{confidenceLabel}</span>
        </span>

        <span className="-mr-0.5 flex items-center gap-2">
          {others.length > 0 && !locked && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((current) => !current)}
              className={`h-7 rounded-control px-2.5 text-[12.5px] font-medium shadow-btn
                transition-[background-color,transform] duration-100 active:scale-[0.96]
                ${open ? "bg-hover-2 text-ink" : "bg-surface text-ink hover:bg-hover-2"}`}
            >
              {labels.alternatives}
            </button>
          )}
          <button
            type="button"
            disabled={locked}
            onClick={() => onAccept?.(active.label)}
            className={`h-7 rounded-control px-3 text-[12.5px] font-medium
              shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(16,24,40,0.12),0_1px_2px_rgba(16,24,40,0.1)]
              transition-[background-color,transform] duration-150 enabled:active:scale-[0.96]
              disabled:cursor-default
              ${answered !== undefined ? "bg-green text-[#fff]" : "bg-accent text-[#fff]"}`}
          >
            {answered !== undefined ? labels.accepted : labels.accept}
          </button>
        </span>
      </div>
    </div>
  );
}
