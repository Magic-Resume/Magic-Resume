'use client';

import { useEffect, useState } from 'react';
import { ToolChips } from '@magic-resume/genui/beautiful';
import { useTranslation } from 'react-i18next';
import ChatThread from '@/app/dashboard/edit/_components/ai/conversation/ChatThread';
import { toToolChipRows, subjectOf } from '@/app/dashboard/edit/_components/ai/conversation/toolTrace';
import { WIDGETS, askChoiceKind } from '@/app/dashboard/edit/_components/ai/widgets/registry';
import type { ChatMessage, PlanTodo } from '@/app/dashboard/edit/_components/ai/types';
import EVENTS from '../__fixtures__/real-agent-events.json';

/**
 * 真实后端事件流 → 真实前端组件（仅开发环境）。
 *
 * 与隔壁的陈列页不同：这里的数据**不是手写的样例**，而是 Core 的编译产物
 * （`apps/agent-service/dist/.../event.mapper`）针对一轮「优化简历」实际产出的 SSE 事件，
 * 原样落进 `__fixtures__/real-agent-events.json`。
 *
 * 它验证的是**契约真的对得上**：后端发的 `segments` / `activity` / `summary` /
 * `tool_completed`，前端不做任何转换就能渲染。端到端跑通还需要登录态，那一步单独做；
 * 但「两边的形状对不对」这件事，这一页就能证伪。
 */

type AgentEvent = { type: string; payload?: Record<string, unknown> };

/**
 * 一次中断挂两个闸门动作 → 一张分页卡，两页都答完才算数。
 *
 * 这里不发真请求，只把裁决按下标记在页面上：要验的正是「答一页时**不该**续跑」，
 * 而那件事在真实环境里表现为「什么都没发生」，不摆出来就看不见。
 */
function InterruptProbe() {
  const [decisions, setDecisions] = useState<(boolean | null)[]>([null, null]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'gate',
      role: 'approval',
      content: '想读取你的简历来给建议',
      approvals: [
        { requestId: 'req-1', toolName: 'read_resume', scope: 'resume', status: 'pending', slotIndex: 0, question: '允许我读取你的简历吗？' },
        { requestId: 'req-1', toolName: 'write_resume', scope: 'resume', status: 'pending', slotIndex: 2, question: '允许我直接改写工作经历第 2 段吗？' },
      ],
    },
  ]);
  const settled = decisions.every((d) => d !== null);

  return (
    <div>
      <ChatThread
        messages={messages}
        onToggleCanvas={() => undefined}
        openCanvasSkillId={null}
        onApproval={(msgId, pageIndex, approved) => {
          setDecisions((prev) => prev.map((d, i) => (i === pageIndex ? approved : d)));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId && m.approvals
                ? {
                    ...m,
                    approvals: m.approvals.map((a, i) =>
                      i === pageIndex ? { ...a, status: approved ? 'approved' : 'denied' } : a,
                    ),
                  }
                : m,
            ),
          );
        }}
      />
      <pre className="mt-3 rounded-lg bg-sunk p-3 font-mono text-[11px] leading-relaxed text-secondary">
        {`slot 0 → ${decisions[0] === null ? '未答' : decisions[0] ? 'approve' : 'reject'}
slot 2 → ${decisions[1] === null ? '未答' : decisions[1] ? 'approve' : 'reject'}
续跑：${settled ? '发（两页都答完）' : '不发（还有页没答）'}`}
        {/* i18n-ignore：仅开发验收页 */}
      </pre>
    </div>
  );
}

/** 同一个 `ask_choice`，表不表态路由到两张不同的卡。 */
function ChoiceRoutingProbe() {
  const [picked, setPicked] = useState<string>('');
  const rich = {
    message: '先改哪一段？',
    options: [
      { label: '工作经历', why: '这段占篇幅最大，改动收益最高', confidence: 'high' },
      { label: '项目经历', why: '数字密度够，但结果写得薄', confidence: 'medium' },
      { label: '技能清单' },
    ],
    recommended: 0,
  };
  const plain = { message: '先改哪一段？', options: ['工作经历', '项目经历', '技能清单'] };

  const render = (label: string, args: Record<string, unknown>) => {
    const kind = askChoiceKind(args);
    const descriptor = WIDGETS[kind];
    const props = descriptor?.normalize?.(args) ?? args;
    const Card = descriptor?.component;
    return (
      <div className="flex-1">
        <div className="mb-2 font-mono text-[11px] text-muted">
          {label} → {kind}
          {/* i18n-ignore：仅开发验收页 */}
        </div>
        {Card && (
          <Card
            instance={{ widgetId: label, kind, props, status: 'pending' }}
            onAction={(r) => setPicked(`${label}: ${r.values?.choice ?? '(取消)'}`)}
          />
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-start gap-6">
        {render('表了态', rich)}
        {render('没表态', plain)}
      </div>
      <pre className="mt-3 rounded-lg bg-sunk p-3 font-mono text-[11px] text-secondary">
        {`提交的 values.choice：${picked || '（还没点）'}`}
        {/* i18n-ignore：仅开发验收页 */}
      </pre>
    </div>
  );
}

/**
 * 把一段正文按 chunk 喂进真实的 `ChatThread`，看逐词显影。
 *
 * 走的是生产组件本身，不是 Beautiful UI 那个自演示的 StreamingText——要验的正是
 * 「markdown 增量渲染 + 只有新 token 显影」这件事成不成立。
 */
function StreamingProbe({ text }: { text: string }) {
  const [n, setN] = useState(0);
  const [runId, setRunId] = useState(0);
  useEffect(() => {
    if (n >= text.length) return;
    // 一次 4 个字符，接近真实 chunk 的粒度。
    const timer = setTimeout(() => setN((v) => Math.min(text.length, v + 4)), 40);
    return () => clearTimeout(timer);
  }, [n, text.length]);

  const done = n >= text.length;
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setN(0);
          setRunId((v) => v + 1);
        }}
        className="mb-3 rounded-lg border border-hairline px-2.5 py-1 text-[12px] text-secondary"
      >
        重放{/* i18n-ignore：仅开发验收页 */}
      </button>
      <ChatThread
        key={runId}
        messages={[
          {
            id: 'stream',
            role: 'assistant',
            status: done ? 'done' : 'running',
            streamed: true,
            content: text.slice(0, n),
          },
        ]}
        onToggleCanvas={() => undefined}
        openCanvasSkillId={null}
        activity="writing"
      />
    </div>
  );
}

export default function RealDataHarness() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (process.env.NODE_ENV === 'production') return null;

  const events = EVENTS as AgentEvent[];

  // 按前端真实的消费逻辑重建：工具调用累加成一张追踪卡。
  const calls = events
    .filter((e) => e.type === 'tool_started')
    .map((e) => ({
      toolCallId: String(e.payload?.toolCallId ?? ''),
      toolName: String(e.payload?.toolName ?? ''),
      subject: subjectOf(e.payload?.args),
      done: events.some(
        (x) => x.type === 'tool_completed' && x.payload?.toolCallId === e.payload?.toolCallId,
      ),
    }));

  const todos = (events.find((e) => e.type === 'plan_update')?.payload?.todos ??
    []) as PlanTodo[];

  const messages: ChatMessage[] = [
    { id: 'u1', role: 'user', content: '帮我针对这个岗位优化一下简历' },
    { id: 't1', role: 'tools', content: '', toolCalls: calls, status: 'done' },
    {
      id: 'p1',
      role: 'plan',
      content: '任务清单',
      todos,
      startedAt: Date.now() - 9000,
      status: 'running',
      skillId: 'optimize',
    },
    {
      id: 'a1',
      role: 'assistant',
      status: 'done',
      streamed: true,
      content:
        '已经读过你的简历了。工作经历第 2 段只写了职责、没有结果，我按岗位要求补了量化。\n\n```ts\nconst gaps = findGaps(resume.sections.experience);\nreturn gaps.map(toSuggestion);\n```\n\n要我继续对齐其余几段吗？',
    },
  ];

  return (
    <div className="dark min-h-screen bg-desk px-6 py-10 text-primary">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-lg font-semibold">真实后端事件 → 真实前端组件{/* i18n-ignore：仅开发验收页 */}</h1>
        <p className="mt-1 text-[13px] text-secondary">
          数据来自 Core dist 的{/* i18n-ignore */} <code className="font-mono text-[12px]">event.mapper{/* i18n-ignore */}</code> 实际产出，
          非手写样例。下方是生产组件本身。
          {/* i18n-ignore：仅开发环境 */}
        </p>

        <div className="mt-6 rounded-xl border border-hairline p-4">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted">
            后端原始事件{/* i18n-ignore：仅开发验收页 */}
          </div>
          <pre className="max-h-40 overflow-auto rounded-lg bg-sunk p-3 font-mono text-[11px] leading-relaxed text-secondary">
            {events.map((e) => e.type).join('\n')}
          </pre>
        </div>

        <div className="mt-6 rounded-xl border border-hairline p-4">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted">
            ToolChips（吃 tool_started / tool_completed）{/* i18n-ignore：仅开发验收页 */}
          </div>
          {ready && (
            <ToolChips
              rows={toToolChipRows(calls, t)}
              title={t('aiLab.tools.count', { count: calls.length })}
            />
          )}
        </div>

        <div className="mt-6 rounded-xl border border-hairline p-4">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted">
            ChatThread 全链路（TasksCard 芯片 / CodeBlock / 复制行）{/* i18n-ignore：仅开发验收页 */}
          </div>
          {ready && (
            <ChatThread
              messages={messages}
              onToggleCanvas={() => undefined}
              openCanvasSkillId={null}
              activity="writing"
              onRegenerate={() => undefined}
            />
          )}
        </div>

        <div className="mt-6 rounded-xl border border-hairline p-4">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted">
            流式逐词显影（真的走 ChatThread，不是 demo 组件）{/* i18n-ignore：仅开发验收页 */}
          </div>
          {ready && <StreamingProbe text={messages[3].content ?? ''} />}
        </div>

        <div className="mt-6 rounded-xl border border-hairline p-4">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted">
            HITL：一次中断两个闸门 → 一张分页卡{/* i18n-ignore：仅开发验收页 */}
          </div>
          <p className="mb-3 text-[12px] text-muted">
            判据是「两页都答完才发续跑」。答一页看控制台，不该有请求。
            {/* i18n-ignore：仅开发验收页 */}
          </p>
          {ready && <InterruptProbe />}
        </div>

        <div className="mt-6 rounded-xl border border-hairline p-4">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted">
            ask_choice 表了态 → 推荐卡（没表态仍是一排 chips）{/* i18n-ignore：仅开发验收页 */}
          </div>
          {ready && <ChoiceRoutingProbe />}
        </div>
      </div>
    </div>
  );
}
