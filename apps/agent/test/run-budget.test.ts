import assert from 'node:assert/strict';
import test from 'node:test';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { createRunBudget, NAME } from '../src/harness/middleware/run-budget.js';
import {
  runModel,
  runTool,
  modelRequest,
  toolRequest,
} from './middleware-helpers.js';
test('RunBudget shares counts with children, reserves a final answer and refuses excess tools', async () => {
  const budget = createRunBudget({ modelCalls: 3, toolCalls: 1 });
  const root = budget.middleware();
  const child = budget.middleware('child');
  assert.equal(root.name, NAME);
  await runModel(child);
  assert.equal(budget.claimInternal(), true);
  const deniedChild = await runModel(child);
  assert.match(JSON.stringify(deniedChild), /exhausted/);
  let final = false;
  await runModel(
    root,
    modelRequest({ tools: [{ name: 'example' }] }),
    async (request?: unknown) => {
      final = true;
      assert.equal((request as { toolChoice: string }).toolChoice, 'none');
      return new AIMessage('Confirmed results; work remains.');
    },
  );
  assert.ok(final);
  assert.equal(budget.counts().models, 3);
  const extra = await runModel(root);
  assert.match(JSON.stringify(extra), /remaining work/);
  await runTool(root, toolRequest('read_resume', {}));
  const refused = await runTool(child, toolRequest('read_resume', {}));
  assert.ok(ToolMessage.isInstance(refused));
  assert.equal(refused.status, 'error');
  assert.equal(budget.counts().tools, 1);
});
