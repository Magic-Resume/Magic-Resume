import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createEventEncoder } from '../src/sse.js';
import { startFakeModel } from './fake-model.js';
import { fixture, frames, waitFor } from './helpers.js';

test('health and SSE framing retain protocol version and response-scoped sequences', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await (await fetch(`${f.origin}/health`)).json(), {
    ok: true,
  });
  const encode = createEventEncoder('example-run');
  const event = JSON.parse(
    encode({ type: 'message_chunk', content: 'one\n\ndata: two' }).slice(6),
  );
  assert.equal(event.content, 'one\n\ndata: two');
  assert.equal(event.streamSequence, 1);
  assert.equal(JSON.parse(encode({ type: 'done' }).slice(6)).streamSequence, 2);
  const response = await f.post('/api/chat', f.body({ agentMode: 'ask' }));
  assert.match(
    response.headers.get('content-type') ?? '',
    /^text\/event-stream/,
  );
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  assert.equal(
    frames(await response.text())
      .filter((event) => event.type === 'message_chunk')
      .map((event) => ('content' in event ? event.content : ''))
      .join(''),
    'Hello, world!\n你好。',
  );
});

test('maxTokens, effort negotiation and both reasoning fields use the provider protocol', async (t) => {
  const f = await fixture(t);
  const request = f.body({ agentMode: 'ask' });
  await f.chat({
    ...request,
    config: {
      ...request.config,
      modelName: 'unsupported-effort',
      maxTokens: 512,
      effort: 'high',
    },
  });
  assert.equal(f.fake.requests.length, 2);
  assert.equal(f.fake.requests[0].reasoning_effort, 'high');
  assert.equal(f.fake.requests[1].reasoning_effort, undefined);
  assert.equal(f.fake.requests[1].max_tokens, 512);
  for (const modelName of ['reasoning', 'reasoning-alias']) {
    const events = await f.chat({
      ...request,
      config: { ...request.config, modelName },
    });
    assert.equal(
      events
        .filter((event) => event.type === 'reasoning_chunk')
        .map((event) => ('content' in event ? event.content : ''))
        .join(''),
      'Considering the question.',
    );
    assert.ok(events.some((event) => event.type === 'llm_usage'));
  }
  for (const sent of f.fake.requests)
    assert.doesNotMatch(JSON.stringify(sent), /example-test-key/);
  assert.ok(
    f.fake.authorization.every(
      (header) => header === 'Bearer example-test-key',
    ),
  );
});

test('a reasoning reply returns to the model as one string, not one part per streamed chunk', async (t) => {
  const f = await fixture(t, 'memory', [
    { reasoning: 'Weigh the options.', text: ['我先', '看一下', '附件', '。'] },
    { text: 'Done.' },
  ]);
  await f.chat(f.body({ sessionId: 'history' }));
  await f.chat(
    f.body({
      sessionId: 'history',
      messages: [{ role: 'user', content: 'Continue.' }],
    }),
  );
  const replies = f.fake.requests[1].messages.filter(
    (message) => message.role === 'assistant',
  );
  assert.deepEqual(
    replies.map((message) => message.content),
    ['我先看一下附件。'],
  );
});

test('upstream errors before output stay HTTP errors; transient failures alone retry', async (t) => {
  const f = await fixture(t);
  for (const [modelName, status, code] of [
    ['error-401', 401, 'unauthenticated'],
    ['error-402', 402, 'quota_exceeded'],
    ['error-403', 403, 'forbidden'],
    ['error-404', 400, 'misconfigured'],
    ['error-429', 429, 'rate_limited'],
    ['quota', 402, 'quota_exceeded'],
    ['higher-tier', 402, 'plan_required'],
    ['error-503', 502, 'upstream_unavailable'],
    ['redirect', 400, 'misconfigured'],
    ['empty', 502, 'upstream_unavailable'],
  ] as const) {
    const body = f.body();
    const before = f.fake.requests.length;
    const response = await f.post('/api/chat', {
      ...body,
      config: { ...body.config, modelName },
    });
    assert.equal(
      response.status,
      status,
      `${modelName}: ${await response.clone().text()}`,
    );
    const raw = await response.text();
    assert.doesNotMatch(raw, /example-test-key|Provider detail/);
    assert.equal(JSON.parse(raw).errorCode, code);
    assert.equal(
      f.fake.requests.length - before,
      ['error-429', 'error-503'].includes(modelName) ? 2 : 1,
      modelName,
    );
  }
  assert.equal(f.fake.state.unexpected, 0);
});

test('pre-token retry succeeds, whereas a partial stream is never replayed and ends error then done', async (t) => {
  const f = await fixture(t, 'memory', [
    { status: 503 },
    { text: 'Recovered before any token' },
    { text: 'Partial answer', disconnect: true },
  ]);
  const recovered = await f.chat();
  assert.ok(
    recovered.some(
      (event) =>
        event.type === 'message_chunk' && event.content.includes('Recovered'),
    ),
  );
  const events = await f.chat();
  assert.equal(f.fake.requests.length, 3);
  assert.equal(events.at(-2)?.type, 'error');
  assert.equal(events.at(-1)?.type, 'done');
});

test('the first-event buffer opens at its deadline and classifies subsequent failures as SSE', async (t) => {
  const f = await fixture(t, 'memory', [{ beforeMs: 400, status: 401 }], {
    AGENT_FIRST_EVENT_WAIT_MS: '50',
  });
  const start = Date.now();
  const response = await f.post('/api/chat', f.body());
  assert.equal(response.status, 200);
  assert.ok(Date.now() - start < 350);
  const events = frames(await response.text());
  const error = events.find((event) => event.type === 'error');
  assert.equal(error?.payload.errorCode, 'unauthenticated');
});

test('idle timeout resets for each upstream data chunk while the whole-run cap remains independent', async (t) => {
  const f = await fixture(
    t,
    'memory',
    [{ text: ['a', 'b', 'c', 'd', 'e', 'f'], intervalMs: 60 }, { hang: true }],
    { AGENT_IDLE_TIMEOUT_MS: '250', AGENT_FIRST_EVENT_WAIT_MS: '2000' },
  );
  const events = await f.chat();
  assert.equal(
    events
      .filter((event) => event.type === 'message_chunk')
      .map((event) => ('content' in event ? event.content : ''))
      .join(''),
    'abcdef',
  );
  assert.ok(events.every((event) => event.type !== 'error'));
  const response = await f.post('/api/chat', f.body());
  assert.equal(response.status, 504);
  assert.equal((await response.json()).subCode, 'model_timeout');
  const capped = await fixture(
    t,
    'memory',
    [{ text: 'Streaming', hang: true, intervalMs: 30 }],
    { AGENT_IDLE_TIMEOUT_MS: '250', AGENT_RUN_TIMEOUT_MS: '400' },
  );
  const cappedEvents = await capped.chat();
  assert.equal(cappedEvents.at(-2)?.type, 'error');
});

test('no-session runs do not expose input tools, and invalid configuration or input stays JSON', async (t) => {
  const f = await fixture(t);
  await f.chat();
  const names =
    f.fake.requests[0].tools?.map((tool) => tool.function.name) ?? [];
  assert.ok(!names.includes('request_form'));
  assert.ok(!names.includes('ask_choice'));
  assert.ok(names.includes('write_todos'));
  const response = await f.post('/api/chat', {
    messages: [{ role: 'user', content: 'Hi' }],
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).subCode, 'model_config_invalid');
  const malformed = await fetch(`${f.origin}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{example-test-key',
  });
  assert.equal(malformed.status, 400);
  assert.doesNotMatch(await malformed.text(), /example-test-key/);
  const strict = await fixture(t, 'memory', [], {
    NODE_ENV: 'production',
    AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true',
    AGENT_BODY_LIMIT_BYTES: '1024',
  });
  const blocked = await strict.post(
    '/api/chat',
    strict.body({ currentResume: undefined }),
  );
  assert.equal(blocked.status, 400);
  assert.equal((await blocked.json()).subCode, 'model_host_blocked');
  const oversized = await strict.post(
    '/api/chat',
    strict.body({ extra: 'x'.repeat(3000) }),
  );
  assert.equal(oversized.status, 413);
});

test('requests beyond the per-address limit get a contract 429 while health checks stay open', async (t) => {
  const f = await fixture(t, 'memory', [], {
    AGENT_RATE_LIMIT_PER_MINUTE: '2',
  });
  const session = () =>
    fetch(`${f.origin}/api/chat/session?sessionId=example-session`);
  assert.equal((await session()).status, 200);
  assert.equal((await session()).status, 200);
  const limited = await session();
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), {
    errorCode: 'rate_limited',
    subCode: 'agent_rate_limited',
    retryable: true,
  });
  for (let i = 0; i < 3; i++)
    assert.equal((await fetch(`${f.origin}/health`)).status, 200);
  const unlimited = await fixture(t, 'memory', [], {
    AGENT_RATE_LIMIT_PER_MINUTE: '0',
  });
  for (let i = 0; i < 4; i++)
    assert.equal(
      (
        await fetch(
          `${unlimited.origin}/api/chat/session?sessionId=example-session`,
        )
      ).status,
      200,
    );
});

test('disconnect before the first model byte cancels upstream without opening SSE', async (t) => {
  const f = await fixture(t, 'memory', [{ hang: true }]);
  const controller = new AbortController();
  const pending = f.post('/api/chat', f.body(), controller.signal);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await waitFor(() => f.fake.requests.length === 1);
  controller.abort();
  await rejected;
  await waitFor(() => f.fake.state.aborted === 1);
});
test('service startup disables inherited diagnostics so request keys never enter logs or traces', async (t) => {
  const fake = await startFakeModel();
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      fileURLToPath(new URL('../src/index.ts', import.meta.url)),
    ],
    {
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '0',
        NODE_ENV: 'development',
        AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true',
        SEARCH_PROVIDER: 'tavily',
        SEARCH_API_KEY: 'example-search-secret',
        AGENT_ATTACHMENT_SECRET: 'example-attachment-signing-secret-0001',
        LANGSMITH_TRACING: 'true',
        LANGCHAIN_TRACING_V2: 'true',
        LANGCHAIN_TRACING: 'true',
        LANGCHAIN_VERBOSE: 'true',
        OPENAI_LOG: 'debug',
        LANGSMITH_ENDPOINT: fake.baseUrl,
        LANGSMITH_API_KEY: 'example-tracing-key',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk;
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk;
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'exit', { signal: AbortSignal.timeout(5000) });
      child.kill('SIGTERM');
      await closed.catch(() => {
        child.kill('SIGKILL');
      });
    }
    await fake.close();
  });
  await waitFor(() => logs.includes('Server listening at'));
  const origin = /Server listening at (http:\/\/127\.0\.0\.1:\d+)/.exec(
    logs,
  )?.[1];
  assert.ok(origin);
  const response = await fetch(`${origin}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Hello' }],
      config: {
        apiKey: 'example-test-key',
        baseUrl: fake.baseUrl,
        modelName: 'error-401',
      },
    }),
  });
  assert.equal(response.status, 401);
  await response.json();
  assert.doesNotMatch(logs, /example-test-key|Provider detail/);
  assert.match(logs, /Web search enabled \(tavily\)/);
  assert.doesNotMatch(
    logs,
    /example-search-secret|example-attachment-signing-secret/,
  );
  assert.equal(fake.state.unexpected, 0, 'no diagnostic HTTP requests');
});
