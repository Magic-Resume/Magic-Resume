"use client";

import { useCallback, useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * CODE BLOCK
 * Agent-written code streams line by line; copy is live.
 * ───────────────────────────────────────────────────────── */

/**
 * 代码块：行号 + 复制。
 *
 * 原版吃的是**预先分好词的 token 数组**（`{t, c}[][]`），自己不做语法高亮，并且用一个
 * 循环定时器把代码一行行"播"出来。我们没有分词器，那套播放也是演示用的。
 *
 * 所以这里收窄成「纯文本 + 语言标签 + 复制」——相对现有的裸 `<code>` 块，真正的增量是
 * **复制按钮和行号**，那两样与高亮无关。要上高亮时，把 `tokens` 那条路加回来即可，
 * 原件在 `_vendor/CodeBlock.tsx`。
 */
export interface CodeBlockProps {
  code: string;
  /** 显示在标题栏的文件名；没有就只显示语言。 */
  filename?: string;
  /** 语言标签，如 `TypeScript`。 */
  lang?: string;
  /** 复制成功后的提示文案（走调用方的 i18n）。 */
  copyLabel?: string;
  copiedLabel?: string;
}

export default function CodeBlock({
  code,
  filename,
  lang,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = code.replace(/\n$/, '').split('\n');

  const copy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card">
      <div className="primitive-card-bar flex items-center justify-between border-b border-line">
        <span className="flex items-baseline gap-2">
          {filename && (
            <span className="font-mono text-[12px] font-medium text-ink">{filename}</span>
          )}
          {lang && <span className="text-[11.5px] text-ink-3">{lang}</span>}
        </span>
        <button
          type="button"
          aria-label={copyLabel}
          onClick={copy}
          className={`flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[11.5px]
            font-medium transition-colors duration-100 hover:bg-hover
            ${copied ? 'text-green' : 'text-ink-3 hover:text-ink'}`}
        >
          {copied ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>

      <pre className="overflow-x-auto bg-inset px-3 py-2.5 font-mono text-[11.5px] leading-[1.7]">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-5 shrink-0 text-right text-[10.5px] leading-[1.86] text-ink-3/60 select-none">
              {i + 1}
            </span>
            <span className="pl-2.5 whitespace-pre text-ink-2">{line}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
