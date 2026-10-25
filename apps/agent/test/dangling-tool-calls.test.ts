import assert from 'node:assert/strict';
import test from 'node:test';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import {
  createDanglingToolCalls,
  NAME,
  repairDangling,
} from '../src/harness/middleware/dangling-tool-calls.js';
test('DanglingToolCalls repairs missing results next to the call and is idempotent', () => {
  assert.equal(createDanglingToolCalls().name, NAME);
  const ai = new AIMessage({
    content: '',
    tool_calls: [
      { id: 'a', name: 'read_resume', args: {} },
      { id: 'b', name: 'read_file', args: {} },
    ],
  });
  const messages = [
    ai,
    new ToolMessage({ tool_call_id: 'a', content: 'Read' }),
    new HumanMessage('Continue'),
  ];
  const repaired = repairDangling(messages);
  assert.equal(repaired.length, 4);
  assert.equal((repaired[2] as ToolMessage).tool_call_id, 'b');
  assert.match(String(repaired[2].content), /Cancelled/);
  assert.equal(repairDangling(repaired).length, 4);
  assert.equal(messages.length, 3);
  const wire = new AIMessage({
    content: '',
    additional_kwargs: {
      tool_calls: [
        {
          id: 'wire',
          type: 'function',
          function: { name: 'read_resume', arguments: '{}' },
        },
      ],
    },
  });
  assert.equal((repairDangling([wire])[1] as ToolMessage).tool_call_id, 'wire');
});
