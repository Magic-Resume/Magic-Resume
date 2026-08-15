/**
 * Frontend mirror of the normalized AI streaming events consumed by the UI.
 * JSON skills (analyze) don't use it, but streaming skills do.
 */
export type AgentEventType =
  | "run_started"
  | "agent_plan"
  | "plan_update"
  | "skill_loaded"
  | "subagent_started"
  | "subagent_completed"
  | "step_started"
  | "llm_started"
  | "llm_usage"
  | "tool_started"
  | "tool_result"
  | "tool_completed"
  | "source_update"
  | "tool_approval_request"
  /** non-blocking GenUI card push — the run keeps going, unlike an interrupt */
  | "ui_widget"
  | "message_chunk"
  /** 推理模型的思维链增量。不是所有模型都回传——没有就是没有，不构成错误。 */
  | "reasoning_chunk"
  | "resume_patch"
  | "resume_update"
  /**
   * 服务端断言：本轮试过改简历、一次都没成功。
   *
   * 它存在的全部意义，是不让模型那句「我已经改好了」成为用户唯一能看到的信息——
   * 这条链路上原本没有任何一处会说「没改成」。
   */
  | "resume_write_failed"
  | "resume_sync_failed"
  | "resume_analysis"
  | "fit_report"
  /** deterministic anti-fabrication gate flagged unsourced names in an edit */
  | "resume_verification"
  /**
   * 逐字段改动的理由（`explain_changes`）。
   *
   * 整篇改写此前给每个字段盖同一句「AI 按目标岗位优化」——对每处都成立，因此对每处都
   * 没有信息量。理由只有模型知道，所以它必须由模型说出来并精确绑定字段。
   */
  | "resume_change_notes"
  | "run_cancelled"
  | "translation_result"
  | "pdf_result"
  | "interview_question"
  | "critique"
  | "suggestion"
  | "step_completed"
  | "run_completed"
  | "run_failed"
  | "done"
  | "error";

interface AgentSseBase {
  /** Missing means the legacy v0 stream during the one-release transition. */
  protocolVersion?: 1;
  /** Monotonic sequence scoped to this HTTP SSE response. */
  streamSequence?: number;
  runId?: string;
  stepId?: string;
  sequence?: number;
  /** text delta for `message_chunk` */
  content?: string;
  /** structured artifact (e.g. resume, analysis) */
  data?: unknown;
  error?: string;
}

type AgentToolSseEvent = AgentSseBase &
  (
    | {
        type: "tool_started";
        payload: { toolCallId?: string; toolName: string; args?: unknown };
      }
    | {
        type: "tool_result";
        payload: {
          toolCallId?: string;
          toolName?: string;
          result?: unknown;
          summary?: unknown;
          kind?: string;
          phase?: string;
          [key: string]: unknown;
        };
      }
    | {
        type: "tool_completed";
        payload: { toolCallId?: string; toolName: string };
      }
    | {
        type: "tool_approval_request";
        payload: {
          requestId: string;
          toolName: string;
          reason: string;
          args: Record<string, unknown>;
          actions: Array<{ name: string; args: Record<string, unknown> }>;
        };
      }
  );

type AgentResumeSseEvent = AgentSseBase &
  (
    | {
        type: "resume_patch";
        payload: {
          path: string;
          oldString?: string;
          newString?: string;
          mutation: Extract<ResumeMutation, { kind: "patch" }>;
        };
      }
    | {
        type: "resume_update";
        payload: {
          resume: Record<string, unknown>;
          final?: boolean;
          mutation?: Extract<ResumeMutation, { kind: "snapshot" }>;
        };
      }
    | {
        type: "resume_write_failed" | "resume_sync_failed";
        payload: { attempts?: number; engine?: string };
      }
  );

type AgentTerminalSseEvent = AgentSseBase &
  (
    | {
        type: "error";
        payload?: {
          code?: string;
          errorCode?: string;
          subCode?: string;
          params?: Record<string, unknown>;
          requestId?: string;
          retryable?: boolean;
          message?: string;
        };
      }
    | { type: "done"; payload?: never }
  );

type SpecializedEventType =
  | AgentToolSseEvent["type"]
  | AgentResumeSseEvent["type"]
  | AgentTerminalSseEvent["type"];

export type AgentSseEvent =
  | AgentToolSseEvent
  | AgentResumeSseEvent
  | AgentTerminalSseEvent
  | (AgentSseBase & {
      type: Exclude<AgentEventType, SpecializedEventType>;
      payload?: Record<string, unknown>;
    });

export type ResumeMutation =
  | {
      kind: "patch";
      authoritative: false;
      path: string;
      oldString?: string;
      newString?: string;
    }
  | {
      kind: "snapshot";
      authoritative: true;
      final: true;
      resume: Record<string, unknown>;
    };

/** Reasoning strength ("强度") → OpenAI-compatible `reasoning_effort`. */
export type ReasoningEffort = "low" | "medium" | "high";

/** User-provided model config carried in request bodies. */
export interface AgentLlmConfig {
  source?: "internal" | "byok";
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  maxTokens?: number;
  /** Picked in the composer; only sent when set. */
  effort?: ReasoningEffort;
}
