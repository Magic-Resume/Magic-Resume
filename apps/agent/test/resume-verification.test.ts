import assert from 'node:assert/strict';
import test from 'node:test';
import { HumanMessage, ToolMessage } from '@langchain/core/messages';
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

test('ResumeVerification accepts facts the user supplied in an attachment', async () => {
  const fromAttachment = {
    ...resume,
    sections: {
      ...resume.sections,
      experience: [
        {
          ...resume.sections.experience[0],
          company: 'Example Harbor Studio',
          date: '2024.05 - 2024.09',
          summary: 'Cut page load time by 30%.',
        },
      ],
    },
  };
  const attachmentText =
    'Example Harbor Studio | Frontend Intern | 2024.05 - 2024.09\nCut page load time by 30%.';
  const request = toolRequest(
    'write_file',
    {
      file_path: '/workspace/resume.json',
      content: JSON.stringify(fromAttachment),
    },
    {
      state: {
        files: seedResume(resume),
        messages: [
          new HumanMessage('Rewrite my resume from the attached PDF.'),
          new ToolMessage({
            content: attachmentText,
            name: 'read_attachment',
            tool_call_id: 'call-attachment',
          }),
        ],
      },
    },
  );
  const captured = await captureCustom(() =>
    Promise.resolve(runTool(createResumeVerification(resume), request)),
  );
  assert.ok(
    !captured.events.some((event) => event.name === 'resume_verification'),
    JSON.stringify(captured.events),
  );
});
