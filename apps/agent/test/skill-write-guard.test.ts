import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSkillWriteGuard,
  NAME,
} from '../src/harness/middleware/skill-write-guard.js';
import { runTool, toolRequest } from './middleware-helpers.js';
test('SkillWriteGuard refuses every skill write alias and traversal path', async () => {
  const middleware = createSkillWriteGuard();
  assert.equal(middleware.name, NAME);
  for (const path of [
    '/skills/a/SKILL.md',
    '/workspace/../skills/AGENTS.md',
    '/skills',
  ])
    for (const name of ['write_file', 'edit_file', 'delete_file'])
      assert.match(
        JSON.stringify(
          await runTool(middleware, toolRequest(name, { filePath: path })),
        ),
        /read-only/,
      );
  assert.doesNotMatch(
    JSON.stringify(
      await runTool(
        middleware,
        toolRequest('read_file', { file_path: '/skills/AGENTS.md' }),
      ),
    ),
    /error/,
  );
});
