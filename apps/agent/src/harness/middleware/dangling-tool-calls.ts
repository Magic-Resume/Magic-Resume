import { ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';
export const NAME = 'DanglingToolCalls';

export function repairDangling(
  messages: readonly BaseMessage[],
): BaseMessage[] {
  const output: BaseMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    output.push(message);
    if (message.getType() !== 'ai') continue;
    const calls = [
      ...((message as { tool_calls?: { id?: string }[] }).tool_calls ?? []),
      ...((message.additional_kwargs.tool_calls ?? []) as { id?: string }[]),
    ];
    const ids = new Set(calls.flatMap((call) => (call.id ? [call.id] : [])));
    while (messages[i + 1]?.getType() === 'tool') {
      const result = messages[++i] as ToolMessage;
      ids.delete(result.tool_call_id);
      output.push(result);
    }
    for (const id of ids)
      output.push(
        new ToolMessage({
          tool_call_id: id,
          status: 'error',
          content:
            'Cancelled before a tool result was recorded. No completed effect is confirmed; inspect the workspace before retrying.',
        }),
      );
  }
  return output;
}
export function createDanglingToolCalls() {
  return createMiddleware({
    name: NAME,
    wrapModelCall: (request, handler) =>
      handler({ ...request, messages: repairDangling(request.messages) }),
  });
}
