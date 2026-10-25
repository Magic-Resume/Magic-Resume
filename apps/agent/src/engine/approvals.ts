import { createHash } from 'node:crypto';
import type { CheckpointTuple } from '@langchain/langgraph';
import type { PendingApproval, AgentEvent } from '../contracts/events.js';
import type { ApprovalRequest } from '../contracts/requests.js';
import { AgentError } from '../contracts/errors.js';
import { formSchema, choiceSchema } from '../harness/tools/widgets.js';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
export function pendingApproval(
  thread: string,
  tuple: CheckpointTuple | undefined,
): PendingApproval | undefined {
  const writes =
    tuple?.pendingWrites?.filter(
      ([, channel]) => channel === '__interrupt__',
    ) ?? [];
  const interrupt = record(
    Array.isArray(writes[0]?.[2]) ? writes[0][2][0] : writes[0]?.[2],
  );
  const value = record(interrupt.value);
  const actions = Array.isArray(value.actionRequests)
    ? value.actionRequests.map((action) => {
        const entry = record(action);
        return { name: String(entry.name ?? ''), args: record(entry.args) };
      })
    : [];
  const interruptId =
    typeof interrupt.id === 'string' ? interrupt.id : undefined;
  if (!tuple || !interruptId || !actions.length) return undefined;
  const expectedCheckpointId = tuple.checkpoint.id;
  return {
    requestId: interruptId,
    interruptId,
    operationId: createHash('sha256')
      .update(`${thread}:${expectedCheckpointId}:${interruptId}`)
      .digest('hex'),
    expectedCheckpointId,
    actions,
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function decisionHash(decisions: ApprovalRequest['decisions']): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(decisions)))
    .digest('hex');
}
export function assertValidDecisions(
  pending: PendingApproval | undefined,
  input: ApprovalRequest,
) {
  if (
    !pending ||
    pending.interruptId !== input.interruptId ||
    pending.operationId !== input.operationId ||
    pending.expectedCheckpointId !== input.expectedCheckpointId
  )
    throw new AgentError(409, 'conflict', 'approval_target_stale');
  if (pending.actions.length !== input.decisions.length)
    throw new AgentError(400, 'invalid_input', 'approval_count_invalid');
  input.decisions.forEach((decision, index) => {
    if (decision.type === 'approve')
      throw new AgentError(
        400,
        'invalid_input',
        'approval_decision_not_allowed',
      );
    if (decision.type === 'reject') return;
    const action = pending.actions[index];
    if (
      decision.editedAction.name !== action.name ||
      !['request_form', 'ask_choice'].includes(action.name)
    )
      throw new AgentError(400, 'invalid_input', 'approval_action_invalid');
    const schema = action.name === 'request_form' ? formSchema : choiceSchema;
    const original = { ...action.args };
    delete original.values;
    const edited = { ...decision.editedAction.args };
    delete edited.values;
    if (
      JSON.stringify(canonical(original)) !== JSON.stringify(canonical(edited))
    )
      throw new AgentError(400, 'invalid_input', 'approval_action_changed');
    if (
      !schema.safeParse(decision.editedAction.args).success ||
      !decision.editedAction.args.values ||
      typeof decision.editedAction.args.values !== 'object'
    )
      throw new AgentError(400, 'invalid_input', 'approval_values_invalid');
  });
}
export function approvalEvent(pending: PendingApproval): AgentEvent {
  const first = pending.actions[0];
  return {
    type: 'tool_approval_request',
    payload: {
      ...pending,
      toolName: first.name,
      args: first.args,
      reason: 'Provide the requested input, or skip this step.',
    },
  };
}
