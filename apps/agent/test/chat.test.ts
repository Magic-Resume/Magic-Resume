import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { defaultResume } from '@magic-resume-kit/resume-schema';
import { readSettings } from '../src/config.js';
import { buildServer } from '../src/server.js';
import { createEventEncoder } from '../src/sse.js';
import { startFakeModel } from './fake-model.js';

interface Frame {
  protocolVersion: number;
  streamSequence: number;
  runId: string;
  type: string;
  content?: string;
  payload?: { errorCode?: string; subCode?: string; retryable?: boolean };
}

function frames(text: string, terminal = 'done'): Frame[] {
  const events = text
    .trim()
    .split('\n\n')
    .map((frame) => {
      assert.ok(frame.startsWith('data: '), frame);
      assert.equal(frame.split('\n').length, 1, 'one JSON object per frame');
      return JSON.parse(frame.slice(6)) as Frame;
    });
  assert.equal(events[0].type, 'run_started');
  assert.equal(events.at(-1)?.type, terminal);
  events.forEach((event, index) => {
    assert.equal(event.protocolVersion, 1);
    assert.equal(event.streamSequence, index + 1);
    assert.equal(event.runId, events[0].runId);
  });
  return events;
}

async function fixture(t: TestContext, env: NodeJS.ProcessEnv = {}) {
  const fake = await startFakeModel();
  const app = buildServer({
    settings: readSettings({
      NODE_ENV: 'test',
      AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true',
      ...env,
    }),
  });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(async () => {
    await app.close();
    await fake.close();
  });
  const body = (model = 'example-model') => ({
    messages: [{ role: 'user', content: 'Hello' }],
    agentMode: 'ask',
    config: {
      apiKey: 'example-test-key',
      baseUrl: fake.baseUrl,
      modelName: model,
    },
  });
  const chat = (value: unknown, signal?: AbortSignal) =>
    fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
      signal,
    });
  return { app, fake, body, chat, origin };
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'expected state before timeout');
    await delay(10);
  }
}

test('SSE encoder escapes content and scopes its sequence to each response', () => {
  const encode = createEventEncoder('example-run');
  const first = JSON.parse(
    encode({ type: 'message_chunk', content: 'one\n\ndata: two' }).slice(6),
  );
  assert.equal(first.content, 'one\n\ndata: two');
  assert.equal(first.protocolVersion, 1);
  assert.equal(first.streamSequence, 1);
  assert.equal(JSON.parse(encode({ type: 'done' }).slice(6)).streamSequence, 2);
  assert.equal(
    JSON.parse(createEventEncoder('next-run')({ type: 'done' }).slice(6))
      .streamSequence,
    1,
  );
});

test('health, streaming text deltas and a second turn using the supplied history', async (t) => {
  const { origin, body, chat, fake } = await fixture(t);
  assert.deepEqual(await (await fetch(`${origin}/health`)).json(), {
    ok: true,
  });
  const first = await chat({ ...body(), sessionId: 'example-session' });
  assert.equal(first.status, 200);
  assert.match(first.headers.get('content-type') ?? '', /^text\/event-stream/);
  assert.equal(first.headers.get('x-accel-buffering'), 'no');
  assert.match(first.headers.get('cache-control') ?? '', /no-transform/);
  const events = frames(await first.text());
  const chunks = events.filter((event) => event.type === 'message_chunk');
  assert.equal(chunks.length, 3);
  assert.equal(
    chunks.map((event) => event.content).join(''),
    'Hello, world!\n你好。',
  );
  const second = await chat({
    ...body(),
    sessionId: 'example-session',
    messages: [
      { role: 'user', content: 'My name is Alex.' },
      { role: 'ai', content: 'Hello, Alex.' },
      { role: 'user', content: 'What did I say?' },
    ],
  });
  assert.equal(
    frames(await second.text())
      .filter((event) => event.type === 'message_chunk')
      .map((event) => event.content)
      .join(''),
    'You said: My name is Alex.',
  );
  assert.deepEqual(fake.requests[1].messages.slice(1), [
    { role: 'user', content: 'My name is Alex.' },
    { role: 'assistant', content: 'Hello, Alex.' },
    { role: 'user', content: 'What did I say?' },
  ]);
  for (const request of fake.requests) {
    assert.equal(request.tools, undefined);
    assert.equal(JSON.stringify(request).includes('example-test-key'), false);
  }
});

test('resume-aware modes use the shared snapshot schema while Ask ignores even malformed context', async (t) => {
  const { body, chat, fake } = await fixture(t);
  const resume = {
    ...defaultResume,
    info: { ...defaultResume.info, fullName: 'Alex Chen' },
    documentLanguage: 'en',
  };
  for (const agentMode of ['cocreate', 'plan']) {
    const response = await chat({
      ...body(),
      agentMode,
      currentResume: resume,
    });
    assert.equal(response.status, 200);
    frames(await response.text());
    const prompt = JSON.stringify(
      fake.requests.at(-1)?.messages[0].content ?? '',
    );
    assert.match(prompt, /read-only/i);
    assert.match(prompt, /Alex Chen/);
    assert.match(prompt, /documentLanguage/);
    assert.match(
      prompt,
      agentMode === 'plan' ? /outline a plan/ : /suggest wording/,
    );
  }
  const response = await chat({
    ...body(),
    currentResume: { privateExample: 'do-not-forward' },
    resumeId: 'example-resume-do-not-forward',
    userSkillIds: ['ignored-example'],
    attachments: [
      {
        id: 'example',
        name: 'example.txt',
        contentType: 'text/plain',
        sourceUrl: 'http://localhost/ignored-example',
      },
    ],
  });
  frames(await response.text());
  const sent = JSON.stringify(fake.requests.at(-1));
  assert.doesNotMatch(sent, /do-not-forward|ignored-example/);
  assert.match(sent, /no access to the user's resume/);
});

test('passes maxTokens and effort, retries an unsupported effort once and streams reasoning deltas', async (t) => {
  const { body, chat, fake } = await fixture(t);
  const request = body('unsupported-effort');
  const response = await chat({
    ...request,
    config: { ...request.config, maxTokens: 512, effort: 'high' },
  });
  assert.equal(response.status, 200);
  frames(await response.text());
  assert.equal(fake.requests.length, 2);
  assert.equal(fake.requests[0].reasoning_effort, 'high');
  assert.equal(fake.requests[1].reasoning_effort, undefined);
  assert.equal(fake.requests[1].max_tokens, 512);
  for (const model of ['reasoning', 'reasoning-alias', 'gpt-5-example']) {
    const result = await chat(body(model));
    const events = frames(await result.text());
    if (model !== 'gpt-5-example') {
      assert.equal(
        events
          .filter((event) => event.type === 'reasoning_chunk')
          .map((event) => event.content)
          .join(''),
        'Considering the question.',
      );
    }
  }
});

test('provider errors map to fixed frontend codes before streaming without provider text', async (t) => {
  const { body, chat, fake } = await fixture(t);
  for (const [model, status, errorCode, subCode, retryable] of [
    ['error-401', 401, 'unauthenticated', 'model_key_invalid', false],
    ['error-402', 402, 'quota_exceeded', 'model_quota_exceeded', false],
    ['error-429', 429, 'rate_limited', 'model_rate_limited', true],
    ['quota', 402, 'quota_exceeded', 'model_quota_exceeded', false],
    ['higher-tier', 402, 'plan_required', 'model_access_required', false],
    [
      'error-404',
      400,
      'misconfigured',
      'model_endpoint_or_name_invalid',
      false,
    ],
    ['error-503', 502, 'upstream_unavailable', 'model_unavailable', true],
    ['redirect', 400, 'misconfigured', 'model_redirect_blocked', false],
    ['empty', 502, 'upstream_unavailable', 'model_response_empty', true],
  ] as const) {
    const response = await chat(body(model));
    assert.equal(response.status, status, model);
    assert.match(
      response.headers.get('content-type') ?? '',
      /application\/json/,
    );
    assert.deepEqual(
      await response.json(),
      { errorCode, subCode, retryable },
      model,
    );
  }
  assert.equal(fake.requests.length, 9, 'no automatic provider retry');
  assert.equal(fake.state.unexpected, 0, 'redirect never followed');
});

test('invalid config, malformed JSON, oversized bodies and production private hosts fail before SSE', async (t) => {
  const { body, chat, origin, fake } = await fixture(t, {
    NODE_ENV: 'production',
    AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true',
    AGENT_BODY_LIMIT_BYTES: '1024',
  });
  const missing = await chat({
    messages: [{ role: 'user', content: 'Hello' }],
  });
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), {
    errorCode: 'misconfigured',
    subCode: 'model_config_invalid',
    retryable: false,
  });
  const blocked = await chat(body());
  assert.equal(blocked.status, 400);
  assert.equal((await blocked.json()).subCode, 'model_host_blocked');
  const malformed = await fetch(`${origin}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{example-test-key',
  });
  assert.equal(malformed.status, 400);
  assert.doesNotMatch(await malformed.text(), /example-test-key/);
  const oversized = await chat({ ...body(), example: 'x'.repeat(2048) });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).subCode, 'request_too_large');
  assert.equal(fake.requests.length, 0);
});

test('errors after the first chunk use an error frame and end with consecutive sequence numbers', async (t) => {
  const { body, chat } = await fixture(t);
  const response = await chat(body('late-error'));
  assert.equal(response.status, 200);
  const raw = await response.text();
  assert.doesNotMatch(raw, /example-test-key|Provider detail/);
  const events = frames(raw, 'error');
  assert.ok(events.some((event) => event.type === 'message_chunk'));
  assert.equal(events.at(-1)?.payload?.errorCode, 'upstream_unavailable');
  assert.equal(
    events.some((event) => event.type === 'done'),
    false,
  );
});

test('timeouts before and after the first chunk have distinct HTTP and SSE envelopes', async (t) => {
  const { body, chat, fake } = await fixture(t, {
    AGENT_MODEL_TIMEOUT_MS: '800',
  });
  const before = await chat(body('hang'));
  assert.equal(before.status, 504);
  assert.deepEqual(await before.json(), {
    errorCode: 'upstream_unavailable',
    subCode: 'model_timeout',
    retryable: true,
  });
  const after = await chat(body('late-timeout'));
  assert.equal(after.status, 200);
  assert.deepEqual(frames(await after.text(), 'error').at(-1)?.payload, {
    errorCode: 'upstream_unavailable',
    subCode: 'model_timeout',
    retryable: true,
  });
  await waitFor(() => fake.state.aborted === 2);
});

test('client reader cancellation and AbortSignal cancellation both abort the upstream socket', async (t) => {
  const { body, chat, fake } = await fixture(t);
  for (const kind of ['reader', 'signal']) {
    const controller = new AbortController();
    const response = await chat(body('slow'), controller.signal);
    const reader = response.body!.getReader();
    let raw = '';
    while (!raw.includes('message_chunk')) {
      const { value, done } = await reader.read();
      assert.equal(done, false);
      raw += new TextDecoder().decode(value);
    }
    if (kind === 'reader') await reader.cancel();
    else {
      controller.abort();
      await reader.cancel().catch(() => {});
    }
    const expected = kind === 'reader' ? 1 : 2;
    await waitFor(() => fake.state.aborted === expected);
  }
});

test('disconnect while waiting for the first provider byte also aborts upstream', async (t) => {
  const { body, chat, fake } = await fixture(t);
  const controller = new AbortController();
  const response = chat(body('hang'), controller.signal);
  const rejected = assert.rejects(response, { name: 'AbortError' });
  await waitFor(() => fake.requests.length === 1);
  controller.abort();
  await rejected;
  await waitFor(() => fake.state.aborted === 1);
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
  assert.equal(fake.state.unexpected, 0, 'no diagnostic HTTP requests');
});
