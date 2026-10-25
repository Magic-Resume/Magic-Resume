import {
  AIMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import type { AnyAgentMiddleware } from 'langchain';
export const modelRequest = (overrides: Record<string, unknown> = {}) => ({
  messages: [],
  tools: [],
  systemMessage: new SystemMessage('Base instructions'),
  systemPrompt: 'Base instructions',
  state: { messages: [] },
  runtime: { signal: new AbortController().signal },
  ...overrides,
});
export const toolRequest = (
  name: string,
  args: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) => ({
  toolCall: { name, args, id: 'example-call', type: 'tool_call' },
  state: { messages: [] },
  runtime: { signal: new AbortController().signal },
  ...overrides,
});
export async function runModel(
  middleware: AnyAgentMiddleware,
  request = modelRequest(),
  handler = async () => new AIMessage('Completed.'),
) {
  return middleware.wrapModelCall!(request as never, handler as never);
}
export async function runTool(
  middleware: AnyAgentMiddleware,
  request: ReturnType<typeof toolRequest>,
  handler = async () =>
    new ToolMessage({ tool_call_id: 'example-call', content: 'Success' }),
) {
  return middleware.wrapToolCall!(request as never, handler as never);
}
export async function captureCustom<T>(invoke: () => Promise<T>) {
  const events: Array<{ name: string; data: unknown }> = [];
  const result = await RunnableLambda.from(invoke).invoke(
    {},
    {
      callbacks: [
        {
          handleCustomEvent(name, data) {
            events.push({ name, data });
          },
        },
      ],
    },
  );
  return { result, events };
}
