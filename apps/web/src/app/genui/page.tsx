'use client';

import { useEffect, useState } from 'react';
import { Beautiful } from '@magic-resume/genui';

/**
 * Beautiful UI 组件陈列页（仅开发环境）。
 *
 * 用途只有一个：**验证令牌别名层**。那 16 个组件用的是另一套语义名（ink / surface /
 * inset / line / accent），我们在 `globals.css` 的 `@theme` 里做了一层别名映射；映射
 * 对不对，只有把它们全部渲染出来、深浅色各切一次才看得见——单看 CSS 是看不出
 * 「`surface` 映射到 paper 会让深色下每张卡都白成一片」这种问题的。
 *
 * 生产环境返回 404：它引用的组件目前还是自演示 demo（内置假数据、自己跑定时器），
 * 不是产品功能。
 */

/**
 * 三档状态，刻意分清楚：
 *
 * - `wired`  已接进产品，跑的是真实数据流
 * - `props`  剥掉了假数据、能吃 props，但**还没有任何调用点**——本页的样例是手写的
 * - `demo`   原封未动的自演示组件：内置假数据 + 自己跑的定时器
 *
 * 之前只分两档（"已产品化" / "自演示"），结果「能吃 props」被读成「已经在用了」。
 * 差别很大：前者只是准备好了，后者才是真的在跑。
 */
type Stage = 'wired' | 'props' | 'demo';

const STAGE_LABEL: Record<Stage, string> = {
  wired: '已接入 · 真实数据',
  props: '能吃 props · 未接线',
  demo: '自演示 demo',
};

const COMPONENTS: [string, () => React.ReactNode, Stage][] = [
  [
    'ThinkingState',
    () => (
      <Beautiful.ThinkingState
        label="正在思考" // i18n-ignore：开发陈列页的样例数据，不是产品文案
        doneLabel="思考了 4 秒"
        rows={[
          { primary: '先看这份简历的工作经历部分写得够不够具体。', prose: true },
          { primary: '第 2 段只有职责没有结果，缺量化。', prose: true },
        ]}
      />
    ),
    'props',
  ],
  [
    'CodeBlock',
    () => (
      <Beautiful.CodeBlock
        lang="TypeScript"
        filename="resume.ts"
        code={'const resume = await readResume();\nconst gaps = findGaps(resume.sections.experience);\nreturn gaps.map(toSuggestion);'}
        copyLabel="复制"
        copiedLabel="已复制"
      />
    ),
    'wired',
  ],
  [
    'LoadingState',
    () => <Beautiful.LoadingState label="正在优化简历" /* i18n-ignore：开发陈列页样例 */ startedAt={Date.now() - 4200} />,
    'props',
  ],
  [
    'ToolChips',
    () => (
      <Beautiful.ToolChips
        working
        title="2 次工具调用" /* i18n-ignore：开发陈列页样例 */
        rows={[
          { icon: 'read', label: '读取', chip: '我的简历', detail: [{ text: '工作经历 · 4 段' }] },
          { icon: 'edit', label: '重写', chip: '工作经历 · 第 2 段', mono: false },
        ]}
      />
    ),
    'props',
  ],
  [
    'TaskRows',
    () => (
      <Beautiful.TaskRows
        list
        tasks={[
          { key: 'read', label: '读取简历', status: 'done', pill: '已完成', amount: '4 个模块' },
          { key: 'rewrite', label: '重写工作经历', status: 'running', step: 2, amount: '第 2 段' },
          { key: 'align', label: '对齐岗位 JD', status: 'pending', step: 3 },
        ]}
      />
    ),
    'props',
  ],
  [
    'ApprovalCard',
    () => (
      <Beautiful.ApprovalCard
        submitLabel="确认"
        freeTextPlaceholder="或者直接说…" /* i18n-ignore：开发陈列页样例 */
        questions={[
          { q: '要把工作经历改得更量化吗？', type: 'radio', options: ['好，改', '先看看建议', '不用'] },
        ]}
      />
    ),
    'props',
  ],
  [
    'ContextCards',
    () => (
      <Beautiful.ContextCards
        title="检索到的来源" /* i18n-ignore：开发陈列页样例 */
        chunks={[
          {
            title: '岗位要求片段',
            chars: '290 characters',
            body: '要求 3 年以上前端经验，熟悉 React 与性能优化，有大型项目重构经历者优先。',
            source: '前端工程师 JD.pdf',
            badge: 'PDF',
            tone: 'bg-red',
          },
        ]}
      />
    ),
    'props',
  ],
  [
    'SearchList',
    () => (
      <Beautiful.SearchList
        placeholder="搜索能力…" /* i18n-ignore：开发陈列页样例 */
        items={['优化我的简历', '针对这个岗位调整', '翻译成英文', '模拟面试', '分析匹配度']}
      />
    ),
    'props',
  ],
  ['StreamingText', () => <Beautiful.StreamingText />, 'demo'],
  ['RecommendationCard', () => <Beautiful.RecommendationCard />, 'demo'],
  ['ChatComposer', () => <Beautiful.ChatComposer />, 'demo'],
  ['DiffTable', () => <Beautiful.DiffTable />, 'demo'],
  ['RecordsTable', () => <Beautiful.RecordsTable />, 'demo'],
  ['FilterTable', () => <Beautiful.FilterTable />, 'demo'],
  ['SidebarNav', () => <Beautiful.SidebarNav />, 'demo'],
  ['FineTuneCard', () => <Beautiful.FineTuneCard />, 'demo'],
];

export default function GenUIGallery() {
  // `?skin=light` 可深链到浅色。无头截图没法点按钮，而"两套主题都得看"正是这页的用途。
  const [light, setLight] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('skin') === 'light') setLight(true);
  }, []);

  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div className={light ? 'light' : 'dark'}>
      <div className="min-h-screen bg-desk px-6 py-10 text-primary">
        <div className="mx-auto max-w-4xl">
          <header className="mb-8 flex items-center gap-4">
            <div className="flex-1">
              <h1 className="text-lg font-semibold">
              Beautiful UI · 令牌验证{/* i18n-ignore：仅开发环境 */}
            </h1>
              <p className="mt-1 text-[13px] text-secondary">
                16 个组件走我们的令牌别名层渲染。切换主题看两套是否都成立。
                {/* i18n-ignore：仅开发环境 */}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLight((v) => !v)}
              className="rounded-lg border border-hairline bg-raised px-3.5 py-2 text-[13px] transition-colors hover:bg-hover"
            >
              {light ? '切到深色' : '切到浅色'}
            </button>
          </header>

          <div className="space-y-10">
            {COMPONENTS.map(([name, render, stage]) => (
              <section key={name}>
                <h2 className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted">
                  {name}
                  <span
                    className={
                      stage === 'wired'
                        ? 'rounded-full bg-green-tint px-2 py-0.5 text-[10px] normal-case tracking-normal text-green'
                        : stage === 'props'
                          ? 'rounded-full bg-tint-sky px-2 py-0.5 text-[10px] normal-case tracking-normal text-ink-sky'
                          : 'rounded-full bg-hover px-2 py-0.5 text-[10px] normal-case tracking-normal text-muted'
                    }
                  >
                    {STAGE_LABEL[stage]}
                  </span>
                </h2>
                <div className="rounded-xl border border-hairline p-4">{render()}</div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
