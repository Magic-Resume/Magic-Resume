import type { ErrorPayload } from './errors.js';

export interface Action {
  name: string;
  args: Record<string, unknown>;
}
export interface PendingApproval {
  requestId: string;
  interruptId: string;
  operationId: string;
  expectedCheckpointId: string;
  actions: Action[];
}
export type SessionState = {
  state: 'active' | 'awaiting_input' | 'checkpoint_missing' | 'not_found';
  checkpointId?: string;
  pendingApproval?: PendingApproval;
};
export type Patch = {
  kind: 'patch';
  authoritative: false;
  path: string;
  oldString?: string;
  newString?: string;
};
export type Snapshot = {
  kind: 'snapshot';
  authoritative: true;
  final: boolean;
  resume: Record<string, unknown>;
};
export type AgentEvent =
  | { type: 'done' }
  | {
      type:
        | 'run_started'
        | 'run_completed'
        | 'run_cancelled'
        | 'run_failed'
        | 'step_started'
        | 'step_completed';
      payload?: Record<string, unknown>;
    }
  | { type: 'message_chunk' | 'reasoning_chunk'; content: string }
  | {
      type:
        | 'llm_started'
        | 'llm_usage'
        | 'agent_plan'
        | 'plan_update'
        | 'skill_loaded'
        | 'subagent_started'
        | 'subagent_completed'
        | 'ui_widget'
        | 'resume_analysis'
        | 'fit_report'
        | 'resume_change_notes'
        | 'resume_verification'
        | 'source_update';
      payload: Record<string, unknown>;
      data?: unknown;
    }
  | {
      type: 'tool_started';
      payload: { toolCallId?: string; toolName: string; args?: unknown };
    }
  | {
      type: 'tool_result';
      payload: {
        toolCallId?: string;
        toolName: string;
        summary: Record<string, unknown>;
        isError?: boolean;
        error?: string;
      };
    }
  | {
      type: 'tool_completed';
      payload: { toolCallId?: string; toolName: string };
    }
  | {
      type: 'tool_approval_request';
      payload: PendingApproval & {
        toolName: string;
        reason: string;
        args: Record<string, unknown>;
      };
    }
  | {
      type: 'resume_patch';
      payload: {
        path: string;
        oldString?: string;
        newString?: string;
        mutation: Patch;
        patch?: Array<{
          op: 'add' | 'remove' | 'replace';
          path: string;
          value?: unknown;
        }>;
      };
    }
  | {
      type: 'resume_update';
      payload: {
        resume: Record<string, unknown>;
        final: true;
        mutation: Snapshot;
      };
    }
  | { type: 'error'; payload: ErrorPayload };

export type EventSink = (event: AgentEvent) => Promise<void>;
