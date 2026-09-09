'use client';

import { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import {
  AgentProgress,
  ApprovalCard,
  ChatComposer,
  CodeBlock,
  ContextCards,
  DiffTable,
  FilterTable,
  FineTuneCard,
  LoadingState,
  RecordsTable,
  RecommendationCard,
  SearchList,
  SidebarNav,
  StreamingText,
  ThinkingState,
  ToolChips,
} from '@magic-resume/genui';

/**
 * GenUI 组件验收页（仅开发环境）。
 *
 * 用途只有一个：验证 GenUI 组件是否都消费共享设计系统的语义令牌，并在深浅主题下保持
 * 可读性与交互一致。
 *
 * 生产环境返回 404；这是开发期验收 fixture，不是产品路由。
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

/* i18n-ignore：开发陈列页样例 */
const RECORDS_DEMO_ROWS = [
  {
    id: 'a',
    mark: 'B',
    sortValues: { date: 2 },
    cells: { role: '前端开发实习生', date: '12-03', status: '面试中' },
  },
  {
    id: 'b',
    mark: 'T',
    sortValues: { date: 1 },
    cells: { role: '客户端开发', date: '11-18', status: '已投递' },
  },
];

/**
 * RecordsTable 的「AI 属性列」演示。
 *
 * 组件本身**不会**自己跑计算：`onCalculate` 交给调用方，进度由 `calculating` 从外面推。
 * 这里的定时器就是那个「调用方」——它是假的，所以这一条挂在 `demo` 档而不是 `wired`。
 * 产品里要用这一列，得先有真的计算通道，否则就是个会转圈然后凭空填字的列。
 */
function RecordsAiColumnDemo() {
  const base = [
    {
      key: 'role',
      label: '岗位',
      sortable: true,
      meta: { type: 'Text', tool: '手动记录', toolKind: 'user' as const },
    },
    {
      key: 'date',
      label: '日期',
      sortable: true,
      width: 'md' as const,
      meta: { type: 'Date', tool: '手动记录', toolKind: 'user' as const },
    },
    {
      key: 'status',
      label: '状态',
      width: 'md' as const,
      meta: {
        type: 'Single select',
        tool: '手动记录',
        toolKind: 'user' as const,
      },
    },
  ]; /* i18n-ignore：开发陈列页样例 */
  const [aiType, setAiType] = useState<string | null>(null);
  const [calculating, setCalculating] = useState<{
    key: string;
    resolved: number;
  } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!calculating) return;
    if (calculating.resolved > RECORDS_DEMO_ROWS.length) {
      setDone(true);
      setCalculating(null);
      return;
    }
    const timer = setTimeout(
      () =>
        setCalculating((current) =>
          current ? { ...current, resolved: current.resolved + 1 } : current,
        ),
      420,
    );
    return () => clearTimeout(timer);
  }, [calculating]);

  const columns = aiType
    ? [
        ...base,
        {
          key: 'ai',
          label: '公司规模', // i18n-ignore：开发陈列页样例
          meta: {
            type: aiType,
            tool: '网页搜索', // i18n-ignore：开发陈列页样例
            toolKind: 'web' as const,
            inputs: ['岗位'], // i18n-ignore：开发陈列页样例
            prompt: {
              before: '查一下 ',
              chip: '岗位',
              after: ' 所在公司的规模。',
            }, // i18n-ignore：开发陈列页样例
          },
        },
      ]
    : base;

  return (
    <RecordsTable
      ariaLabel="AI 属性列样例" /* i18n-ignore：开发陈列页样例 */
      selectable
      columns={columns}
      rows={RECORDS_DEMO_ROWS.map((row) => ({
        ...row,
        cells: { ...row.cells, ai: done ? '200–500 人' : '—' }, // i18n-ignore：开发陈列页样例
      }))}
      calculating={calculating}
      propertyTypes={['Text', 'URL', 'Single select', 'JSON']}
      modelOptions={[
        'Sprinkles 5',
        'Sprinkles 4.2',
      ]} /* i18n-ignore：开发陈列页样例 */
      onAddColumn={(type) => {
        setDone(false);
        setAiType(type);
      }}
      onCalculate={(key) => setCalculating({ key, resolved: 0 })}
      onHideColumn={() => {
        setAiType(null);
        setDone(false);
      }}
    />
  );
}

const COMPONENTS: [string, () => React.ReactNode, Stage][] = [
  [
    'AgentProgress',
    () => (
      <div className="agent-progress-stage">
        <AgentProgress
          steps={[
            { key: 'read', label: '读取简历', status: 'completed' },
            {
              key: 'rewrite',
              label: '重写工作经历',
              status: 'in_progress',
              progress: 0.64,
            },
            { key: 'align', label: '对齐岗位 JD', status: 'pending' },
          ]}
        />
      </div>
    ),
    'wired',
  ],
  [
    'ThinkingState',
    () => (
      <ThinkingState
        label="正在思考" // i18n-ignore：开发陈列页的样例数据，不是产品文案
        doneLabel="思考了 4 秒"
        rows={[
          {
            primary: '先看这份简历的工作经历部分写得够不够具体。',
            prose: true,
          },
          { primary: '第 2 段只有职责没有结果，缺量化。', prose: true },
        ]}
      />
    ),
    'props',
  ],
  [
    'CodeBlock · TypeScript',
    () => (
      <CodeBlock
        lang="TypeScript"
        filename="resume.ts"
        code={
          'const resume = await readResume();\nconst gaps = findGaps(resume.sections.experience);\nreturn gaps.map(toSuggestion);'
        }
        copyLabel="复制"
        copiedLabel="已复制"
      />
    ),
    'wired',
  ],
  [
    'CodeBlock · JSON',
    () => (
      <CodeBlock
        lang="json"
        code={JSON.stringify(
          {
            title: '字节跳动前端岗位调研结论',
            scope:
              '字节跳动官网公开的 2027 届前端岗位：抖音平台产品、抖音体验与效能、今日头条、APM。',
            conclusion:
              '岗位普遍强调 React、TypeScript 与跨端工程能力，项目经历应补充可验证的性能指标。',
            sources: ['官网职位页', '技术团队公开分享'],
          },
          null,
          2,
        )}
        copyLabel="复制"
        copiedLabel="已复制"
      />
    ),
    'wired',
  ],
  [
    'LoadingState',
    () => (
      <LoadingState
        label="正在优化简历"
        /* i18n-ignore：开发陈列页样例 */ startedAt={Date.now() - 4200}
      />
    ),
    'props',
  ],
  [
    'ToolChips',
    () => (
      <ToolChips
        working
        title="2 次工具调用" /* i18n-ignore：开发陈列页样例 */
        rows={[
          {
            icon: 'read',
            label: '读取',
            chip: '我的简历',
            detail: [{ text: '工作经历 · 4 段' }],
          },
          {
            icon: 'edit',
            label: '重写',
            chip: '工作经历 · 第 2 段',
            mono: false,
          },
        ]}
      />
    ),
    'props',
  ],
  [
    'ApprovalCard',
    () => (
      <ApprovalCard
        freeTextPlaceholder="或者直接说…" /* i18n-ignore：开发陈列页样例 */
        labels={{
          previous: '上一个',
          next: '下一个',
          send: '确认',
          goTo: '第 {{n}} 个',
          freeText: '其他',
          freeTextAria: '自己写',
        }} /* i18n-ignore：开发陈列页样例 */
        questions={[
          {
            q: '要把工作经历改得更量化吗？',
            type: 'radio',
            options: ['好，改', '先看看建议', '不用'],
          },
          {
            q: '允许读取你的简历吗？',
            type: 'radio',
            options: ['允许', '拒绝'],
          },
        ]} /* i18n-ignore：开发陈列页样例 */
      />
    ),
    'wired',
  ],
  [
    'ContextCards',
    () => (
      <ContextCards
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
      <SearchList
        placeholder="搜索能力…" /* i18n-ignore：开发陈列页样例 */
        items={[
          '优化我的简历',
          '针对这个岗位调整',
          '翻译成英文',
          '模拟面试',
          '分析匹配度',
        ]}
      />
    ),
    'props',
  ],
  ['StreamingText', () => <StreamingText />, 'demo'],
  [
    'RecommendationCard',
    () => (
      <RecommendationCard
        message="先改哪一段？" /* i18n-ignore：开发陈列页样例 */
        recommended={0}
        options={[
          {
            label: '工作经历',
            why: '这段占篇幅最大，改动收益最高',
            confidence: 'high',
          },
          {
            label: '项目经历',
            why: '数字密度够，但结果写得薄',
            confidence: 'medium',
          },
          { label: '技能清单', confidence: 'low' },
        ]} /* i18n-ignore：开发陈列页样例 */
        labels={{
          alternatives: '其他方案',
          others: '别的选择',
          accept: '就这个',
          accepted: '已选择',
          confidence: {
            high: '很有把握',
            medium: '需要你确认',
            low: '信息不足',
            none: '没说',
          },
        }} /* i18n-ignore：开发陈列页样例 */
      />
    ),
    'wired',
  ],
  ['ChatComposer', () => <ChatComposer />, 'demo'],
  ['DiffTable', () => <DiffTable />, 'demo'],
  [
    'RecordsTable',
    () => (
      <RecordsTable
        ariaLabel="投递记录样例" /* i18n-ignore：开发陈列页样例 */
        selectable
        columns={[
          { key: 'role', label: '岗位', sortable: true },
          { key: 'date', label: '日期', sortable: true, width: 'md' },
          { key: 'status', label: '状态', width: 'md' },
        ]} /* i18n-ignore：开发陈列页样例 */
        rows={[
          {
            id: 'a',
            mark: 'B',
            sortValues: { date: 2 },
            cells: { role: '前端开发实习生', date: '12-03', status: '面试中' },
          },
          {
            id: 'b',
            mark: 'T',
            sortValues: { date: 1 },
            cells: { role: '客户端开发', date: '11-18', status: '已投递' },
          },
        ]} /* i18n-ignore：开发陈列页样例 */
      />
    ),
    'wired',
  ],
  ['RecordsTable · AI 列', () => <RecordsAiColumnDemo />, 'demo'],
  ['FilterTable', () => <FilterTable />, 'props'],
  [
    'SidebarNav',
    () => (
      <SidebarNav
        workspace={{
          name: '我的简历',
          monogram: 'M',
        }} /* i18n-ignore：开发陈列页样例 */
        action={{
          label: '新对话',
          onClick: () => undefined,
        }} /* i18n-ignore：开发陈列页样例 */
        activeKey="a"
        sections={[
          {
            key: 'today',
            label: '今天',
            items: [
              { key: 'a', label: '帮我改一下项目经历' },
              { key: 'b', label: '这份 JD 匹配度怎么样' },
            ],
          },
          {
            key: 'week',
            label: '最近 7 天',
            items: [{ key: 'c', label: '模拟面试复盘' }],
          },
        ]} /* i18n-ignore：开发陈列页样例 */
      />
    ),
    'wired',
  ],
  ['FineTuneCard', () => <FineTuneCard />, 'demo'],
];

export default function GenUIGallery() {
  // `?skin=light` 可深链到浅色。无头截图没法点按钮，而"两套主题都得看"正是这页的用途。
  const [light, setLight] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('skin') === 'light')
      setLight(true);
  }, []);

  // 兜底而已：这个文件叫 page.dev.tsx，生产构建的 pageExtensions 里没有 dev.tsx，
  // 它根本不会成为路由。真被改回 page.tsx 时，这一行至少给的是 404 而不是空白页。
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className={light ? 'light' : 'dark'}>
      <div className="bg-desk text-primary min-h-screen px-6 py-10">
        <div className="mx-auto max-w-4xl">
          <header className="mb-8 flex items-center gap-4">
            <div className="flex-1">
              <h1 className="text-lg font-semibold">
                GenUI · 令牌验证{/* i18n-ignore：仅开发环境 */}
              </h1>
              <p className="text-secondary text-mr-caption mt-1">
                17 个组件走我们的令牌别名层渲染。切换主题看两套是否都成立。
                {/* i18n-ignore：仅开发环境 */}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLight((v) => !v)}
              className="border-hairline bg-raised hover:bg-hover text-mr-caption rounded-lg border px-3.5 py-2 transition-colors"
            >
              {light ? '切到深色' : '切到浅色'}
            </button>
          </header>

          <div className="space-y-10">
            {COMPONENTS.map(([name, render, stage]) => (
              <section key={name}>
                <h2 className="text-muted text-mr-label mb-3 flex items-center gap-2 font-mono uppercase tracking-wider">
                  {name}
                  <span
                    className={
                      stage === 'wired'
                        ? 'bg-green-tint text-green text-mr-micro rounded-full px-2 py-0.5 normal-case tracking-normal'
                        : stage === 'props'
                          ? 'bg-tint-sky text-ink-sky text-mr-micro rounded-full px-2 py-0.5 normal-case tracking-normal'
                          : 'bg-hover text-muted text-mr-micro rounded-full px-2 py-0.5 normal-case tracking-normal'
                    }
                  >
                    {STAGE_LABEL[stage]}
                  </span>
                </h2>
                <div
                  className={
                    name.startsWith('CodeBlock')
                      ? 'max-w-3xl'
                      : 'border-hairline rounded-xl border p-4'
                  }
                >
                  {render()}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
