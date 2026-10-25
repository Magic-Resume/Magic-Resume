import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSkillFirewall,
  NAME,
} from '../src/harness/middleware/skill-firewall.js';
import { runTool, toolRequest } from './middleware-helpers.js';
test('SkillFirewall activates on normalized skill reads and replaces the previous policy', async () => {
  const firewall = createSkillFirewall(
    new Map([
      ['analysis', { allowedTools: ['analyze_resume'] }],
      ['rewrite', { allowedTools: ['write_file'] }],
    ]),
  );
  assert.equal(firewall.name, NAME);
  await runTool(
    firewall,
    toolRequest('read_file', { file_path: '/skills/rewrite/SKILL.md' }),
  );
  assert.doesNotMatch(
    JSON.stringify(await runTool(firewall, toolRequest('write_file', {}))),
    /does not permit/,
  );
  await runTool(
    firewall,
    toolRequest('read_file', {
      file_path: '/skills/rewrite/../analysis/SKILL.md',
    }),
  );
  assert.match(
    JSON.stringify(await runTool(firewall, toolRequest('write_file', {}))),
    /does not permit/,
  );
  assert.doesNotMatch(
    JSON.stringify(await runTool(firewall, toolRequest('write_todos', {}))),
    /does not permit/,
  );
});
