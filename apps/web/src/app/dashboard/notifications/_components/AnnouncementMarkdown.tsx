import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const REMARK_PLUGINS = [remarkGfm];

/**
 * 公告正文的 Markdown 渲染。
 *
 * 正文由管理后台的富文本编辑器写成 Markdown：标题到三级、有序与无序列表（可嵌套）、引用、
 * 围栏代码、分割线，以及加粗、斜体、删除线、行内代码和链接。这里为每一种都给了明确样式——
 * 原来只给无序列表上了圆点，编号列表也被画成圆点。
 *
 * 不解析原始 HTML（react-markdown 默认关闭，别打开）；站外链接在新标签页打开。
 */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-4 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => (
    <h1 className="text-mr-ink mb-3 mt-7 text-xl font-semibold leading-snug first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-mr-ink mb-2 mt-6 text-lg font-semibold leading-snug first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-mr-ink mb-1.5 mt-5 text-base font-semibold leading-snug first:mt-0">
      {children}
    </h3>
  ),
  ul: ({ children }) => (
    <ul className="my-4 list-disc space-y-1.5 pl-[1.4rem] first:mt-0 last:mb-0 [&_ol]:my-1.5 [&_ul]:my-1.5">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 list-decimal space-y-1.5 pl-[1.4rem] first:mt-0 last:mb-0 [&_ol]:my-1.5 [&_ul]:my-1.5">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="marker:text-mr-muted">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-mr-line text-mr-ink my-4 border-l pl-4">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="bg-mr-code-surface text-mr-code-ink rounded-mr-compact text-mr-caption my-4 overflow-x-auto p-3 font-mono leading-6 [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="bg-mr-code-surface text-mr-code-ink rounded-mr-compact text-mr-caption px-[0.4em] py-[0.15em] font-mono">
      {children}
    </code>
  ),
  hr: () => <hr className="border-mr-line-soft my-6" />,
  strong: ({ children }) => (
    <strong className="text-mr-ink font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-mr-muted line-through">{children}</del>
  ),
  a: ({ href, children }) => {
    const external = /^https?:\/\//i.test(href ?? '');
    return (
      <a
        href={href}
        className="text-sky-300 underline underline-offset-4"
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="[&_td]:border-mr-line-soft w-full border-collapse text-left [&_td]:border-t [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold">
        {children}
      </table>
    </div>
  ),
};

export function AnnouncementMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}
