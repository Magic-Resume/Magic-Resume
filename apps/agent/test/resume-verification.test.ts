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

test('ResumeVerification checks new facts against attachment text, and degrades for unreadable attachments', async () => {
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
  const write = () =>
    toolRequest(
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
            // Graph state keeps only a reference to what was read, never the text.
            new ToolMessage({
              content: '{"attachmentRead":{"name":"resume.pdf"}}',
              name: 'read_attachment',
              tool_call_id: 'call-attachment',
            }),
          ],
        },
      },
    );
  const attachments = (text: string, unreadable = false) => ({
    evidence: () => Promise.resolve({ text, unreadable }),
  });
  const verified = await captureCustom(() =>
    Promise.resolve(
      runTool(
        createResumeVerification(
          resume,
          attachments(
            'Example Harbor Studio | Frontend Intern | 2024.05 - 2024.09\nCut page load time by 30%.',
          ),
        ),
        write(),
      ),
    ),
  );
  assert.deepEqual(verified.events, []);
  const unreadable = await captureCustom(() =>
    Promise.resolve(
      runTool(createResumeVerification(resume, attachments('', true)), write()),
    ),
  );
  assert.deepEqual(
    unreadable.events.map((event) => event.data),
    [{ status: 'degraded', reason: 'attachment_unverifiable' }],
  );
  assert.doesNotMatch(
    JSON.stringify(unreadable.result),
    /Confirm their source/,
  );
});
