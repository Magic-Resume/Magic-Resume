'use client';

import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { useTranslation } from 'react-i18next';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '@magic-resume/genui';
import { normalizeMarkdownSource } from './markdownSource';
import type { CitationSource } from '../types';
import {
  citationAnchor,
  citationGroupAnchor,
  linkCitationMarkers,
  visibleCitationSources,
} from './citationSources';
import CitationChip from './CitationChip';
import SiteFavicon from './SiteFavicon';

/**
 * Markdown renderer for assistant chat bubbles. The agent replies in markdown
 * (bold, ordered/unordered lists, headings, inline code…), so raw text would
 * leak `**` / `1.` markers. Styling is an explicit component map tuned for the
 * dark chat surface — no typography plugin dependency.
 */
/**
 * 围栏代码块 → GenUI 的 CodeBlock（snippet 形态：行号 + 复制）。
 *
 * 提成组件是因为 `COMPONENTS` 是模块级常量、用不了 hook，而复制按钮的文案要走 i18n。
 */
function CodeRenderer({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const lang = /language-(\w+)/.exec(className ?? '')?.[1];
  // 围栏还没闭合时，光标标记会被解析进代码块。它不可见，但会跟着「复制」进用户的剪贴板
  // ——粘出来是一个看不见的字符。这里剥掉。
  const raw = String(children ?? '');
  const code = raw.split(CARET).join('');
  // 标记落进了这里 = 围栏还没闭合，写入头此刻就在代码块末尾。光标得跟过来，
  // 否则它会在整个代码块流式期间凭空消失。
  const writing = code !== raw;
  if (!lang) {
    return (
      // 令牌而非写死色：浅色主题切过去时它会跟着走。字色刻意**中性**——sky 蓝要留给
      // 真正的链接与强调，被行内代码占着，一段技术回答里满屏都是蓝的，强调就失效了。
      <code className="bg-mr-sunk text-mr-ink shadow-mr-control rounded-mr-compact px-[0.4em] py-[0.15em] font-mono text-mr-caption">
        {code}
        {writing && <Caret />}
      </code>
    );
  }
  return (
    <div className="my-2">
      <CodeBlock
        code={code}
        lang={lang}
        copyLabel={t('aiLab.chat.copy')}
        copiedLabel={t('aiLab.chat.copied')}
      />
      {writing && <Caret />}
    </div>
  );
}

/* ── 逐词显影（遵循 GenUI 的 StreamingText 视觉语言）────────────────────────
   原版把一段**写死的纯文本**切成词，一个词一个 span 挂 `stream-in`（从 blur 4px 显影）。
   我们的正文是 markdown、每来一个 chunk 整段重渲染，照搬会让全段每次重新闪一遍。

   靠 React 的协调解决：token 按下标定键，已挂载的 span 在后续渲染里**不会重新挂载**，
   CSS 动画因此不会重播；只有新追加的 token 是新节点，于是只有它们显影。这正是要的效果，
   而且不需要记录「上次渲染到哪个字」。 */

/** 中日韩没有词间空格。按空格切，一整段中文会是**一个** token——那就等于没有效果。 */
const CJK =
  '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}';

/**
 * 光标的位置标记（U+2063 隐形分隔符）。
 *
 * 光标必须**跟在最后一个字后面**。原来它是 `<Markdown>` 的兄弟节点，而 markdown 渲染出来
 * 的是块级元素，所以它掉到段落下面单独占一行。React 这边拿不到「全篇最后一个 token」，
 * CSS 的 `:last-child::after` 又表达不了「最深的那个末节点」——把标记混进 markdown 源码，
 * 解析器会把它并进最后一段的最后一个文本节点，位置于是天然正确。
 */
const CARET = '⁣';

// CJK keeps the soft blur feel, but animates short phrases instead of allocating
// one filtered DOM node per character. Eight characters is still visually local
// while cutting a long Chinese answer's animated node count by roughly 8x.
const TOKEN_RE = new RegExp(
  `${CARET}|[${CJK}]{1,8}|[^\\s${CJK}${CARET}]+|\\s+`,
  'gu',
);
const STREAMING_SPAN_LIMIT = 72;
const STREAMING_SPAN_TTL_MS = 420;
const REMARK_PLUGINS = [remarkGfm];

/** Markdown 专用的可读显影：保留 blur，但起点不全透明。 */
const STREAM_IN = 'markdown-stream-in 360ms var(--narrate-ease)';

function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const [token] of text.matchAll(TOKEN_RE)) {
    // 空白并进上一个 token：它不需要单独显影，独立成节点只会让节点数翻倍。
    if (/^\s+$/.test(token) && out.length) out[out.length - 1] += token;
    else out.push(token);
  }
  return out;
}

/**
 * 写入光标。用 `bg-[#fff]` 不用 `bg-white`——本仓把 `--color-white` 重定义成了暖墨色
 * （为浅色主题服务），`text-white`/`bg-white` 在深色下算出来是深的。
 */
function Caret() {
  return (
    <span className="mr-motion-breathe ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[2px] rounded-[1px] bg-[#fff] align-baseline" />
  );
}

type TokenPass = {
  streaming: boolean;
  previous: ReadonlyMap<string, number>;
  next: Map<string, number>;
  occurrences: Map<string, number>;
  now: number;
  animated: number;
};

const StreamingCtx = React.createContext<TokenPass | null>(null);

/**
 * 文本子节点 → 逐个 token 的 span。非文本子节点原样透传——它们由自己的渲染器处理，
 * 在那里同样会包一层，所以 `**加粗**` 里的字一样会显影。
 */
function Words({ children }: { children?: React.ReactNode }) {
  const pass = React.useContext(StreamingCtx);
  if (!pass?.streaming) return <>{children}</>;
  return (
    <>
      {React.Children.map(children, (child, ci) =>
        typeof child === 'string'
          ? tokenize(child).map((token, i) => {
              if (token === CARET) return <Caret key={`${ci}:${i}`} />;

              // Markdown 在列表、强调符等边界上会重建祖先节点。React key 无法跨祖先重建
              // 保住动画状态，所以按「token 内容 + 全文第几次出现」在消息级记录已显影项。
              // 旧 token 即使被重新挂载也直接显示，只有真正追加的 token 才从 blur 进入。
              const occurrence = pass.occurrences.get(token) ?? 0;
              pass.occurrences.set(token, occurrence + 1);
              const tokenId = `${token}\u0000${occurrence}`;
              const firstSeen = pass.previous.get(tokenId) ?? pass.now;
              pass.next.set(tokenId, firstSeen);
              const isNew = !pass.previous.has(tokenId);
              const keepAnimatedNode =
                pass.now - firstSeen < STREAMING_SPAN_TTL_MS &&
                pass.animated < STREAMING_SPAN_LIMIT;
              if (!keepAnimatedNode) return token;
              pass.animated += 1;
              return (
                <span
                  key={`${ci}:${i}`}
                  style={isNew ? { animation: STREAM_IN } : undefined}
                >
                  {token}
                </span>
              );
            })
          : child,
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────
 * 正文排版。
 *
 * 令牌用 `--ink` / `--line` / `--surface` 那一套，**不用裸 `neutral-*` 和 `text-white`**：
 * 界面其余部分（卡片、投递面板、审批卡）都已经在这套语义色上，正文还留在 Tailwind
 * 默认灰阶里，两者放在同一屏就是两种冷暖——这才是它显脏的根因，不是字号。
 *
 * 层级靠**上间距和字重**拉开，不靠字号堆。正文基准是 16px/28（在 `ChatThread` 的气泡
 * 容器上），原来 h1/h2/h3 是 18/17/16px——三级之间各差 1px，等于没有层级，而 h3 和正文
 * 完全同号。这是对话不是文档，标题不能靠放大来占位置。
 * ───────────────────────────────────────────────────────── */
const COMPONENTS: Components = {
  p: ({ children }) => (
    <p className="my-3.5 first:mt-0 last:mb-0">
      <Words>{children}</Words>
    </p>
  ),
  strong: ({ children }) => (
    <strong className="text-mr-ink font-semibold">
      <Words>{children}</Words>
    </strong>
  ),
  em: ({ children }) => (
    <em className="italic">
      <Words>{children}</Words>
    </em>
  ),
  ul: ({ children }) => (
    <ul className="my-3.5 list-disc space-y-1.5 pl-[1.4rem] first:mt-0 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3.5 list-decimal space-y-1.5 pl-[1.4rem] first:mt-0 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="marker:text-mr-muted">
      <Words>{children}</Words>
    </li>
  ),
  // 正文基准是 16px/28（见 ChatThread 的气泡容器）。三级标题 19 / 17 / 16，
  // 层级主要靠**上间距**（24 / 20 / 16）拉开——h3 和正文同号，只靠字重区分，
  // 因为再往下缩就比正文还小，读起来不像标题像批注。
  h1: ({ children }) => (
    <h1 className="text-mr-ink mb-2 mt-6 text-[19px] font-semibold leading-snug first:mt-0">
      <Words>{children}</Words>
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-mr-ink mb-1.5 mt-5 text-[17px] font-semibold leading-snug first:mt-0">
      <Words>{children}</Words>
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-mr-ink mb-1 mt-4 text-base font-semibold leading-snug first:mt-0">
      <Words>{children}</Words>
    </h3>
  ),
  code: CodeRenderer,
  // CodeBlock 自带外壳，`pre` 只做透传——再包一层 `<pre>` 会把它的圆角和标题栏套进
  // 一个等宽块里。
  pre: ({ children }) => <>{children}</>,
  // 引用块是**强调**不是降级：模型用它基本都在划重点，把它调暗正好反了。
  // 左规保持 1px 中性发丝线——更粗的彩色左条是最容易辨认的模板化痕迹。
  blockquote: ({ children }) => (
    <blockquote className="border-mr-line text-mr-ink my-4 border-l pl-4 font-medium leading-7">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-mr-line my-4" />,
  // 只画横向分隔线，不画网格。逐格描边在深色底上会变成一张亮线网，正文表格通常只有
  // 三五行，撑不起那么重的结构——投递面板定稿时也是这个结论。
  table: ({ children }) => (
    <div className="shadow-mr-control my-3.5 overflow-x-auto rounded-mr-card">
      <table className="w-full border-collapse text-mr-body leading-normal">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-mr-sunk/60 text-mr-ink-secondary text-left text-mr-caption">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="border-mr-line border-b px-3 py-2 font-medium">
      <Words>{children}</Words>
    </th>
  ),
  td: ({ children }) => (
    <td className="border-mr-line/60 border-b px-3 py-2 align-top leading-relaxed">
      <Words>{children}</Words>
    </td>
  ),
};

function LinkRenderer({
  children,
  href,
  sources,
  interactiveLinks,
}: {
  children?: React.ReactNode;
  href?: string;
  sources: CitationSource[];
  interactiveLinks: boolean;
}) {
  const { t } = useTranslation();
  const label = React.Children.toArray(children).join('').trim();
  const citationIds = /^\d+(?:,\d+)*$/.test(label)
    ? label.split(',').map(Number)
    : [];
  const isCitation =
    citationIds.length === 1
      ? href === citationAnchor(citationIds[0]) ||
        href === citationAnchor(citationIds[0], false)
      : citationIds.length > 1 &&
        (href === citationGroupAnchor(citationIds) ||
          href === citationGroupAnchor(citationIds, false));
  // Match the stable citation id rather than the Markdown parser's `href`.
  // URL parsers are allowed to normalize trailing slashes and escaping; strict
  // string equality made a valid citation silently fall back to a plain [n].
  const visibleSources = visibleCitationSources(sources);
  const citations = isCitation
    ? citationIds.flatMap((citationId) => {
        const source = visibleSources.find(
          (candidate) => candidate.citationId === citationId,
        );
        return source ? [source] : [];
      })
    : [];
  if (citations[0]?.url) {
    return (
      <CitationChip citations={citations} interactive={interactiveLinks} />
    );
  }
  if (isCitation) {
    const missingIds = citationIds.join(',');
    const missingLabel = t('aiLab.sources.missing', { id: missingIds });
    return (
      <span
        title={missingLabel}
        aria-label={missingLabel}
        data-citation-missing={missingIds}
        className="h-5.5 bg-mr-sunk text-mr-muted mx-0.5 inline-flex items-center gap-1.5 rounded-full px-1.5 align-[-1px] text-mr-label-tight leading-none"
      >
        <SiteFavicon
          source={{}}
          className="size-[14px] rounded-full"
          iconSize={8}
        />
        <span>{t('aiLab.sources.unavailable')}</span>
      </span>
    );
  }
  if (!interactiveLinks) {
    return (
      <span className="text-mr-accent-ink decoration-line underline underline-offset-2">
        <Words>{children}</Words>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
    >
      <Words>{children}</Words>
    </a>
  );
}

/**
 * `streaming` 只在这一轮**正在写**的时候为真。写完就换回纯文本节点：
 * 一段读完的回复从历史里恢复时不该把整篇重播一遍，几百个 span 也没有留着的理由。
 */
export default function Markdown({
  children,
  streaming = false,
  sources = [],
  interactiveLinks = true,
  inline = false,
}: {
  children: string;
  streaming?: boolean;
  sources?: CitationSource[];
  /** False when rendered inside another interactive control such as a widget action button. */
  interactiveLinks?: boolean;
  /** Compact widget copy should not introduce a block-level paragraph wrapper. */
  inline?: boolean;
}) {
  const source = linkCitationMarkers(
    normalizeMarkdownSource(children),
    sources,
  );
  const components = React.useMemo<Components>(
    () => ({
      ...COMPONENTS,
      ...(inline
        ? {
            p: ({ children: paragraphChildren }) => (
              <span>
                <Words>{paragraphChildren}</Words>
              </span>
            ),
          }
        : {}),
      a: ({ children: linkChildren, href }) => (
        <LinkRenderer
          href={href}
          sources={sources}
          interactiveLinks={interactiveLinks}
        >
          {linkChildren}
        </LinkRenderer>
      ),
    }),
    [inline, interactiveLinks, sources],
  );
  const visibleTokens = React.useRef<Map<string, number>>(new Map());
  // 每次渲染独立计数；effect 只在这一帧提交后才替换 previous，兼容 Strict Mode 双渲染。
  const pass: TokenPass = {
    streaming,
    previous: visibleTokens.current,
    next: new Map(),
    occurrences: new Map(),
    now: Date.now(),
    animated: 0,
  };
  React.useEffect(() => {
    visibleTokens.current = pass.next;
  });

  return (
    <StreamingCtx.Provider value={pass}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {streaming ? source + CARET : source}
      </ReactMarkdown>
    </StreamingCtx.Provider>
  );
}
