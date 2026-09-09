import Link from 'next/link';
import { notFound } from 'next/navigation';

/**
 * 开发期陈列 / 验收页的总入口。
 *
 * 这一支下面的页面全部叫 `page.dev.tsx`，而生产构建的 `pageExtensions` 不含 `dev.tsx`
 * （见 `next.config.ts`）——所以线上连路由都没有，是真 404，chunk 也不会被打进去。
 * 挡住一个页面要在构建这一层挡，不能靠页面自己在渲染时 `return null`：那给出的是
 * 200 空白页，代码照样发出去了。
 *
 * 新增一个陈列页 = 在这个目录下建 `<名字>/page.dev.tsx`，再往下面的 ENTRIES 加一行。
 */

const ENTRIES: { href: string; name: string; note: string }[] = [
  {
    href: '/mock/genui',
    name: 'GenUI 组件陈列',
    note: '验证 GenUI 组件和共享设计令牌在深浅主题下的渲染。加 ?skin=light 可直接深链到浅色。',
  },
  {
    href: '/mock/genui/real',
    name: '真实事件流回放',
    note: '用 __fixtures__ 里录下来的后端事件喂真实前端组件，看一条完整会话渲染成什么样。',
  },
  {
    href: '/mock/template-lab',
    name: '模板实验室',
    note: '模板渲染 / 编译 / 评审的操作台，用页面内置的样例数据，不会动到你自己的简历。',
  },
];

export default function MockIndex() {
  // 兜底而已：这个文件叫 page.dev.tsx，生产构建里它不是路由。真被改回 page.tsx 时，
  // 这一行至少给的是 404 而不是空白页。
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="min-h-screen bg-desk px-6 py-16">
      <div className="mx-auto w-full max-w-[68ch]">
        <p className="font-mono text-xs tracking-[0.2em] text-muted">DEV ONLY</p>
        <h1 className="mt-2 text-[2rem] font-semibold leading-[1.15] tracking-tight text-primary">
          陈列与验收页
        </h1>
        <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-secondary">
          只在开发构建里存在：这些页面叫 <code className="font-mono text-ink-sky">page.dev.tsx</code>，
          生产构建的 <code className="font-mono text-ink-sky">pageExtensions</code> 不认这个后缀，线上访问是 404。
        </p>

        <ul className="mt-10 border-t border-hairline">
          {ENTRIES.map((entry) => (
            <li key={entry.href} className="border-b border-hairline">
              <Link
                href={entry.href}
                className="group block py-5 transition-colors hover:bg-sunk"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-base font-medium text-primary">{entry.name}</span>
                  <span className="font-mono text-xs text-muted transition-colors group-hover:text-ink-sky">
                    {entry.href}
                  </span>
                </div>
                <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-secondary">
                  {entry.note}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-xs leading-relaxed text-muted">
          加一个新的：在 <code className="font-mono">src/app/mock/</code> 下建{' '}
          <code className="font-mono">&lt;名字&gt;/page.dev.tsx</code>，再往这个文件的{' '}
          <code className="font-mono">ENTRIES</code> 里加一行。
        </p>
      </div>
    </div>
  );
}
