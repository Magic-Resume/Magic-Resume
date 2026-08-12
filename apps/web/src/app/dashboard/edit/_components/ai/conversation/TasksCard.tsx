'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ChatMessage, PlanTodo, SkillId, TodoSegment } from '../types';
import { Icon } from '@magic-resume/genui/beautiful';
import ActivityOrb from './ActivityOrb';
import type { AgentActivity } from './agentActivity';
import { useSpringHeight } from './useSpringHeight';

/**
 * 任务清单卡。
 *
 * 取代此前那条「时间线导轨 + 骑在上面的 orb」：那一版把步骤裸露成一列，读得出进度，
 * 但一次运行在对话里没有边界——三张清单连着出现时分不清哪几步属于哪一次。现在它是
 * 一张**有容器的卡**，跑完能收起，于是「这一轮做了什么」成了一个可以整体折叠的东西。
 *
 * 每一行左侧的形态由 agent 自己声明（`todo.activity`，后端从 `[[kind:label]]` 标记
 * 派生），不是我们猜的——这正是 `agentActivity.ts` 里那条「不演一个并没有发生的状态」
 * 得以放宽的原因：现在有真实来源了。
 */

/** 跑完之后停留多久再退场——让用户看见它确实完成了。 */
export const PLAN_DWELL_MS = 700;

export function isPlanFulfilled(message: ChatMessage): boolean {
  const todos = message.todos ?? [];
  return todos.length > 0 && todos.every((t) => t.status === 'completed');
}

/** 技能清单（有 skillId、结果落在右侧画布）才退场；子代理清单没有产物，不能退场。 */
export function isRetirablePlan(message: ChatMessage): boolean {
  return message.role === 'plan' && !message.subagentName && isPlanFulfilled(message);
}

export default function TasksCard({
  message,
  retired,
  onToggleCanvas,
  isCanvasOpen,
  activity,
}: {
  message: ChatMessage;
  /** 已过完停留期：技能清单收成一行可点的指针，不再是卡。 */
  retired?: boolean;
  onToggleCanvas: (id: SkillId) => void;
  isCanvasOpen: boolean;
  /** agent 此刻在做哪一类活儿。只在 todo 自己没声明时兜底。 */
  activity?: AgentActivity | null;
}) {
  const { t } = useTranslation();
  const todos = message.todos ?? [];
  const total = todos.length;
  const done = todos.filter((x) => x.status === 'completed').length;
  const fulfilled = isPlanFulfilled(message);
  const finished = message.status === 'done' || fulfilled;

  const [collapsed, setCollapsed] = useState(false);
  const { clipRef, contentRef, settle } = useSpringHeight<HTMLUListElement>(collapsed);

  // 行数、状态、语言任何一样变了都要重新量——不重新量就会裁掉最后一行。
  useEffect(() => {
    settle();
  }, [settle, total, done, finished]);

  const elapsed = useElapsedSeconds(message.startedAt, finished);

  // 技能清单跑完并过了停留期 → 收成一行可点的指针。
  //
  // 它必须留下点什么：右侧那份报告没有别的入口了——实时画布会把它顶掉。时间线上留一条
  // 指针既不是卡也不是新控件，位置还正好在这次运行发生的地方。
  if (retired) {
    return (
      <button
        type="button"
        onClick={() => onToggleCanvas(message.skillId ?? 'analyze')}
        className="group flex cursor-pointer items-center gap-2 text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
      >
        <Check size={11} className="shrink-0 text-neutral-600" />
        <span className="truncate">{message.content || t('aiLab.chat.taskList')}</span>
        <span className="shrink-0 text-sky-400/70 transition-colors group-hover:text-sky-300">
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
      <div className="flex items-center gap-2 text-[11px] text-neutral-500">
        <Check size={11} className="shrink-0 text-neutral-600" />
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
    <div className="w-full max-w-lg">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl bg-[#16171b] px-4 py-3',
          'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300'
        )}
      >
        {/* 极光：两团径向渐变缓慢漂移，跑完整体提亮。它是这张卡唯一的「还活着」信号——
            比进度条诚实：它不假装知道还剩多少。 */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 transition-opacity duration-700 motion-safe:animate-[aurora_14s_ease-in-out_infinite_alternate]',
            finished ? 'opacity-100' : 'opacity-60'
          )}
          style={{
            background: finished
              ? 'radial-gradient(120% 180% at 86% 44%, rgba(56,189,248,.34) 0%, transparent 62%), radial-gradient(90% 140% at 60% 86%, rgba(14,116,165,.26) 0%, transparent 58%)'
              : 'radial-gradient(120% 180% at 88% 42%, rgba(56,189,248,.20) 0%, transparent 62%), radial-gradient(90% 140% at 62% 88%, rgba(14,116,165,.18) 0%, transparent 58%)',
          }}
        />

        <div className="relative">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            className="flex w-full cursor-pointer items-center gap-2.5 text-left"
          >
            <ChevronDown
              size={14}
              className={cn(
                'shrink-0 text-neutral-300 transition-transform duration-300',
                collapsed && '-rotate-90'
              )}
            />
            <span className="min-w-0 truncate text-[13px] font-medium text-neutral-200">
              {title}
            </span>
            <span className="flex-1" />
            {elapsed !== null && (
              <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] tabular-nums text-neutral-300">
                {t('aiLab.chat.elapsed', { seconds: elapsed })}
              </span>
            )}
            {finished ? (
              <span className="shrink-0 rounded-full bg-sky-950/80 px-3 py-0.5 text-[11.5px] font-medium text-sky-300">
                {t('aiLab.chat.completed')}
              </span>
            ) : (
              <span className="shrink-0 text-[12px] tabular-nums text-neutral-400">
                {done}/{Math.max(total, 1)}
              </span>
            )}
          </button>

          {/* 高度由 useSpringHeight 逐帧写入——**这里刻意没有 CSS transition**。
              行是成串到达的，transition 每次从零速度重启，看起来一顿一顿。 */}
          <div ref={clipRef} className="overflow-hidden" style={{ willChange: 'height' }}>
            {/* 只能用 padding 不能用 margin：测量不含 margin，留 margin 就会被裁掉。 */}
            <ul ref={contentRef} className="flex list-none flex-col gap-2 pb-0.5 pt-2">
              {todos.map((todo, i) => (
                <TaskRow
                  key={`${todo.content}-${i}`}
                  todo={todo}
                  fallbackActivity={activity}
                />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  todo,
  fallbackActivity,
}: {
  todo: PlanTodo;
  fallbackActivity?: AgentActivity | null;
}) {
  const isDone = todo.status === 'completed';
  // agent 声明的优先；它没说才用「这一轮整体在干什么」兜底。
  const rowActivity = todo.activity ?? fallbackActivity ?? 'working';
  const segments = segmentsOf(todo);

  return (
    <li className={cn('flex items-start gap-2.5 transition-opacity duration-500', isDone && 'opacity-45')}>
      <span className="grid h-5 w-5 shrink-0 place-items-center">
        {isDone ? (
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-sky-500 motion-safe:animate-in motion-safe:zoom-in-75 motion-safe:duration-300">
            <Check size={11} className="text-[#fff]" strokeWidth={3} />
          </span>
        ) : (
          <ActivityOrb activity={rowActivity} />
        )}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 pt-px text-[13px] text-neutral-200">
        {segments.map((seg, i) =>
          seg.type === 'chip' ? (
            <span
              key={i}
              className={cn(
                'inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-2.5 transition-colors duration-500',
                isDone
                  ? 'border-transparent bg-white/[0.07]'
                  : 'border-sky-400/40 bg-sky-400/10'
              )}
            >
              {/* 芯片图标由后端给的 `kind` 决定（read/write/analyze/search/ask/tool）。
                  一律手写 SVG：emoji 的字形随系统字体变，在 12.5px 的芯片里会比正文
                  大一圈还对不齐，颜色也不受主题控制。 */}
              <Icon
                name={seg.kind}
                size={12}
                className={cn('shrink-0', isDone ? 'text-neutral-500' : 'text-sky-300')}
              />
              <span
                className={cn(
                  'truncate text-[12.5px]',
                  isDone ? 'text-neutral-400 line-through' : 'text-sky-100'
                )}
              >
                {/* **不能用 text-white**：这个仓把 Tailwind 的 white 整体翻成了暖墨
                    （globals.css `--color-white: oklch(0.270 0.010 85)`，为浅色主题服务），
                    且 `.dark` 里没有覆盖——深色子树里用它也是暗的，动词会直接看不见。
                    用语义令牌，它跟着子树的主题走。 */}
                <span className={cn(!isDone && 'text-ink')}>{seg.verb}</span>
                {seg.rest ? ` ${seg.rest}` : ''}
              </span>
            </span>
          ) : (
            <span key={i} className={cn('text-neutral-400', isDone && 'line-through')}>
              {seg.text}
            </span>
          )
        )}
      </span>
    </li>
  );
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
