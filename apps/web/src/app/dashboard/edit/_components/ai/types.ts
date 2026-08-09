import type { LucideIcon } from 'lucide-react';
import type { WidgetInstance } from '@magic-resume/genui/contract';

export type SkillId = 'create' | 'optimize' | 'analyze' | 'fit' | 'translate' | 'interview';

export type CanvasView = 'preview' | 'json' | 'score' | 'match';

/** 技能的作用范围。`whole-resume` 是整篇模式，`element`/`selection` 是 living canvas 驱动的就地调用。 */
export type SkillScope = 'whole-resume' | 'element' | 'selection';

/** 每项 AI 能力的唯一真源：对话外壳、技能 chip、斜杠菜单都读它。加能力 = 加一条。 */
export interface AiSkill {
  id: SkillId;
  name: string;
  tagline: string;
  icon: LucideIcon;
  /** tailwind text-color class for the icon, e.g. 'text-sky-400' */
  accent: string;
  /** raw hex for inline dots / non-class usage */
  accentHex: string;
  /** inline = renders in the thread; immersive = takes over with an overlay */
  surface: 'inline' | 'immersive';
  /** create is a pure conversation, no artifact */
  isChat?: boolean;
  /** which canvas views this skill produces; omitted = no canvas artifact */
  canvas?: { views: CanvasView[]; defaultView: CanvasView };
  /** scopes this skill can target; defaults to whole-resume when omitted */
  scope?: SkillScope[];
  /** compact one-liner shown as the user's request bubble */
  buildIntent: (params: Record<string, string>) => string;
  /** summary shown on the completed execution card */
  doneSummary: string;
}

export type ChatRole = 'user' | 'assistant' | 'exec' | 'log' | 'approval' | 'activity' | 'plan' | 'widget';

/** A single checklist item in a `plan` message — the live analyze todolist. */
export interface PlanTodo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/**
 * A human-in-the-loop tool-approval prompt the agent paused on. With native HITL
 * the run resumes by `sessionId` + a `Command`, so no runId is needed here — the
 * decision (approve/reject) is all the backend wants.
 */
export interface ApprovalRequest {
  /** Interrupt id (display/key only; resume is keyed by sessionId server-side). */
  requestId: string;
  /** Tool the agent paused before, e.g. 'read_resume'. */
  toolName?: string;
  /** resource class being requested, e.g. 'resume' (drives the read narration). */
  scope: string;
  /** `expired`: restored from an old transcript — the paused run is long gone. */
  status: 'pending' | 'approved' | 'denied' | 'expired';
  /**
   * For a read_resume approval: how far the read has progressed once approved.
   * Lets the card show 已允许读取 → 正在读取简历… → 已读取简历 in one place instead of
   * spawning a separate activity line.
   */
  readState?: 'reading' | 'read';
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content?: string;
  /** present when role === 'exec' */
  skillId?: SkillId;
  status?: 'running' | 'done';
  /** present when role === 'log' — anchors the entry back to a canvas change */
  resumePath?: string;
  /** live-streamed assistant text — render raw (no typewriter re-animation) */
  streamed?: boolean;
  /** present when role === 'approval' — the pending tool-approval prompt */
  approval?: ApprovalRequest;
  /** present when role === 'plan' — the live review checklist (analyze / subagent todolist) */
  todos?: PlanTodo[];
  /** present when role === 'plan' and the todolist belongs to a subagent (the `task` tool) */
  subagentName?: string;
  /** present when role === 'widget' — a GenUI interactive card (form / decision) */
  widget?: WidgetInstance;
  /**
   * present when this card came from a paused run. One interrupt can carry
   * several actions and the backend rejects a resume whose decision count does
   * not match, so each card remembers which slot it answers.
   */
  interruptSlot?: { requestId: string; index: number };
  /** present when a user message quotes a canvas snippet (「询问 Polaris」bridge) */
  quote?: { label: string; text: string };
}

export type CanvasStatus = 'idle' | 'streaming' | 'ready' | 'applied';

export interface CanvasState {
  open: boolean;
  skillId: SkillId | null;
  view: CanvasView;
  status: CanvasStatus;
}
