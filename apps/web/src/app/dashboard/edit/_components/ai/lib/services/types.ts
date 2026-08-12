/**
 * Frontend mirror of the normalized AI streaming events consumed by the UI.
 * JSON skills (analyze) don't use it, but streaming skills do.
 */
export type AgentEventType =
  | 'run_started'
  | 'agent_plan'
  | 'plan_update'
  | 'skill_loaded'
  | 'subagent_started'
  | 'subagent_completed'
  | 'step_started'
  | 'llm_started'
  | 'llm_usage'
  | 'tool_started'
  | 'tool_result'
  | 'tool_completed'
  | 'tool_approval_request'
  /** non-blocking GenUI card push — the run keeps going, unlike an interrupt */
  | 'ui_widget'
  | 'message_chunk'
  /** 推理模型的思维链增量。不是所有模型都回传——没有就是没有，不构成错误。 */
  | 'reasoning_chunk'
  | 'resume_patch'
  | 'resume_update'
  /**
   * 服务端断言：本轮试过改简历、一次都没成功。
   *
   * 它存在的全部意义，是不让模型那句「我已经改好了」成为用户唯一能看到的信息——
   * 这条链路上原本没有任何一处会说「没改成」。
   */
  | 'resume_write_failed'
  | 'resume_analysis'
  | 'fit_report'
  /** deterministic anti-fabrication gate flagged unsourced names in an edit */
  | 'resume_verification'
  /**
   * 逐条改动的理由（`explain_changes`）。
   *
   * 整篇改写此前给每条改动盖同一句「AI 按目标岗位优化」——对每条都成立，因此对每条都
   * 没有信息量。理由只有模型知道，所以它必须由模型说出来。
   */
  | 'resume_change_notes'
  | 'run_cancelled'
  | 'translation_result'
  | 'pdf_result'
  | 'interview_question'
  | 'critique'
  | 'suggestion'
  | 'step_completed'
  | 'run_completed'
  | 'run_failed'
  | 'done'
  | 'error';

export interface AgentSseEvent {
  type: AgentEventType;
  runId?: string;
  stepId?: string;
  sequence?: number;
  /** text delta for `message_chunk` */
  content?: string;
  payload?: Record<string, unknown>;
  /** structured artifact (e.g. resume, analysis) */
  data?: unknown;
  error?: string;
}

/** Reasoning strength ("强度") → OpenAI-compatible `reasoning_effort`. */
export type ReasoningEffort = 'low' | 'medium' | 'high';

/** User-provided model config carried in request bodies. */
export interface AgentLlmConfig {
  source?: 'internal' | 'byok';
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  maxTokens?: number;
  /** Picked in the composer; only sent when set. */
  effort?: ReasoningEffort;
}
