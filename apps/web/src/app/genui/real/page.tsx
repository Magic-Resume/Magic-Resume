'use client';

import { useEffect, useState } from 'react';
import { ToolChips } from '@magic-resume/genui/beautiful';
import { useTranslation } from 'react-i18next';
import ChatThread from '@/app/dashboard/edit/_components/ai/conversation/ChatThread';
import { toToolChipRows, subjectOf } from '@/app/dashboard/edit/_components/ai/conversation/toolTrace';
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
            />
          )}
        </div>
      </div>
    </div>
  );
}
