import assert from 'node:assert/strict';
import test from 'node:test';
import { HumanMessage } from '@langchain/core/messages';
import {
  createResumeVerification,
  NAME,
  newFacts,
} from '../src/harness/middleware/resume-verification.js';
import { seedResume } from '../src/harness/workspace/files.js';
import { resume } from './helpers.js';
import { captureCustom, runTool, toolRequest } from './middleware-helpers.js';
test('ResumeVerification flags new organizations, credentials, dates and metrics but accepts user evidence', async () => {
  const changed = {
    ...resume,
    sections: {
      ...resume.sections,
      experience: [
        {
          ...resume.sections.experience[0],
          company: 'Fictional New Labs',
          date: '2025 - 2026',
          certificate: 'Example Certificate',
          summary: 'Improved speed by 35%.',
        },
      ],
    },
  };
  const suspected = newFacts(resume, changed, '');
  for (const fact of ['Fictional New Labs', '2025 - 2026', '35%'])
    assert.ok(suspected.includes(fact), JSON.stringify(suspected));
  assert.deepEqual(newFacts(resume, changed, JSON.stringify(changed)), []);
  const middleware = createResumeVerification(resume);
  assert.equal(middleware.name, NAME);
  const request = toolRequest(
    'write_file',
    { file_path: '/workspace/resume.json', content: JSON.stringify(changed) },
    {
      state: {
        files: seedResume(resume),
        messages: [new HumanMessage('Make it clearer.')],
      },
    },
  );
  const captured = await captureCustom(() =>
    Promise.resolve(runTool(middleware, request)),
  );
  assert.ok(
    captured.events.some((event) => event.name === 'resume_verification'),
  );
  assert.match(JSON.stringify(captured.result), /Confirm their source/);
});
