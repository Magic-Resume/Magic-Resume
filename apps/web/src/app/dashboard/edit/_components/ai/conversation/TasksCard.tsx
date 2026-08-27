'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Check,
  ChevronDown,
  Eye,
  MessageCircleQuestion,
  PenLine,
  Search,
  Wrench,
} from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ChatMessage, PlanTodo, SkillId, TodoSegment } from '../types';
import type { AgentActivity } from './agentActivity';

/**
 * 任务清单卡。
 *
 * 取代此前那条「时间线导轨 + 骑在上面的 orb」：那一版把步骤裸露成一列，读得出进度，
 * 但一次运行在对话里没有边界——三张清单连着出现时分不清哪几步属于哪一次。现在它是
 * 一张**有容器的卡**，跑完能收起，于是「这一轮做了什么」成了一个可以整体折叠的东西。
 *
 * 视觉完全采用用户给的 TaskRows 参考：surface 胶囊、序号环、green 完成态与可展开
 * 明细。业务层仍消费真实 todo 状态，不运行参考代码里那套演示用定时脚本。
 */

/** 跑完之后停留多久再退场——让用户看见它确实完成了。 */
export const PLAN_DWELL_MS = 700;

export function isPlanFulfilled(message: ChatMessage): boolean {
  const todos = message.todos ?? [];
  return todos.length > 0 && todos.every((t) => t.status === 'completed');
}

/** 主任务清单完成后退场；是否能点进画布由明确的 skillId 单独决定。 */
export function isRetirablePlan(message: ChatMessage): boolean {
  return message.role === 'plan' && !message.subagentName && isPlanFulfilled(message);
}

export default function TasksCard({
  message,
  retired,
  onToggleCanvas,
  isCanvasOpen,
}: {
  message: ChatMessage;
  /** 已过完停留期：主任务清单收成一行摘要，不再是卡。 */
  retired?: boolean;
  onToggleCanvas: (id: SkillId) => void;
  isCanvasOpen: boolean;
  /** 保留调用契约；新样式严格按任务状态显示序号环，不再混入旧 activity orb。 */
  activity?: AgentActivity | null;
}) {
  const { t } = useTranslation();
  const todos = message.todos ?? [];
  const total = todos.length;
  const done = todos.filter((x) => x.status === 'completed').length;
  const fulfilled = isPlanFulfilled(message);
  const finished = message.status === 'done' || fulfilled;

  const [collapsed, setCollapsed] = useState(false);

  const elapsed = useElapsedSeconds(message.startedAt, finished);
  const elapsedLabel = elapsed === null
    ? null
    : formatElapsedDuration(elapsed, {
        hour: t('aiLab.chat.elapsedUnits.hour'),
        minute: t('aiLab.chat.elapsedUnits.minute'),
        second: t('aiLab.chat.elapsedUnits.second'),
        separator: t('aiLab.chat.elapsedUnits.separator'),
      });

  // 主任务清单跑完并过了停留期 → 收成一行摘要。有明确 skillId 才说明右侧确实存在
  // 一份可回看的画布产物，此时摘要才是按钮；普通聊天、搜索和投递追踪只显示完成记录。
  if (retired) {
    const summary = (
      <>
        <Check size={11} className="shrink-0 text-ink-3" />
        <span className="truncate">{message.content || t('aiLab.chat.taskList')}</span>
      </>
    );
    const canvasSkillId = message.skillId;

    if (!canvasSkillId) {
      return (
        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          {summary}
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onToggleCanvas(canvasSkillId)}
        className="group flex cursor-pointer items-center gap-2 text-[11px] text-ink-3 transition-colors hover:text-ink-2 active:translate-y-px"
      >
        {summary}
        <span className="shrink-0 text-ink-2 transition-colors group-hover:text-ink">
          {isCanvasOpen ? t('aiLab.chat.collapse') : t('aiLab.chat.view')}
        </span>
      </button>
    );
  }

  // 子代理跑完 → 降成一行日志。它没有右侧产物，整张卡留着只是噪音；但完全抹掉又会让
  // 「起过一个子代理」这件事无迹可寻，所以留一行。
  if (message.subagentName && finished) {
    const name = namedSubagent(message.subagentName);
    return (
      <div className="flex items-center gap-2 text-[11px] text-ink-3">
        <Check size={11} className="shrink-0 text-ink-3" />
        <span className="truncate">
          {t('aiLab.chat.subagent')}
          {name ? ` · ${name}` : ''}
        </span>
      </div>
    );
  }

  const title = message.subagentName
    ? `${t('aiLab.chat.subagent')}${namedSubagent(message.subagentName) ? ` · ${namedSubagent(message.subagentName)}` : ''}`
    : message.content || t('aiLab.chat.tasks');

  return (
    <div className="flex w-full max-w-110 flex-col gap-2">
      <div
        className="overflow-hidden bg-surface shadow-card motion-safe:animate-[fade-up_450ms_cubic-bezier(0.23,1,0.32,1)_both]"
        style={{ borderRadius: collapsed ? 22 : 14 }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="flex h-11 w-full cursor-pointer items-center gap-2.5 px-2.5 text-left outline-none transition-colors duration-200 hover:bg-inset active:translate-y-px focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-line-strong"
        >
          <ChevronDown
            size={14}
            className={cn(
              'shrink-0 text-ink-3 transition-transform duration-300',
              collapsed && '-rotate-90'
            )}
          />
          <span className="min-w-0 truncate text-[12px] font-medium leading-none text-ink">
            {title}
          </span>
          <span className="flex-1" />
          {elapsed !== null && (
            <span className="inline-flex h-5.5 shrink-0 items-center rounded-full bg-hover px-2 text-[11px] tabular-nums text-ink-2">
              {elapsedLabel}
            </span>
          )}
          {finished ? (
            <span className="inline-flex h-5.5 shrink-0 items-center rounded-full bg-green-tint px-2 text-[11px] font-medium text-green">
              {t('aiLab.chat.completed')}
            </span>
          ) : (
            <span className="shrink-0 text-[11px] tabular-nums text-ink-3">
              {done}/{Math.max(total, 1)}
            </span>
          )}
        </button>
      </div>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: collapsed ? '0fr' : '1fr',
          opacity: collapsed ? 0 : 1,
          transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <div className="overflow-hidden">
          <TaskChecklist todos={todos} />
        </div>
      </div>
    </div>
  );
}

function SpinnerRing({
  active,
  children,
}: {
  active?: boolean;
  children?: React.ReactNode;
}) {
  const size = 24;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        style={active ? { animation: 'spin 1.1s linear infinite' } : undefined}
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        {active ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.28} ${circumference * 0.72}`}
          />
        ) : null}
      </svg>
      <span className="relative text-[10.5px] font-semibold tabular-nums text-ink">
        {children}
      </span>
    </span>
  );
}

/**
 * 任务行直接归 TasksCard 所有，不再套 Beautiful UI 的通用 TaskRows。这样卡片的颜色、
 * 圆角、行高与展开层只受这一份代码控制，流式状态变化也不会穿过两套样式令牌。
 */
function TaskChecklist({ todos }: { todos: PlanTodo[] }) {
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-2">
      {todos.map((todo, index) => {
        const key = `${todo.content}-${index}`;
        const isDone = todo.status === 'completed';
        const [primary, ...secondary] = segmentsOf(todo);
        const expandable = secondary.length > 0;
        const open = expandable && (openRows[key] ?? false);

        return (
          <div
            key={key}
            className="self-stretch overflow-hidden bg-surface shadow-card transition-[border-radius,background-color] duration-300 hover:bg-inset"
            style={{
              borderRadius: open ? 14 : 22,
              animation: `fade-up 420ms cubic-bezier(0.23,1,0.32,1) ${index * 80}ms both`,
            }}
          >
            <button
              type="button"
              aria-expanded={expandable ? open : undefined}
              disabled={!expandable}
              onClick={
                expandable
                  ? () =>
                      setOpenRows((current) => ({
                        ...current,
                        [key]: !open,
                      }))
                  : undefined
              }
              className={cn(
                'flex h-11 w-full items-center gap-2.5 px-2.5 text-left outline-none',
                expandable
                  ? 'cursor-pointer active:translate-y-px focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-line-strong'
                  : 'cursor-default',
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                {isDone ? (
                  <span className="grid size-5.5 place-items-center rounded-full bg-green text-[#fff] motion-safe:animate-[pop-in_300ms_cubic-bezier(0.23,1,0.32,1)_both]">
                    <Check size={11} className="text-[#fff]" strokeWidth={3} />
                  </span>
                ) : (
                  <SpinnerRing active={todo.status === 'in_progress'}>
                    {index + 1}
                  </SpinnerRing>
                )}
              </span>

              <span
                title={todo.content}
                className={cn(
                  'min-w-0 flex-1 truncate text-[12px] font-medium leading-none text-ink',
                  isDone && 'opacity-45',
                )}
              >
                {primary ? (
                  <TaskSegmentView segment={primary} isDone={isDone} />
                ) : (
                  <span className={cn('truncate text-ink', isDone && 'line-through')}>
                    {todo.content}
                  </span>
                )}
              </span>

              {expandable ? (
                <span className="-ml-2 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3">
                  <ChevronDown
                    size={15}
                    className={cn(
                      'transition-transform duration-300',
                      open && 'rotate-180',
                    )}
                  />
                </span>
              ) : null}
            </button>

            <div
              className="grid transition-[grid-template-rows,opacity] duration-300"
              style={{
                gridTemplateRows: open ? '1fr' : '0fr',
                opacity: open ? 1 : 0,
                transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
              }}
            >
              <div className="overflow-hidden">
                <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
                  <span aria-hidden className="mx-auto h-full w-px bg-line" />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    {secondary.map((segment, detailIndex) => (
                      <div
                        key={`${segment.type}:${detailIndex}`}
                        className="min-w-0"
                        style={
                          open
                            ? {
                                animation: `fade-up 280ms cubic-bezier(0.23,1,0.32,1) ${100 + detailIndex * 80}ms both`,
                              }
                            : undefined
                        }
                      >
                        <TaskSegmentView segment={segment} isDone={isDone} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskSegmentView({
  segment,
  isDone,
}: {
  segment: TodoSegment;
  isDone: boolean;
}) {
  if (segment.type === 'text') {
    return (
      <span className={cn('text-[12px] leading-4 text-ink-2', isDone && 'line-through')}>
        {segment.text}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-2.5 transition-colors duration-500',
        isDone
          ? 'border-transparent bg-hover'
          : 'border-line-strong bg-inset'
      )}
    >
      <TaskChipIcon
        kind={segment.kind}
        className={isDone ? 'text-ink-3' : 'text-ink-2'}
      />
      <span
        className={cn(
          'truncate text-[11px] leading-4',
          isDone ? 'text-ink-3 line-through' : 'text-ink-2'
        )}
      >
        <span className={cn(!isDone && 'text-ink')}>{segment.verb}</span>
        {segment.rest ? ` ${segment.rest}` : ''}
      </span>
    </span>
  );
}

function TaskChipIcon({
  kind,
  className,
}: {
  kind: Extract<TodoSegment, { type: 'chip' }>['kind'];
  className?: string;
}) {
  const props = { size: 12, strokeWidth: 2, className: cn('shrink-0', className) };
  switch (kind) {
    case 'read':
      return <Eye {...props} />;
    case 'write':
      return <PenLine {...props} />;
    case 'analyze':
      return <BarChart3 {...props} />;
    case 'search':
      return <Search {...props} />;
    case 'ask':
      return <MessageCircleQuestion {...props} />;
    case 'tool':
      return <Wrench {...props} />;
  }
}

/**
 * 这一行要渲染哪些片段。
 *
 * 后端没发 `segments` 就退回整条 `content` 当一段纯文本——**这是默认路径**：模型不写
 * 标记不算错，老后端也还没发这个字段。抽成纯函数是因为这是唯一一处会静默退化的地方，
 * 内联在 JSX 里没有断言钉得住它。
 */
export function segmentsOf(todo: PlanTodo): TodoSegment[] {
  return todo.segments?.length
    ? todo.segments
    : [{ type: 'text', text: todo.content }];
}

/** `子代理` / `general-purpose` 是占位名，不值得占标题里的位置。 */
function namedSubagent(name: string): string {
  return name === '子代理' || name === 'general-purpose' ? '' : name;
}

export interface ElapsedUnitLabels {
  hour: string;
  minute: string;
  second: string;
  separator: string;
}

/** 把累计秒数进位为可读时长；长任务不能把 56950 秒原样甩给用户。 */
export function formatElapsedDuration(totalSeconds: number, units: ElapsedUnitLabels): string {
  const safeSeconds = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return [
      `${hours}${units.hour}`,
      `${minutes}${units.minute}`,
      `${seconds}${units.second}`,
    ].join(units.separator);
  }
  if (minutes > 0) {
    return [`${minutes}${units.minute}`, `${seconds}${units.second}`].join(units.separator);
  }
  return `${seconds}${units.second}`;
}

/**
 * 这一轮跑了多少秒。
 *
 * 刻意**不显示 token 数**：`llm_usage` 事件其实一直在流，但原始 token 对求职者没有
 * 意义，还会把「用一次要花多少」变成每轮都在盯的数字。耗时是他真正在等的东西。
 */
function useElapsedSeconds(startedAt: number | undefined, finished: boolean): number | null {
  const [seconds, setSeconds] = useState<number | null>(
    startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null
  );
  const frozen = useRef<number | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    if (finished) {
      // 跑完就定格。继续走秒会让一张已经结束的卡看起来还在工作。
      if (frozen.current === null) frozen.current = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(frozen.current);
      return;
    }
    setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt, finished]);

  return startedAt ? seconds : null;
}
