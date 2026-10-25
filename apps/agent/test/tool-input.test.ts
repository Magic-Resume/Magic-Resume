import assert from 'node:assert/strict';
import test from 'node:test';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  createToolInput,
  NAME,
  unwrapInput,
  compactInputs,
  recoverToolCalls,
} from '../src/harness/middleware/tool-input.js';
import { runTool, toolRequest } from './middleware-helpers.js';
test('ToolInput unwraps recoverable JSON and rejects invalid and oversized arguments without execution', async () => {
  const middleware = createToolInput();
  assert.equal(middleware.name, NAME);
  assert.deepEqual(unwrapInput(JSON.stringify({ input: { value: 'ok' } })), {
    value: 'ok',
  });
  const request = toolRequest(
    'example_tool',
    { input: { value: 'ok' } },
    { tool: { schema: z.object({ value: z.string() }) } },
  );
  let called = 0;
  await runTool(middleware, request, async (input?: unknown) => {
    called++;
    assert.deepEqual((input as { toolCall: { args: unknown } }).toolCall.args, {
      value: 'ok',
    });
    return new ToolMessage({
      tool_call_id: 'example-call',
      content: 'Success',
    });
  });
  const invalid = await runTool(
    middleware,
    toolRequest(
      'example_tool',
      { value: 12 },
      { tool: { schema: z.object({ value: z.string() }) } },
    ),
  );
  assert.match(JSON.stringify(invalid), /Invalid tool arguments/);
  const oversized = await runTool(
    middleware,
    toolRequest('read_resume', { content: 'x'.repeat(40_000) }),
  );
  assert.match(JSON.stringify(oversized), /too large/);
  assert.equal(called, 1);
});
test('ToolInput compacts completed huge calls while preserving pending arguments and validation results', () => {
  const ai = new AIMessage({
    content: '',
    tool_calls: [
      {
        id: 'complete',
        name: 'write_file',
        args: { content: 'x'.repeat(40_000) },
      },
      {
        id: 'pending',
        name: 'write_file',
        args: { content: 'y'.repeat(40_000) },
      },
    ],
  });
  const result = new ToolMessage({
    tool_call_id: 'complete',
    content: 'Validation feedback',
  });
  const compacted = compactInputs([ai, result]);
  assert.match(
    JSON.stringify((compacted[0] as AIMessage).tool_calls?.[0].args),
    /omitted/,
  );
  assert.equal(
    (compacted[0] as AIMessage).tool_calls?.[1].args.content.length,
    40_000,
  );
  assert.equal(compacted[1], result);
});

test('ToolInput restores string-wrapped calls from model parsing failures and preserves rejection of truncated JSON', async () => {
  const middleware = createToolInput();
  const state = {
    messages: [
      new AIMessage({
        id: 'example-message',
        content: '',
        invalid_tool_calls: [
          {
            id: 'wrapped',
            name: 'example_tool',
            args: JSON.stringify(JSON.stringify({ value: 'submitted' })),
            error: 'Expected an object',
          },
          {
            id: 'truncated',
            name: 'read_resume',
            args: '{"incomplete":',
            error: 'Invalid JSON',
          },
        ],
      }),
    ],
  };
  const message = recoverToolCalls(state.messages[0]);
  assert.deepEqual(message.tool_calls?.[0].args, { value: 'submitted' });
  assert.deepEqual(message.invalid_tool_calls, []);
  const refused = await runTool(
    middleware,
    toolRequest('read_resume', message.tool_calls![1].args),
  );
  assert.match(JSON.stringify(refused), /incomplete or invalid JSON/);
});
