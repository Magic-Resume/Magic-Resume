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

/* ── 逐词显影（取自 Beautiful UI 的 StreamingText）──────────────────────────
   原版把一段**写死的纯文本**切成词，一个词一个 span 挂 `stream-in`（从 blur 4px 显影）。
   我们的正文是 markdown、每来一个 chunk 整段重渲染，照搬会让全段每次重新闪一遍。

   靠 React 的协调解决：token 按下标定键，已挂载的 span 在后续渲染里**不会重新挂载**，
   CSS 动画因此不会重播；只有新追加的 token 是新节点，于是只有它们显影。这正是要的效果，
   而且不需要记录「上次渲染到哪个字」。 */

/** 中日韩没有词间空格。按空格切，一整段中文会是**一个** token——那就等于没有效果。 */
const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}';
const TOKEN_RE = new RegExp(`[${CJK}]|[^\\s${CJK}]+|\\s+`, 'gu');

/** 不写 `both`：跑完让元素回到自然样式。留 forwards 等于给每个 span 永久挂一个
 *  filter，几百个 filter 就是几百个层叠上下文。 */
const STREAM_IN = 'stream-in 420ms cubic-bezier(0.22,0.61,0.25,1)';

function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const [token] of text.matchAll(TOKEN_RE)) {
    // 空白并进上一个 token：它不需要单独显影，独立成节点只会让节点数翻倍。
    if (/^\s+$/.test(token) && out.length) out[out.length - 1] += token;
    else out.push(token);
  }
  return out;
}

const StreamingCtx = React.createContext(false);

/**
 * 文本子节点 → 逐个 token 的 span。非文本子节点原样透传——它们由自己的渲染器处理，
 * 在那里同样会包一层，所以 `**加粗**` 里的字一样会显影。
 */
function Words({ children }: { children?: React.ReactNode }) {
  const streaming = React.useContext(StreamingCtx);
  if (!streaming) return <>{children}</>;
  return (
    <>
      {React.Children.map(children, (child, ci) =>
        typeof child === 'string'
          ? tokenize(child).map((token, i) => (
              <span key={`${ci}:${i}`} style={{ animation: STREAM_IN }}>
                {token}
              </span>
            ))
          : child,
      )}
    </>
  );
}

const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 leading-relaxed"><Words>{children}</Words></p>,
  strong: ({ children }) => <strong className="font-semibold text-white"><Words>{children}</Words></strong>,
  em: ({ children }) => <em className="italic"><Words>{children}</Words></em>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed marker:text-neutral-500"><Words>{children}</Words></li>,
  h1: ({ children }) => <h1 className="mt-3 mb-1.5 text-base font-semibold text-white"><Words>{children}</Words></h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1.5 text-[15px] font-semibold text-white"><Words>{children}</Words></h2>,
  h3: ({ children }) => <h3 className="mt-2.5 mb-1 text-sm font-semibold text-white"><Words>{children}</Words></h3>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
      <Words>{children}</Words>
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
  th: ({ children }) => <th className="border border-neutral-800 px-2.5 py-1.5 font-medium"><Words>{children}</Words></th>,
  td: ({ children }) => <td className="border border-neutral-800 px-2.5 py-1.5 align-top"><Words>{children}</Words></td>,
};

/**
 * `streaming` 只在这一轮**正在写**的时候为真。写完就换回纯文本节点：
 * 一段读完的回复从历史里恢复时不该把整篇重播一遍，几百个 span 也没有留着的理由。
 */
export default function Markdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
  return (
    <StreamingCtx.Provider value={streaming}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </StreamingCtx.Provider>
  );
}
