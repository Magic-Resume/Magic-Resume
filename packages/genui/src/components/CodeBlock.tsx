'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  languageLabel,
  tokenizeCodeLines,
  type CodeToken,
  type TokenKind,
} from './codeHighlight';

export interface CodeBlockProps {
  code: string;
  /** Displayed in the title bar and used as the region label. */
  filename?: string;
  /** A short language name such as `ts`; the component owns display labels. */
  lang?: string;
  /** Copy button text supplied by the caller's i18n. */
  copyLabel?: string;
  copiedLabel?: string;
}

const TOKEN_COLORS: Record<TokenKind, string> = {
  // Keywords sit on the sunk code surface, not on an accent-filled control.
  // `mr-accent-ink` is intentionally near-black in the dark theme and made
  // these tokens disappear against the code block background.
  kw: 'var(--mr-accent)',
  str: 'var(--mr-success)',
  num: 'var(--mr-warning)',
  fn: 'var(--mr-ink)',
  dim: 'var(--mr-muted)',
  com: 'var(--mr-muted)',
};

// The mono face handles punctuation, numbers, and Latin identifiers. CJK
// falls back per glyph to the product's regular sans face instead of gaining
// the loose spacing of a CJK-capable mono font.
const CODE_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", "Source Han Sans SC", sans-serif';
const COPY_RESET_MS = 1500;

function renderTokens(tokens: CodeToken[], lineKey: string) {
  return tokens.map((token, index) => {
    const color = token.kind ? TOKEN_COLORS[token.kind] : undefined;
    return (
      <span key={`${lineKey}:${index}`} style={color ? { color } : undefined}>
        {token.text}
      </span>
    );
  });
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CopyButton({
  copied,
  copyLabel,
  copiedLabel,
  onClick,
}: {
  copied: boolean;
  copyLabel: string;
  copiedLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={copied ? copiedLabel : copyLabel}
      onClick={onClick}
      className="text-mr-muted hover:text-mr-ink hover:bg-mr-surface-soft text-mr-label-tight flex h-7 items-center gap-1.5 rounded-md px-2 font-medium transition-colors duration-100 motion-reduce:transition-none"
    >
      <CopyIcon copied={copied} />
      <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
    </button>
  );
}

export default function CodeBlock({
  code,
  filename,
  lang,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  // Start optimistic so SSR and the first client render have the same shape;
  // unsupported contexts are removed after the capability check below.
  const [copyAvailable, setCopyAvailable] = useState(true);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const source = code.replace(/\n$/, '');
  const lines = useMemo(() => tokenizeCodeLines(source, lang), [source, lang]);
  const displayLanguage = languageLabel(lang);
  const ariaLabel = filename || displayLanguage || 'Code block';
  const gutter = `${String(lines.length).length + 1}ch`;

  useEffect(() => {
    setCopyAvailable(
      typeof navigator !== 'undefined' &&
        typeof navigator.clipboard?.writeText === 'function',
    );
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const copy = useCallback(() => {
    if (
      !copyAvailable ||
      typeof navigator === 'undefined' ||
      typeof navigator.clipboard?.writeText !== 'function'
    ) {
      setCopyAvailable(false);
      return;
    }

    try {
      void navigator.clipboard.writeText(code).then(
        () => {
          setCopied(true);
          if (copyTimer.current) clearTimeout(copyTimer.current);
          copyTimer.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
        },
        () => {
          // Permissions can be revoked after the capability check. Hiding the
          // button is preferable to leaving a control that silently does nothing.
          setCopyAvailable(false);
        },
      );
    } catch {
      // Some browsers throw before returning a promise when the document loses
      // its secure context between render and click.
      setCopyAvailable(false);
    }
  }, [code, copyAvailable]);

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      data-language={lang || undefined}
      className="border-mr-line/70 bg-mr-surface/80 shadow-mr-panel w-full max-w-3xl overflow-hidden rounded-xl border"
    >
      <div className="primitive-card-bar border-mr-line/70 bg-mr-surface/55 flex items-center justify-between border-b">
        <span className="flex min-w-0 items-baseline gap-2">
          {filename && (
            <span className="text-mr-ink text-mr-overline truncate font-mono font-medium">
              {filename}
            </span>
          )}
          {displayLanguage && (
            <span className="text-mr-muted text-mr-label-tight shrink-0">
              {displayLanguage}
            </span>
          )}
        </span>
        {copyAvailable && (
          <CopyButton
            copied={copied}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
            onClick={copy}
          />
        )}
      </div>

      <pre
        tabIndex={0}
        aria-label={ariaLabel}
        className="bg-mr-sunk/85 text-mr-ink-secondary focus-visible:ring-line-strong text-mr-ui m-0 max-w-full overflow-x-auto px-3.5 py-3 pb-3.5 pr-5 font-mono leading-[1.75] outline-none focus-visible:ring-1"
        style={{ fontFamily: CODE_FONT }}
      >
        {lines.map((line, index) => (
          <span key={index} className="flex min-w-max whitespace-pre">
            <span
              aria-hidden="true"
              className="bg-mr-sunk text-mr-muted/60 sticky left-0 z-[1] shrink-0 select-none pr-3 text-right tabular-nums"
              style={{ width: gutter }}
            >
              {index + 1}
            </span>
            <span>{renderTokens(line, `line-${index}`)}</span>
          </span>
        ))}
      </pre>
    </div>
  );
}
