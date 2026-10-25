import assert from 'node:assert/strict';
import test from 'node:test';
import { HumanMessage } from '@langchain/core/messages';
import { Persistence } from '../src/persistence/store.js';
import { readSettings } from '../src/config.js';
import { WorkspaceBackend } from '../src/harness/workspace/backend.js';
import { createHarness } from '../src/harness/harness.factory.js';
import { createChatModel } from '../src/model/factory.js';
import { seedResume } from '../src/harness/workspace/files.js';
import { fixture, resume } from './helpers.js';

test('the actual composite route reads AGENTS and skills, while every disk write surface is read-only', async () => {
  const backend = new WorkspaceBackend(readSettings({}).skillsDir, 'cocreate');
  assert.deepEqual(backend.routePrefixes, ['/skills/']);
  const agents = await backend.read('/skills/AGENTS.md');
  assert.match(String(agents.content), /Resume assistance/);
  assert.match(
    String((await backend.read('/skills/resume-analysis/SKILL.md')).content),
    /Resume analysis/,
  );
  assert.ok((await backend.write('/skills/AGENTS.md', 'replace')).error);
  assert.ok(
    (await backend.edit('/skills/AGENTS.md', 'Purpose', 'Altered')).error,
  );
  assert.ok((await backend.delete('/skills')).error);
});
test('harness assembly exposes nine named policies and no checkpoint input tools in one-shot runs', () => {
  const model = createChatModel(
    {
      source: 'byok',
      apiKey: 'example-test-key',
      baseUrl: 'https://model.example.com/v1',
      modelName: 'example-model',
    },
    fetch,
  );
  const harness = createHarness({
    model,
    agentMode: 'ask',
    skillsDir: readSettings({}).skillsDir,
    limits: { modelCalls: 5, toolCalls: 5 },
  });
  assert.deepEqual(harness.middlewareNames, [
    'RunBudget',
    'ModelResilience',
    'DanglingToolCalls',
    'ToolInput',
    'AgentMode',
    'SkillFirewall',
    'SkillWriteGuard',
    'ResumeJson',
    'ResumeVerification',
  ]);
  assert.deepEqual(harness.tools, ['push_ui']);
  assert.equal(model.model, 'example-model');
});
test('main and actual task subagents share budgets and child tokens never become the answer', async (t) => {
  const f = await fixture(
    t,
    'sqlite',
    [
      {
        calls: [
          {
            name: 'task',
            args: {
              subagent_type: 'general-purpose',
              description:
                'Inspect available evidence and return a concise finding.',
            },
          },
        ],
      },
      { text: 'Child-only finding.' },
      { text: 'Root summary; remaining work is unfinished.' },
    ],
    { AGENT_MAX_MODEL_CALLS: '3', AGENT_MAX_TOOL_CALLS: '2' },
  );
  const events = await f.chat();
  assert.equal(f.fake.requests.length, 3);
  assert.ok(events.some((event) => event.type === 'subagent_started'));
  assert.ok(events.some((event) => event.type === 'subagent_completed'));
  const text = events
    .filter((event) => event.type === 'message_chunk')
    .map((event) => ('content' in event ? event.content : ''))
    .join('');
  assert.doesNotMatch(text, /Child-only/);
  assert.match(text, /Root summary/);
  assert.equal(f.fake.requests.at(-1)?.tool_choice, 'none');
});
test('workspace seeding is a real graph input and read_resume reads the latest tool-written source', async (t) => {
  const f = await fixture(t, 'memory', [
    { calls: [{ name: 'read_resume', args: {} }] },
    { text: 'Read current source.' },
  ]);
  await f.chat();
  assert.match(JSON.stringify(f.fake.requests[1].messages), /Alex Chen/);
  assert.ok(seedResume(resume)['/workspace/resume.json']);
});

test('normal turns preserve native scratch files while Ask clears the whole workspace', async (t) => {
  const f = await fixture(t, 'sqlite', [
    {
      calls: [
        {
          name: 'write_file',
          args: {
            file_path: '/large_tool_results/example.txt',
            content: 'Example retained tool result.',
          },
        },
      ],
    },
    { text: 'First turn complete.' },
    {
      calls: [
        {
          name: 'read_file',
          args: { file_path: '/large_tool_results/example.txt' },
        },
      ],
    },
    { text: 'Retained result read.' },
    {
      calls: [
        {
          name: 'read_file',
          args: { file_path: '/large_tool_results/example.txt' },
        },
      ],
    },
    { text: 'General answer without previous workspace.' },
  ]);
  await f.chat(f.body({ sessionId: 'retained' }));
  await f.chat(f.body({ sessionId: 'retained' }));
  assert.match(
    JSON.stringify(f.fake.requests[3].messages),
    /Example retained tool result/,
  );
  await f.chat(f.body({ sessionId: 'retained', agentMode: 'ask' }));
  assert.doesNotMatch(
    JSON.stringify(f.fake.requests[5].messages),
    /Example retained tool result/,
  );
});

test('Ask clears native checkpoint summaries as well as messages before calling the model', async (t) => {
  const f = await fixture(t, 'sqlite', [
    { text: 'The first resume turn is complete.' },
    { text: 'A general answer.' },
  ]);
  await f.chat(f.body({ sessionId: 'summarized' }));
  const persistence = new Persistence(f.dataDir);
  try {
    const config = { configurable: { thread_id: 'summarized' } };
    const tuple = await persistence.saver.getTuple(config);
    assert.ok(tuple);
    await persistence.saver.put(
      tuple.config,
      {
        ...tuple.checkpoint,
        channel_values: {
          ...tuple.checkpoint.channel_values,
          _summarizationSessionId: 'example-summary',
          _summarizationEvent: {
            cutoffIndex: 100,
            summaryMessage: new HumanMessage('Alex Chen private resume summary.'),
            filePath: '/conversation_history/example.md',
          },
        },
      },
      tuple.metadata!,
      {},
    );
  } finally {
    persistence.close();
  }
  await f.restart();
  await f.chat(
    f.body({
      sessionId: 'summarized',
      agentMode: 'ask',
      messages: [{ role: 'user', content: 'Explain general resume readability.' }],
    }),
  );
  const sent = JSON.stringify(f.fake.requests[1].messages);
  assert.match(sent, /Explain general resume readability/);
  assert.doesNotMatch(sent, /Alex Chen|private resume summary/);
});
