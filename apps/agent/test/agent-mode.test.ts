import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentMode, NAME } from '../src/harness/middleware/agent-mode.js';
import { runTool, toolRequest } from './middleware-helpers.js';
test('AgentMode denies resume writes in plan mode and every resume access or task in ask mode', async () => {
  assert.equal(createAgentMode('plan').name, NAME);
  for (const mode of ['plan', 'ask'] as const) {
    for (const name of ['write_file', 'edit_file', 'delete_file'])
      assert.match(
        JSON.stringify(
          await runTool(
            createAgentMode(mode),
            toolRequest(name, { file_path: '/workspace/sub/../resume.json' }),
          ),
        ),
        /mode|only|cannot be deleted/,
      );
  }
  assert.match(
    JSON.stringify(
      await runTool(createAgentMode('ask'), toolRequest('read_resume', {})),
    ),
    /no resume access/,
  );
  assert.match(
    JSON.stringify(
      await runTool(createAgentMode('ask'), toolRequest('task', {})),
    ),
    /no resume access/,
  );
  assert.doesNotMatch(
    JSON.stringify(
      await runTool(
        createAgentMode('plan'),
        toolRequest('write_file', {
          file_path: '/large_tool_results/result.txt',
        }),
      ),
    ),
    /error/,
  );
});

test('directory deletion aliases cannot remove the resume in a read-only mode', async () => {
  for (const path of ['/workspace/', '/workspace/resume.json/', '/']) {
    const result = await runTool(
      createAgentMode('plan'),
      toolRequest('delete_file', { file_path: path }),
    );
    assert.match(JSON.stringify(result), /cannot be deleted/);
  }
});
