import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';
import { denied } from './common.js';
export const NAME = 'ToolInput';
const MAX_INPUT = 32_768;
export function unwrapInput(value: unknown): unknown {
  let current = value;
  for (let i = 0; i < 3; i++) {
    if (typeof current === 'string') {
      try {
        current = JSON.parse(current);
      } catch {
        return current;
      }
    } else if (
      current &&
      typeof current === 'object' &&
      Object.keys(current).length === 1 &&
      'input' in current
    )
      current = current.input;
    else break;
  }
  return current;
}
/** Only completed calls are compacted. Pending tool arguments must remain executable. */
export function compactInputs(messages: BaseMessage[]): BaseMessage[] {
  const done = new Set(
    messages
      .filter((message) => message.getType() === 'tool')
      .map((message) => (message as { tool_call_id?: string }).tool_call_id),
  );
  return messages.map((message) => {
    if (!AIMessage.isInstance(message) || !message.tool_calls?.length)
      return message;
    const calls = message.tool_calls.map((call) =>
      done.has(call.id) && JSON.stringify(call.args).length > MAX_INPUT
        ? {
            ...call,
            args: {
              omitted:
                'Completed large arguments; read workspace for current content.',
            },
          }
        : call,
    );
    // OpenAI adapters may prefer the wire representation in additional_kwargs.
    const kwargs = { ...message.additional_kwargs };
    delete kwargs.tool_calls;
    return new AIMessage({
      ...message,
      additional_kwargs: kwargs,
      tool_calls: calls,
    });
  });
}
interface InputSchema {
  safeParse(value: unknown): {
    success: boolean;
    error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
  };
}
export function recoverToolCalls(
  message: AIMessage,
  schemas = new Map<string, InputSchema>(),
): AIMessage {
  if (!message.tool_calls?.length && !message.invalid_tool_calls?.length)
    return message;
  const rawCalls = message.additional_kwargs.tool_calls ?? [];
  const all = [
    ...(message.tool_calls ?? []),
    ...(message.invalid_tool_calls ?? []),
  ];
  const calls = all.map((call, index) => {
    const name = call.name ?? 'invalid_tool_input';
    let args = unwrapInput(call.args);
    const raw = rawCalls.find((raw) => raw.id === call.id)?.function?.arguments;
    let problem: string | undefined;
    if (typeof raw === 'string') {
      try {
        JSON.parse(raw);
      } catch {
        problem = 'The model supplied incomplete or invalid JSON.';
      }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args))
      problem =
        'The model supplied incomplete or invalid JSON. Tool arguments must be a complete object.';
    const normalized =
      args && typeof args === 'object' && !Array.isArray(args)
        ? ({ ...args } as Record<string, unknown>)
        : {};
    // Model-authored values are never evidence of a human submission. Native
    // HITL injects the actual values after this model-response boundary.
    if (name === 'request_form' || name === 'ask_choice')
      delete normalized.values;
    const size = Buffer.byteLength(JSON.stringify(normalized));
    if (
      size >
      (['write_file', 'edit_file'].includes(name) ? 1_048_576 : MAX_INPUT)
    )
      problem =
        'Arguments are too large. Read workspace files instead of embedding them in another tool.';
    const result = schemas.get(name)?.safeParse(normalized);
    if (result && !result.success)
      problem =
        'Invalid tool arguments: ' +
        result.error?.issues
          .slice(0, 6)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
    args = problem ? { __agent_invalid_json__: problem } : normalized;
    return {
      name: problem ? 'invalid_tool_input' : name,
      id: call.id ?? `invalid-call-${index}`,
      args: args as Record<string, unknown>,
      type: 'tool_call' as const,
    };
  });
  const kwargs = { ...message.additional_kwargs };
  delete kwargs.tool_calls;
  return new AIMessage({
    ...message,
    additional_kwargs: kwargs,
    tool_calls: calls,
    invalid_tool_calls: [],
  });
}
export function createToolInput() {
  return createMiddleware({
    name: NAME,
    wrapModelCall: async (request, handler) => {
      const schemas = new Map<string, InputSchema>();
      for (const tool of request.tools) {
        if (
          'name' in tool &&
          typeof tool.name === 'string' &&
          'schema' in tool &&
          tool.schema &&
          typeof tool.schema === 'object' &&
          'safeParse' in tool.schema &&
          typeof tool.schema.safeParse === 'function'
        )
          schemas.set(tool.name, tool.schema as InputSchema);
      }
      const result = await handler({
        ...request,
        messages: compactInputs(request.messages),
      });
      // Repair before native afterModel/HITL runs, otherwise a wrapped form
      // call could bypass the interrupt or pause with unrenderable arguments.
      return recoverToolCalls(result, schemas);
    },
    wrapToolCall: async (request, handler) => {
      const { toolCall, tool } = request;
      const args = unwrapInput(toolCall.args);
      if (args && typeof args === 'object' && '__agent_invalid_json__' in args)
        return denied(
          toolCall,
          `${typeof args.__agent_invalid_json__ === 'string' ? args.__agent_invalid_json__ : 'The model supplied incomplete or invalid JSON.'} This tool was not executed. Correct all arguments and retry.`,
        );
      const size = Buffer.byteLength(JSON.stringify(args) ?? '');
      const maximum =
        toolCall.name === 'write_file' || toolCall.name === 'edit_file'
          ? 1_048_576
          : MAX_INPUT;
      if (size > maximum)
        return denied(
          toolCall,
          `Arguments are too large (${size} bytes; limit ${maximum}). The input was discarded without execution. Read the workspace instead of embedding a resume in this tool.`,
        );
      const schema = tool && 'schema' in tool ? tool.schema : undefined;
      if (
        schema &&
        typeof schema === 'object' &&
        'safeParseAsync' in schema &&
        typeof schema.safeParseAsync === 'function'
      ) {
        const result = await schema.safeParseAsync(args);
        if (!result.success)
          return denied(
            toolCall,
            `Invalid tool arguments: ${result.error.issues
              .slice(0, 6)
              .map(
                (issue: { path: PropertyKey[]; message: string }) =>
                  `${issue.path.join('.')}: ${issue.message}`,
              )
              .join('; ')}. Correct the JSON and retry.`,
          );
      }
      try {
        return await handler({
          ...request,
          toolCall: { ...toolCall, args: args as Record<string, unknown> },
        });
      } catch (error) {
        // Provider and execution errors must keep their authored HTTP/SSE classification.
        let cause: unknown = error;
        for (
          let depth = 0;
          depth < 6 && cause && typeof cause === 'object';
          depth++
        ) {
          const candidate = cause as {
            name?: string;
            cause?: unknown;
            toolError?: unknown;
          };
          if (
            candidate.name === 'ToolInputParsingException' ||
            candidate.name === 'ZodError'
          )
            return denied(
              toolCall,
              'Invalid tool arguments. Supply complete JSON matching the tool schema.',
            );
          cause = candidate.toolError ?? candidate.cause;
        }
        throw error;
      }
    },
  });
}
