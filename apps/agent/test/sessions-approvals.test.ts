import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { emptyCheckpoint } from '@langchain/langgraph';
import { parseApprovalRequest } from '../src/contracts/requests.js';
import { AgentError } from '../src/contracts/errors.js';
import {
  assertValidDecisions,
  decisionHash,
  pendingApproval,
} from '../src/engine/approvals.js';
import { Sessions } from '../src/engine/sessions.js';
import { Persistence } from '../src/persistence/store.js';
import { fixture, frames, resume } from './helpers.js';
const config = {
  apiKey: 'example-test-key',
  baseUrl: 'https://model.example.com/v1',
  modelName: 'example-model',
};

test('approval validation enforces the target, action count, edit/reject policy and tool identity', () => {
  const input = parseApprovalRequest({
    sessionId: 'example-session',
    interruptId: 'interrupt',
    operationId: '0'.repeat(64),
    expectedCheckpointId: 'checkpoint',
    decisions: [
      {
        type: 'edit',
        editedAction: {
          name: 'request_form',
          args: { formKind: 'job_info', values: { jd: 'Example role' } },
        },
      },
    ],
    config,
  });
  const pending = {
    requestId: 'interrupt',
    interruptId: input.interruptId,
    operationId: input.operationId,
    expectedCheckpointId: input.expectedCheckpointId,
    actions: [{ name: 'request_form', args: { formKind: 'job_info' } }],
  };
  assert.doesNotThrow(() => assertValidDecisions(pending, input));
  for (const invalid of [
    { ...input, interruptId: 'stale' },
    { ...input, operationId: '1'.repeat(64) },
    { ...input, expectedCheckpointId: 'stale' },
    { ...input, decisions: [] },
    { ...input, decisions: [{ type: 'approve' as const }] },
    {
      ...input,
      decisions: [
        {
          type: 'edit' as const,
          editedAction: { name: 'write_file', args: {} },
        },
      ],
    },
    {
      ...input,
      decisions: [
        {
          type: 'edit' as const,
          editedAction: {
            name: 'request_form',
            args: { formKind: 'target_language', values: { lang: 'en' } },
          },
        },
      ],
    },
  ])
    assert.throws(() => assertValidDecisions(pending, invalid), AgentError);
  assert.equal(
    decisionHash([
      { type: 'edit', editedAction: { name: 'example', args: { b: 2, a: 1 } } },
    ]),
    decisionHash([
      { type: 'edit', editedAction: { name: 'example', args: { a: 1, b: 2 } } },
    ]),
  );
});
test('session state distinguishes absent and lost checkpoints and expiry skips busy threads', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'resume-agent-storage-'));
  const store = new Persistence(directory);
  t.after(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const sessions = new Sessions(store);
  assert.equal((await sessions.state('missing')).state, 'not_found');
  const checkpoint = emptyCheckpoint();
  await store.saver.put(
    { configurable: { thread_id: 'example-thread', checkpoint_ns: '' } },
    checkpoint,
    { source: 'input', step: -1, parents: {} },
    {},
  );
  store.recordTurn('example-thread', 'one');
  assert.equal((await sessions.state('example-thread')).state, 'active');
  const locked = store.acquire('example-thread');
  assert.throws(() => store.acquire('example-thread'), AgentError);
  assert.equal(await store.collectExpired(1, Date.now() + 7_200_000), 0);
  locked();
  await store.saver.deleteThread('example-thread');
  assert.equal(
    (await sessions.state('example-thread')).state,
    'checkpoint_missing',
  );
  assert.equal(await store.collectExpired(1, Date.now() + 7_200_000), 1);
  assert.equal((await sessions.state('example-thread')).state, 'not_found');
  store.claimApproval('operation', 'approval-session', 'hash');
  assert.throws(
    () => store.claimApproval('operation', 'approval-session', 'hash'),
    AgentError,
  );
  store.completeApproval('operation');
  await store.deleteThread('approval-session');
  assert.equal(store.approval('operation'), undefined);
  assert.equal(pendingApproval('missing', undefined), undefined);
});
test('session HTTP release removes state and first-turn regeneration creates an empty destination', async (t) => {
  const f = await fixture(t, 'sqlite', [
    { text: 'First answer' },
    { text: 'Fresh answer' },
  ]);
  await f.chat(f.body({ sessionId: 'source', turnId: 'first' }));
  const state = await f.state('source');
  const fork = await f.post('/api/chat/session/fork', {
    sourceSessionId: 'source',
    sourceTurnId: 'first',
    expectedCheckpointId: state.checkpointId,
    newSessionId: 'new',
  });
  assert.equal(fork.status, 200);
  assert.deepEqual(await fork.json(), { data: {} });
  const before = await f.state('new');
  assert.equal(before.state, 'not_found');
  await f.chat(
    f.body({
      sessionId: 'new',
      messages: [{ role: 'user', content: 'Start fresh.' }],
    }),
  );
  assert.doesNotMatch(
    JSON.stringify(f.fake.requests.at(-1)?.messages),
    /First answer/,
  );
  const released = await fetch(`${f.origin}/api/chat/session`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'source' }),
  });
  assert.equal(released.status, 200);
  assert.equal((await f.state('source')).state, 'not_found');
  assert.equal(
    (await fetch(`${f.origin}/api/chat/session?sessionId=invalid%20id`)).status,
    400,
  );
});
test('all pending actions require a decision; a stale or forbidden approval never calls the model', async (t) => {
  const f = await fixture(t, 'sqlite', [
    {
      calls: [
        { name: 'request_form', args: { formKind: 'job_info' } },
        {
          name: 'ask_choice',
          args: { message: 'Direction?', options: ['Improve', 'Create'] },
        },
      ],
    },
    { text: 'Continue with submitted facts.' },
  ]);
  await f.chat(f.body({ sessionId: 'multiple' }));
  const state = await f.state('multiple');
  assert.equal(state.pendingApproval.actions.length, 2);
  const invalid = await f.post('/api/chat/approve', {
    ...f.body(),
    ...state.pendingApproval,
    sessionId: 'multiple',
    decisions: [{ type: 'approve' }, { type: 'reject' }],
  });
  assert.equal(invalid.status, 400);
  assert.equal(f.fake.requests.length, 1);
  const continued = await f.post('/api/chat/approve', {
    ...f.body(),
    ...state.pendingApproval,
    sessionId: 'multiple',
    decisions: [
      { type: 'reject' },
      {
        type: 'edit',
        editedAction: {
          name: 'ask_choice',
          args: {
            ...state.pendingApproval.actions[1].args,
            values: { choice: 'Improve' },
          },
        },
      },
    ],
  });
  assert.equal(continued.status, 200);
  frames(await continued.text());
  assert.match(JSON.stringify(f.fake.requests.at(-1)?.messages), /Improve/);
});

test('proposals made before an interrupt remain available after approval without discarding the paused draft', async (t) => {
  const changed = {
    ...resume,
    info: { ...resume.info, headline: 'Frontend Engineer' },
  };
  const f = await fixture(t, 'sqlite', [
    {
      calls: [
        {
          name: 'write_file',
          args: {
            file_path: '/workspace/resume.json',
            content: JSON.stringify(changed),
          },
        },
      ],
    },
    { calls: [{ name: 'request_form', args: { formKind: 'job_info' } }] },
    { text: 'The existing draft is ready.' },
  ]);
  const pausedEvents = await f.chat(f.body({ sessionId: 'draft-input' }));
  assert.ok(pausedEvents.some((event) => event.type === 'resume_update'));
  const state = await f.state('draft-input');
  const switched = await f.post('/api/chat/approve', {
    ...f.body(),
    ...state.pendingApproval,
    sessionId: 'draft-input',
    agentMode: 'ask',
    decisions: [{ type: 'reject' }],
  });
  assert.equal(switched.status, 409);
  assert.equal((await switched.json()).subCode, 'approval_scope_changed');
  const result = await f.post('/api/chat/approve', {
    ...f.body(),
    ...state.pendingApproval,
    sessionId: 'draft-input',
    decisions: [{ type: 'reject' }],
  });
  assert.equal(result.status, 200);
  const events = frames(await result.text());
  const update = events.find((event) => event.type === 'resume_update');
  assert.ok(update);
  assert.equal(
    (update.payload.resume.info as { headline: string }).headline,
    'Frontend Engineer',
  );
});

test('tool argument recovery precedes native HITL and never trusts model-authored form values', async (t) => {
  const f = await fixture(t, 'sqlite', [
    { calls: [{ name: 'request_form', args: { formKind: 'invalid-form' } }] },
    {
      calls: [
        {
          name: 'request_form',
          args: {
            input: {
              formKind: 'job_info',
              values: { jd: 'Model-invented answer' },
            },
          },
        },
      ],
    },
  ]);
  await f.chat(f.body({ sessionId: 'repaired-form' }));
  assert.equal(f.fake.requests.length, 2);
  const state = await f.state('repaired-form');
  assert.equal(state.state, 'awaiting_input');
  assert.equal(state.pendingApproval.actions[0].args.formKind, 'job_info');
  assert.equal(state.pendingApproval.actions[0].args.values, undefined);
});

test('provider errors are sanitized before main or nested graph failures can reach SQLite', async (t) => {
  const f = await fixture(t, 'sqlite', [
    { status: 401, message: 'Provider echoed example-test-key' },
    { calls: [{ name: 'analyze_resume', args: {} }] },
    { status: 401, message: 'Provider echoed example-test-key' },
  ]);
  const direct = await f.post(
    '/api/chat',
    f.body({ sessionId: 'failed-model' }),
  );
  assert.equal(direct.status, 401);
  assert.doesNotMatch(await direct.text(), /example-test-key|Provider echoed/);
  const nested = await f.chat(f.body({ sessionId: 'failed-insight' }));
  assert.ok(nested.some((event) => event.type === 'error'));
  assert.doesNotMatch(
    JSON.stringify(nested),
    /example-test-key|Provider echoed/,
  );
  await f.restart();
  const database = await readFile(join(f.dataDir, 'checkpoints.sqlite'));
  assert.equal(database.includes(Buffer.from('example-test-key')), false);
});

test('an approval without mode restores both explicit and progressively loaded skill restrictions', async (t) => {
  for (const mode of ['fit', 'general']) {
    const changed = {
      ...resume,
      info: { ...resume.info, headline: 'Proposed headline' },
    };
    const f = await fixture(t, 'sqlite', [
      ...(mode === 'general'
        ? [
            {
              calls: [
                {
                  name: 'read_file',
                  args: { file_path: '/skills/job-fit/SKILL.md' },
                },
              ],
            },
          ]
        : []),
      { calls: [{ name: 'request_form', args: { formKind: 'job_info' } }] },
      {
        calls: [
          {
            name: 'write_file',
            args: {
              file_path: '/workspace/resume.json',
              content: JSON.stringify(changed),
            },
          },
        ],
      },
      { text: 'This skill only evaluates fit.' },
    ]);
    await f.chat(f.body({ sessionId: 'skill-approval', mode }));
    const state = await f.state('skill-approval');
    const continued = await f.post('/api/chat/approve', {
      ...f.body(),
      ...state.pendingApproval,
      sessionId: 'skill-approval',
      decisions: [
        {
          type: 'edit',
          editedAction: {
            name: 'request_form',
            args: {
              ...state.pendingApproval.actions[0].args,
              values: { jd: 'Example role' },
            },
          },
        },
      ],
    });
    assert.equal(continued.status, 200);
    const events = frames(await continued.text());
    assert.ok(
      events.every(
        (event) => !['resume_patch', 'resume_update'].includes(event.type),
      ),
    );
    assert.match(
      JSON.stringify(
        f.fake.requests
          .at(-1)
          ?.messages.filter((message) => message.role === 'tool'),
      ),
      /does not permit write_file/,
    );
  }
});
