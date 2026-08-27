import type { LucideIcon } from '@magic-resume/icons';
import type { WidgetInstance } from "@magic-resume/genui/contract";
import type { AgentActivity } from "./conversation/agentActivity";

export type SkillId =
  | "create"
  | "optimize"
  | "analyze"
  | "fit"
  | "translate"
  | "interview";

export type CanvasView = "preview" | "json" | "score" | "match";

/** 技能的作用范围。`whole-resume` 是整篇模式，`element`/`selection` 是 living canvas 驱动的就地调用。 */
export type SkillScope = "whole-resume" | "element" | "selection";

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
  surface: "inline" | "immersive";
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

export type ChatRole =
  | "user"
  | "assistant"
  | "exec"
  | "log"
  | "approval"
  | "activity"
  | "plan"
  | "widget"
  | "tools";

/**
 * 一条 todo 的可渲染片段。
 *
 * 后端从 `[[kind:label]]` 标记里解析出来（`todo-segments.ts`）——`write_todos` 是
 * deepagents 的内置工具、schema 换不掉，标记是模型唯一能往外带结构的通道。
 * 没有标记就是单独一段 text，这是默认路径而非异常路径。
 */
export type TodoSegment =
  | { type: "text"; text: string }
  | {
      type: "chip";
      /** 芯片里加重的那个动词。 */
      verb: string;
      /** 动词之后的部分，可为空。 */
      rest: string;
      kind: "read" | "write" | "analyze" | "search" | "ask" | "tool";
    };

/** A single checklist item in a `plan` message — the live analyze todolist. */
export interface PlanTodo {
  content: string;
  status: "pending" | "in_progress" | "completed";
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

/** 一次工具调用在界面上需要知道的全部。 */
export interface ToolCall {
  toolCallId: string;
  toolName: string;
  subject?: string;
  done?: boolean;
  /** 轨迹里的归属和墙钟时间。旧消息没有这些字段时仍按普通工具行渲染。 */
  stepId?: string;
  startedAt?: number;
  completedAt?: number;
  /** 工具失败要和成功结果走同一条 callId 配对链，不能只让转圈停掉。 */
  error?: string;
  /**
   * 后端给的**展示结构**，不是文案——措辞在前端定，中英文各说各的。
   *
   * `kind` 选图标、`verb` 选词。两者都认不出时前端说一句泛化人话，**绝不回退成工具名**：
   * 工具是后端加的、文案表在前端，回退到函数名意味着每加一个工具都会漏一次 `track_application`
   * 这样的开发者词汇给求职者看，而且不报错、只在截图里被发现。
   */
  summary?: ToolCallSummary;
}

/** @see ToolCall.summary */
export interface ToolCallSummary {
  /**
   * 摘要**形状**——决定明细那行怎么读（`sections` / `results` / `file`）。
   * 注意它不是图标键：图标看 `icon`。两者曾经想合成一个字段，但一个说的是「这次的产出
   * 长什么样」、另一个说的是「这个动作画什么」，合起来必然有一边要将就。
   */
  kind?: string;
  /** 动作词的 i18n key 后缀（`read` / `write` / `search` / `track`…）。 */
  verb?: string;
  /** 芯片图标键，见 `genui/beautiful/icons.tsx`。 */
  icon?: string;
  /** 这次作用在什么上——后端比前端更清楚（它知道「投递面板」，前端只能猜路径片段）。 */
  subject?: string;
  count?: number;
  name?: string;
}

/** @see ChatMessage.timeline */
export type MessageBeat =
  | {
      kind: "text";
      id: string;
      text: string;
      /** 这段模型输出属于哪一次模型请求；缺席表示旧版扁平时间线。 */
      stepId?: string;
      startedAt?: number;
      completedAt?: number;
    }
  | { kind: "tool"; id: string; call: ToolCall }
  /**
   * `push_ui` 推来的非阻塞卡片。
   *
   * 它属于**这一轮**，所以必须排在这一轮的操作栏（复制/重新生成）之前。此前卡片是
   * 追加到消息列表末尾的独立消息，而操作栏渲染在助手气泡底部，于是顺序恒为
   * 「正文 → 复制/重新生成 → 卡片」——卡片看起来像是下一轮凭空冒出来的。
   *
   * 阻塞型的卡（request_form / ask_choice 那些中断）仍是独立消息：它们要占中断槽、
   * 有自己的生命周期，不属于某一段正文。
   */
  | { kind: "widget"; id: string; widget: WidgetInstance };

/** 一次模型请求的 token 账本。字段全部可选以兼容不回 usage 的 provider。 */
export interface AgentTrajectoryUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/**
 * DeepSeek Harness 式 Step：一轮 assistant 可能经过多次「模型 → 工具」循环，不能把它们
 * 全挂在外层 run 的同一个 stepId 上。这里的 id 是本轮内稳定 id，index 才是给人看的序号。
 */
export interface AgentTrajectoryStep {
  id: string;
  index: number;
  model?: string;
  status: "running" | "done" | "failed";
  startedAt: number;
  firstTokenAt?: number;
  completedAt?: number;
  usage?: AgentTrajectoryUsage;
}

/** 可持久化的运行轨迹。行本身复用 timeline，避免保存两份会漂移的工具调用。 */
export interface AgentTrajectory {
  startedAt: number;
  completedAt?: number;
  steps: AgentTrajectoryStep[];
}

/** 搜索或内部知识检索给本轮回答带回的可追溯来源。 */
export interface CitationSource {
  id: string;
  kind: "external" | "internal";
  visibility: "visible" | "hidden";
  /** 外部来源在本轮回答里的稳定 [n] 编号。 */
  citationId?: number;
  title: string;
  url?: string;
  snippet?: string;
  publishedDate?: string;
  sourceName?: string;
  /** 搜索服务返回的网站图标；缺失时渲染层回退到站点 /favicon.ico。 */
  faviconUrl?: string;
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
  status: "pending" | "approved" | "denied" | "expired";
  /**
   * For a read_resume approval: how far the read has progressed once approved.
   * Lets the card show 已允许读取 → 正在读取简历… → 已读取简历 in one place instead of
   * spawning a separate activity line.
   */
  readState?: "reading" | "read";
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
  status?: "running" | "done" | "failed";
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
  tone?: "ok" | "info" | "warn";
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
   * present on an assistant message（旧的持久化消息可能仍是 role === 'tools'）—— 这一轮调用过的工具。
   *
   * 此前除 `read_resume` 外的工具调用**在界面上完全不可见**：只改了那颗 orb 的形态，
   * 跑完就没了。把一轮里动过的工具收成一组，用户至少能回头看「它到底做了什么」。
   */
  toolCalls?: ToolCall[];
  /**
   * 这一轮**按真实发生顺序**的节拍：说了什么、动了什么工具、又说了什么。
   *
   * `reasoning` / `toolCalls` / `content` 是三个桶，渲染时只能按固定顺序摆出来。于是模型
   * 「先说一句要干嘛、再动手」时，那句话会掉到工具行**下面**——顺序正好反了，而那句话的
   * 全部价值就在于它出现在动手之前。桶留着（复制、重新生成、eval 都在读），顺序由这条时间线说了算。
   *
   * 缺席 = 旧的持久化消息，渲染层回落到三桶的老排法。
   */
  timeline?: MessageBeat[];
  /**
   * 按模型请求切开的运行轨迹。`timeline` 保存 ASSISTANT/TOOL 的真实顺序，这里保存 Step、
   * 时延与 token 元数据；两者组合即可重建 DeepSeek Harness 风格的调用表和耗时缩略图。
   */
  trajectory?: AgentTrajectory;
  /** 本轮回答使用的来源；内部来源会被持久化但当前不渲染。 */
  sources?: CitationSource[];
  /** present when role === 'widget' — a GenUI interactive card (form / decision) */
  widget?: WidgetInstance;
  /**
   * present when this card came from a paused run. One interrupt can carry
   * several actions and the backend rejects a resume whose decision count does
   * not match, so each card remembers which slot it answers.
   */
  interruptSlot?: { requestId: string; index: number };
  /** 这条用户消息带附件。渲染层据此画回形针图标。 */
  attachment?: boolean;
  /** 同一条用户消息中的附件名。文字与文件不再拆成两个气泡。 */
  attachmentNames?: string[];
  /** present when a user message quotes a canvas snippet (「询问 Polaris」bridge) */
  quote?: { label: string; text: string };
}

export type CanvasStatus = "idle" | "streaming" | "ready" | "applied";

export interface CanvasState {
  open: boolean;
  skillId: SkillId | null;
  view: CanvasView;
  status: CanvasStatus;
}
