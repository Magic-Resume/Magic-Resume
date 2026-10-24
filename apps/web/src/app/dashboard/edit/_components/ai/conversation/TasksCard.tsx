'use client';

import React from 'react';
import { Check } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import {
  AgentProgress,
  type AgentProgressStep,
} from '@magic-resume/genui';
import type { ChatMessage, PlanTodo, SkillId, TodoSegment } from '../types';
import type { AgentActivity } from './agentActivity';

/** 跑完之后停留多久再退场——让用户看见它确实完成了。 */
export const PLAN_DWELL_MS = 700;

export function isPlanFulfilled(message: ChatMessage): boolean {
  const todos = message.todos ?? [];
  return todos.length > 0 && todos.every((t) => t.status === 'completed');
}

/** 主任务清单完成后退场；是否能点进画布由明确的 skillId 单独决定。 */
export function isRetirablePlan(message: ChatMessage): boolean {
  return (
    message.role === 'plan' && !message.subagentName && isPlanFulfilled(message)
  );
}

/**
 * 生产任务卡只负责把真实 todo 事件接到 AgentProgress。
 * AgentProgress 保留原有视觉和折叠交互，步骤状态由 `plan_update.todos` 控制，
 * 不再维护另一套任务行渲染。
 */
export default function TasksCard({
  message,
  retired,
  onToggleCanvas,
  isCanvasOpen,
}: {
  message: ChatMessage;
  retired?: boolean;
  onToggleCanvas: (id: SkillId) => void;
  isCanvasOpen: boolean;
  /** 保留调用契约；AgentProgress 直接使用 todo 状态环。 */
  activity?: AgentActivity | null;
}) {
  const { t } = useTranslation();
  const todos = message.todos ?? [];
  const finished = message.status === 'done' || isPlanFulfilled(message);
  const title = message.subagentName
    ? `${t('aiLab.chat.subagent')}${namedSubagent(message.subagentName) ? ` · ${namedSubagent(message.subagentName)}` : ''}`
    : message.content || t('aiLab.chat.tasks');

  if (retired) {
    const summary = (
      <>
        <Check size={11} className="text-mr-muted shrink-0" />
        <span className="truncate">
          {message.content || t('aiLab.chat.taskList')}
        </span>
      </>
    );
    const canvasSkillId = message.skillId;

    if (!canvasSkillId) {
      return (
        <div className="text-mr-muted flex items-center gap-2 text-[11px]">
          {summary}
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onToggleCanvas(canvasSkillId)}
        className="text-mr-muted hover:text-mr-ink-secondary group flex cursor-pointer items-center gap-2 text-[11px] transition-colors active:translate-y-px"
      >
        {summary}
        <span className="text-mr-ink-secondary group-hover:text-mr-ink shrink-0 transition-colors">
          {isCanvasOpen ? t('aiLab.chat.collapse') : t('aiLab.chat.view')}
        </span>
      </button>
    );
  }

  if (message.subagentName && finished) {
    const name = namedSubagent(message.subagentName);
    return (
      <div className="text-mr-muted flex items-center gap-2 text-[11px]">
        <Check size={11} className="text-mr-muted shrink-0" />
        <span className="truncate">
          {t('aiLab.chat.subagent')}
          {name ? ` · ${name}` : ''}
        </span>
      </div>
    );
  }

  const steps: AgentProgressStep[] = todos.length
    ? todos.map((todo, index) => ({
        key: `${todo.content}-${index}`,
        label: todo.content,
        status: todo.status,
        progress: todo.status === 'in_progress' ? 0.5 : undefined,
      }))
    : [
        {
          key: 'pending-plan',
          label: title,
          status: finished ? 'completed' : 'in_progress',
          progress: finished ? 1 : 0.35,
        },
      ];

  return <AgentProgress steps={steps} />;
}

/** `子代理` / `general-purpose` 是占位名，不值得占标题里的位置。 */
function namedSubagent(name: string): string {
  return name === '子代理' || name === 'general-purpose' ? '' : name;
}

/** 后端没发 segments 时的纯文本降级仍是共享契约，保留给历史消息与测试。 */
export function segmentsOf(todo: PlanTodo): TodoSegment[] {
  return todo.segments?.length
    ? todo.segments
    : [{ type: 'text', text: todo.content }];
}

export interface ElapsedUnitLabels {
  hour: string;
  minute: string;
  second: string;
  separator: string;
}

/** 把累计秒数进位为可读时长；保留导出以兼容旧消息测试与调用方。 */
export function formatElapsedDuration(
  totalSeconds: number,
  units: ElapsedUnitLabels,
): string {
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
    return [`${minutes}${units.minute}`, `${seconds}${units.second}`].join(
      units.separator,
    );
  }
  return `${seconds}${units.second}`;
}
