import type { LucideIcon } from 'lucide-react';
import type { WidgetInstance } from '@magic-resume/genui/contract';
import type { AgentActivity } from './conversation/agentActivity';

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

export type ChatRole = 'user' | 'assistant' | 'exec' | 'log' | 'approval' | 'activity' | 'plan' | 'widget' | 'tools';

/**
 * 一条 todo 的可渲染片段。
 *
 * 后端从 `[[kind:label]]` 标记里解析出来（`todo-segments.ts`）——`write_todos` 是
 * deepagents 的内置工具、schema 换不掉，标记是模型唯一能往外带结构的通道。
 * 没有标记就是单独一段 text，这是默认路径而非异常路径。
 */
export type TodoSegment =
  | { type: 'text'; text: string }
  | {
      type: 'chip';
      /** 芯片里加重的那个动词。 */
      verb: string;
      /** 动词之后的部分，可为空。 */
      rest: string;
      kind: 'read' | 'write' | 'analyze' | 'search' | 'ask' | 'tool';
    };

/** A single checklist item in a `plan` message — the live analyze todolist. */
export interface PlanTodo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  /** 芯片与纯文本混排。缺席时按 `content` 渲染成一段纯文本。 */
  segments?: TodoSegment[];
  /**
   * 这一步在干哪一类活儿，决定左侧 orb 的形态。
   *
   * **由 agent 自己声明**（后端从标记的 kind 派生），不是我们猜的——`agentActivity.ts`
   * 里那条「不演一个并没有发生的状态」因此仍然成立：现在有真实来源了。
   */
  activity?: AgentActivity;
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
  /**
   * 这一页对应中断里的第几个动作。
   *
   * 一次中断可以带多个动作，续跑要求**每个动作一个裁决**（引擎会拒绝数量不匹配的
   * 续跑）。此前每个动作各发一张卡、各带一个 `interruptSlot`；现在闸门类的动作收成
   * 一张分页卡，下标就得跟着页走。
   */
  slotIndex: number;
  /** 这一页问什么（模型给的 reason，缺省由渲染层兜底）。 */
  question?: string;
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
  /**
   * present when role === 'log' — 这条日志在说什么性质的事。
   *
   * 'ok'（缺省，绿）做成了；'info'（蓝）中性事实，既不是成功也不是失败；
   * 'warn'（琥珀）真的没做成。
   *
   * 三档而不是两档，是因为「这几处不在画布上就地显示」既不是成功也不是失败——
   * 混进琥珀会被读成报错，而那正是它第一版引起的误解。颜色要能替代阅读。
   */
  tone?: 'ok' | 'info' | 'warn';
  /** live-streamed assistant text — render raw (no typewriter re-animation) */
  streamed?: boolean;
  /** 这一轮的思考过程（若模型回传）。与 content 分开存：它是过程，不是产物。 */
  reasoning?: string;
  /**
   * present when role === 'approval' —— 这一次中断里所有走闸门的动作，一页一个。
   *
   * 是数组而不是单个：一次中断本来就可能挂着几个待拍板的动作，此前它们被摊成几张
   * 竖着排的卡，用户看不出「这一轮要我拍几个板、拍到第几个了」。
   */
  approvals?: ApprovalRequest[];
  /** present when role === 'plan' — the live review checklist (analyze / subagent todolist) */
  todos?: PlanTodo[];
  /** present when role === 'plan' and the todolist belongs to a subagent (the `task` tool) */
  subagentName?: string;
  /** present when role === 'plan' — 本轮开始的时刻，卡片据此走秒。 */
  startedAt?: number;
  /**
   * present when role === 'tools' —— 这一轮调用过的工具。
   *
   * 此前除 `read_resume` 外的工具调用**在界面上完全不可见**：只改了那颗 orb 的形态，
   * 跑完就没了。这条消息把一轮里动过的工具收成一组，用户至少能回头看「它到底做了什么」。
   */
  toolCalls?: { toolCallId: string; toolName: string; subject?: string; done?: boolean }[];
  /** present when role === 'widget' — a GenUI interactive card (form / decision) */
  widget?: WidgetInstance;
  /**
   * present when this card came from a paused run. One interrupt can carry
   * several actions and the backend rejects a resume whose decision count does
   * not match, so each card remembers which slot it answers.
   */
  interruptSlot?: { requestId: string; index: number };
  /** 这条用户消息是一个附件（`content` 就是文件名）。渲染层据此画回形针图标。 */
  attachment?: boolean;
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
