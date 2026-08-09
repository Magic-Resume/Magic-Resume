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
  | 'resume_patch'
  | 'resume_update'
  | 'resume_analysis'
  | 'fit_report'
  /** deterministic anti-fabrication gate flagged unsourced names in an edit */
  | 'resume_verification'
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
