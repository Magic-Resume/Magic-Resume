'use client';

import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { useTranslation } from 'react-i18next';
import remarkGfm from 'remark-gfm';
import { Beautiful } from '@magic-resume/genui';

/**
 * markdown 的语言短名 → 给人看的名字。
 *
 * 围栏里写的是 ```ts / ```py 这种缩写，直接显示在标题栏上像个代号。表里没有的原样显示，
 * 不猜——把 `xyz` 硬翻成 "XYZ Language" 只会造出一个不存在的东西。
 */
const LANG_LABEL: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  py: 'Python', sh: 'Shell', bash: 'Shell', json: 'JSON', md: 'Markdown',
  css: 'CSS', html: 'HTML', sql: 'SQL', yaml: 'YAML', yml: 'YAML',
};

/**
 * Markdown renderer for assistant chat bubbles. The agent replies in markdown
 * (bold, ordered/unordered lists, headings, inline code…), so raw text would
 * leak `**` / `1.` markers. Styling is an explicit component map tuned for the
 * dark chat surface — no typography plugin dependency.
 */
/**
 * 围栏代码块 → Beautiful UI 的 CodeBlock（行号 + 复制）。
 *
 * 提成组件是因为 `COMPONENTS` 是模块级常量、用不了 hook，而复制按钮的文案要走 i18n。
 */
function CodeRenderer({ className, children }: { className?: string; children?: React.ReactNode }) {
  const { t } = useTranslation();
  const lang = /language-(\w+)/.exec(className ?? '')?.[1];
  if (!lang) {
    return <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[12px] font-mono text-sky-300">{children}</code>;
  }
  return (
    <div className="my-2">
      <Beautiful.CodeBlock
        code={String(children ?? '')}
        lang={LANG_LABEL[lang] ?? lang}
        copyLabel={t('aiLab.chat.copy')}
        copiedLabel={t('aiLab.chat.copied')}
      />
    </div>
  );
}

const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed marker:text-neutral-500">{children}</li>,
  h1: ({ children }) => <h1 className="mt-3 mb-1.5 text-base font-semibold text-white">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1.5 text-[15px] font-semibold text-white">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2.5 mb-1 text-sm font-semibold text-white">{children}</h3>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
      {children}
    </a>
  ),
  code: CodeRenderer,
  // CodeBlock 自带外壳，`pre` 只做透传——再包一层 `<pre>` 会把它的圆角和标题栏套进
  // 一个等宽块里。
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-neutral-700 pl-3 text-neutral-400">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-neutral-800" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="text-left text-neutral-400">{children}</thead>,
  th: ({ children }) => <th className="border border-neutral-800 px-2.5 py-1.5 font-medium">{children}</th>,
  td: ({ children }) => <td className="border border-neutral-800 px-2.5 py-1.5 align-top">{children}</td>,
};

export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}
