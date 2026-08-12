"use client";

import { useState } from "react";

/* ─────────────────────────────────────────────────────────
 * APPROVAL CARD (human-in-the-loop)
 * One question at a time; elongated pills show progress;
 * the circular arrow up top advances (↑ sends on the last).
 * Choices, paging, and submission are directly controlled.
 * ───────────────────────────────────────────────────────── */

export interface ApprovalQuestion {
  q: string;
  /** `radio` 单选 / `check` 多选。 */
  type: 'radio' | 'check';
  options: string[];
  /** 这一页已经答完了：显示这句话，不再可点。 */
  answered?: string;
}

export interface ApprovalLabels {
  previous: string;
  next: string;
  send: string;
  /** 「跳到第 N 题」的无障碍标签，`{{n}}` 会被替换。 */
  goTo: string;
  freeText: string;
  freeTextAria: string;
}

export interface ApprovalCardProps {
  questions: ApprovalQuestion[];
  labels: ApprovalLabels;
  /**
   * 一页答完就上报，不等全部答完。
   *
   * HITL 要的是「按下标归位的裁决」：一次中断的每个动作各自对应一个裁决位，攒到最后
   * 一次性交出去反而要在调用方那边再拆一次。
   */
  onAnswer?: (pageIndex: number, answer: string[]) => void;
  /** 会话从记录恢复、后端线程已回收——可读不可点。 */
  disabled?: boolean;
  /** 自由输入框的占位文案，走调用方的 i18n。 */
  freeTextPlaceholder?: string;
}

/**
 * 人类在环审批卡：一次一问、胶囊显示进度、右上圆箭头推进（最后一题变成发送）。
 *
 * 原版把三个问题写死在 `QUESTIONS` 里，答完与否是**内部** state，右上还有个 X 能把卡
 * 直接藏掉。接 HITL 时这三条都不成立：
 *
 * - 题目来自真实的中断动作；
 * - 答完与否由外部说了算（会话可以从记录恢复，那时后端线程早已回收）；
 * - **不给关**——藏掉一张审批卡等于把暂停的运行永久搁浅。
 *
 * 一个中断可以带多个动作，后端会拒绝裁决数量与动作数量不匹配的续跑，所以
 * `questions.length` 必须等于该中断分给这张卡的动作数。
 */
export default function ApprovalCard({
  questions: QUESTIONS,
  labels,
  onAnswer,
  disabled = false,
  freeTextPlaceholder = "",
}: ApprovalCardProps) {
  const firstOpen = Math.max(0, QUESTIONS.findIndex((q) => q.answered === undefined));
  const [qi, setQi] = useState(firstOpen);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const question = QUESTIONS[qi];
  const last = qi === QUESTIONS.length - 1;
  const selected = answers[qi] ?? [];
  const hasAnswer = selected.length > 0 || Boolean(custom[qi]?.trim());
  // 单页时不渲染分页器——一个点的进度条是噪音。
  const paged = QUESTIONS.length > 1;
  const locked = disabled || question?.answered !== undefined;

  if (!question) return null;

  /** 这一页选中的东西，按调用方要的形状（自由输入优先）。 */
  const answerOf = (index: number): string[] => {
    const typed = custom[index]?.trim();
    if (typed) return [typed];
    return (answers[index] ?? []).map((i) => QUESTIONS[index].options[i]).filter(Boolean);
  };

  const commit = (index: number) => {
    const answer = answerOf(index);
    if (!answer.length) return;
    onAnswer?.(index, answer);
    // 翻页交给自己：调用方拿到的是「第几页答了什么」，它不该反过来管光标。
    if (index < QUESTIONS.length - 1) setQi(index + 1);
  };

  const toggle = (index: number) => {
    if (locked) return;
    setAnswers((current) => {
      const picked = current[qi] ?? [];
      const next = question.type === "radio"
        ? [index]
        : picked.includes(index)
          ? picked.filter((item) => item !== index)
          : [...picked, index];
      return { ...current, [qi]: next };
    });
    if (question.type === "radio") {
      setCustom((current) => ({ ...current, [qi]: "" }));
      // 单选选完自动交卷 + 翻页。多选要等用户点箭头，因为「还想不想再选一个」只有他知道。
      const page = qi;
      const answer = [question.options[index]].filter(Boolean);
      window.setTimeout(() => {
        if (!answer.length) return;
        onAnswer?.(page, answer);
        if (page < QUESTIONS.length - 1) setQi(page + 1);
      }, 480);
    }
  };

  return (
    <div className="flex w-full max-w-80 flex-col items-stretch">
      <div className="w-full self-start overflow-hidden rounded-card bg-surface shadow-card">
        <div key={qi} className="primitive-card-pad" style={{ animation: "fade-up 350ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <span className="text-[13px] font-medium text-ink">{question.q}</span>

          {question.answered !== undefined ? (
            <div className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <span
                className="flex size-4 shrink-0 items-center justify-center rounded-full bg-green text-[#fff]"
                style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              {question.answered}
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-0.5">
              {question.options.map((option, i) => {
                const on = selected.includes(i);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={on}
                    disabled={locked}
                    onClick={() => toggle(i)}
                    className="-mx-1.5 flex items-center gap-2 rounded-control px-1.5 py-1 text-left transition-colors duration-100 enabled:hover:bg-hover disabled:opacity-50"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center transition-colors duration-200
                        ${question.type === "radio" ? "rounded-full" : "rounded-[5px]"}
                        ${on ? "bg-ink text-canvas" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)] text-transparent"}`}
                    >
                      {question.type === "radio" ? (
                        <span className="size-1.5 rounded-full bg-canvas transition-transform duration-200" style={{ transform: on ? "scale(1)" : "scale(0)" }} />
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      )}
                    </span>
                    <span className={`text-[13px] transition-colors duration-200 ${on ? "text-ink" : "text-ink-2"}`}>
                      {option}
                    </span>
                  </button>
                );
              })}
              {freeTextPlaceholder ? (
                <label className="-mx-1.5 flex items-center gap-2 rounded-control px-1.5 py-1 transition-colors duration-100 focus-within:bg-hover hover:bg-hover">
                  <span aria-hidden="true" className="size-4 shrink-0" />
                  <input
                    value={custom[qi] ?? ""}
                    disabled={locked}
                    onChange={(event) => {
                      setCustom((current) => ({ ...current, [qi]: event.target.value }));
                      if (question.type === "radio") setAnswers((current) => ({ ...current, [qi]: [] }));
                    }}
                    placeholder={freeTextPlaceholder}
                    aria-label={labels.freeTextAria}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
                  />
                </label>
              ) : null}
            </div>
          )}
        </div>

        {/* footer — ring-dot pager + send arrow */}
        <div className="primitive-card-footer flex items-center justify-between">
          <span className="flex items-center gap-2">
            {paged && (
              <>
                <button
                  type="button"
                  aria-label={labels.previous}
                  disabled={qi === 0}
                  onClick={() => setQi((current) => Math.max(0, current - 1))}
                  className="flex size-6 items-center justify-center rounded-[5px] text-ink-3 transition-colors duration-100 enabled:hover:bg-hover enabled:hover:text-ink-2 disabled:opacity-35"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <span className="flex items-center gap-1">
                  {QUESTIONS.map((q, i) => (
                    <button
                      key={q.q}
                      type="button"
                      aria-label={labels.goTo.replace('{{n}}', String(i + 1))}
                      aria-current={i === qi ? "step" : undefined}
                      onClick={() => setQi(i)}
                      className="rounded-full transition-all duration-300"
                      style={
                        i === qi
                          ? { width: 9, height: 9, border: "2.5px solid var(--ink)" }
                          : q.answered !== undefined
                            ? { width: 7, height: 7, background: "var(--ink-3)" }
                            : { width: 7, height: 7, border: "1.5px solid var(--ink-3)" }
                      }
                    />
                  ))}
                </span>
                <button
                  type="button"
                  aria-label={labels.next}
                  disabled={last}
                  onClick={() => setQi((current) => Math.min(QUESTIONS.length - 1, current + 1))}
                  className="flex size-6 items-center justify-center rounded-[5px] text-ink-3 transition-colors duration-100 enabled:hover:bg-hover enabled:hover:text-ink-2 disabled:opacity-35"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </>
            )}
          </span>
          {!locked && (
            <button
              type="button"
              aria-label={labels.send}
              disabled={!hasAnswer}
              onClick={() => commit(qi)}
              className="-mr-0.5 flex size-7 items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.96]"
              style={{
                background: hasAnswer ? "var(--ink)" : "var(--field)",
                color: hasAnswer ? "var(--surface)" : "var(--ink-3)",
                boxShadow: hasAnswer ? "inset 0 1px 0 rgba(255,255,255,0.14)" : "var(--shadow-btn)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
