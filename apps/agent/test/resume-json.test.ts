import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createResumeJson,
  NAME,
} from '../src/harness/middleware/resume-json.js';
import { seedResume } from '../src/harness/workspace/files.js';
import { resume } from './helpers.js';
import { runTool, toolRequest } from './middleware-helpers.js';
test('ResumeJson rejects malformed or invalid fields and validates the complete edited document', async () => {
  const middleware = createResumeJson();
  assert.equal(middleware.name, NAME);
  for (const content of [
    '{broken',
    JSON.stringify({ ...resume, info: { fullName: 123 } }),
  ])
    assert.match(
      JSON.stringify(
        await runTool(
          middleware,
          toolRequest('write_file', {
            file_path: '/workspace/resume.json',
            content,
          }),
        ),
      ),
      /write rejected/,
    );
  const good = await runTool(
    middleware,
    toolRequest(
      'edit_file',
      {
        file_path: '/workspace/resume.json',
        old_string: 'Built accessible interfaces.',
        new_string: 'Built clear, accessible interfaces.',
      },
      { state: { files: seedResume(resume), messages: [] } },
    ),
  );
  assert.doesNotMatch(JSON.stringify(good), /rejected/);
  assert.match(
    JSON.stringify(
      await runTool(
        middleware,
        toolRequest('delete_file', { file_path: '/workspace/resume.json' }),
      ),
    ),
    /cannot delete/,
  );
});

test('resume validation refuses prototype keys before any browser patch can be produced', async () => {
  const content =
    '{"__proto__":{"polluted":true},' + JSON.stringify(resume).slice(1);
  const result = await runTool(
    createResumeJson(),
    toolRequest('write_file', { file_path: '/workspace/resume.json', content }),
  );
  assert.match(JSON.stringify(result), /Reserved object keys/);
});
