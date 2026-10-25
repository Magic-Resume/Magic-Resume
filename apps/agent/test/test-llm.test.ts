import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, waitFor } from './helpers.js';
import { VISION_PROBES } from '../src/engine/test-model.js';

function connectionBody(
  f: Awaited<ReturnType<typeof fixture>>,
  model = 'example-model',
) {
  const { apiKey, baseUrl } = f.body().config;
  return { provider: 'openai-compatible', apiKey, baseUrl, model };
}

test('connection test uses model, makes one small image probe and returns measured latency', async (t) => {
  // Index 2 is the blue square. Models answer in their own casing and
  // punctuation; "Blue." still means blue.
  t.mock.method(Math, 'random', () => 0.9);
  const f = await fixture(t, 'memory', [{ text: 'OK' }, { text: 'Blue.' }]);
  const response = await f.post(
    '/api/test-llm',
    connectionBody(f, 'example-selected-model'),
  );
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.ok, true);
  assert.equal(value.supportsImage, true);
  assert.ok(Number.isInteger(value.latencyMs) && value.latencyMs >= 0);
  assert.equal(f.fake.requests.length, 2);
  assert.equal(f.fake.requests[0].model, 'example-selected-model');
  for (const request of f.fake.requests) {
    assert.equal(request.tools, undefined);
    assert.doesNotMatch(JSON.stringify(request), /example-test-key/);
  }
  const images = f.fake.requests[1].messages.flatMap((message) =>
    Array.isArray(message.content)
      ? message.content.filter((part) => part.type === 'image_url')
      : [],
  );
  assert.equal(images.length, 1);
  assert.equal(
    (images[0].image_url as { url: string }).url,
    VISION_PROBES[2].image,
  );
  for (const probe of VISION_PROBES)
    assert.ok(Buffer.from(probe.image.split(',')[1], 'base64').length < 200);
});

test('a model that names the wrong color does not support images', async (t) => {
  // A text-only provider may drop the image and answer anyway; a guess that
  // misses the randomly chosen color must not count as vision.
  t.mock.method(Math, 'random', () => 0);
  const f = await fixture(t, 'memory', [{ text: 'OK' }, { text: 'BLUE' }]);
  const response = await f.post('/api/test-llm', connectionBody(f));
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.ok, true);
  assert.equal(value.supportsImage, false);
});

test('failed or ignored image input does not fail the text connection', async (t) => {
  const f = await fixture(t, 'memory', [
    { text: 'OK' },
    {
      status: 400,
      code: 'image_unsupported',
      message: 'Images are not supported. example-test-key',
    },
    { text: 'OK' },
    { text: 'UNSUPPORTED' },
  ]);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await f.post('/api/test-llm', connectionBody(f));
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.ok, true);
    assert.equal(value.supportsImage, false);
    assert.doesNotMatch(JSON.stringify(value), /example-test-key/);
  }
  assert.equal(f.fake.requests.length, 4);
});

test('image probe has its own short deadline and text success is retained', async (t) => {
  const f = await fixture(t, 'memory', [{ text: 'OK' }, { hang: true }]);
  const started = performance.now();
  const response = await f.post('/api/test-llm', connectionBody(f));
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.supportsImage, false);
  assert.ok(performance.now() - started < 14_000);
  await waitFor(() => f.fake.state.aborted === 1);
});

for (const [status, code] of [
  [401, 'unauthenticated'],
  [402, 'quota_exceeded'],
  [403, 'forbidden'],
  [404, 'misconfigured'],
  [429, 'rate_limited'],
  [503, 'upstream_unavailable'],
] as const) {
  test(`connection provider ${status} returns a non-2xx fixed message`, async (t) => {
    const f = await fixture(t, 'memory', [
      { status, message: 'example-test-key private provider description' },
    ]);
    const response = await f.post('/api/test-llm', connectionBody(f));
    assert.ok(!response.ok);
    const result = await response.json();
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, code);
    assert.equal(result.status, response.status);
    assert.ok(result.message);
    assert.doesNotMatch(
      JSON.stringify(result),
      /example-test-key|private provider description/,
    );
    assert.equal(f.fake.requests.length, 1);
  });
}

test('connection validation, empty output and redirects fail without probing', async (t) => {
  const f = await fixture(t, 'memory', [{ text: '' }]);
  const missing = await f.post('/api/test-llm', { provider: 'example' });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).ok, false);
  const empty = await f.post('/api/test-llm', connectionBody(f));
  assert.equal(empty.status, 502);
  assert.equal((await empty.json()).subCode, 'model_empty_response');
  const redirected = await f.post(
    '/api/test-llm',
    connectionBody(f, 'redirect'),
  );
  assert.equal(redirected.status, 400);
  assert.equal((await redirected.json()).subCode, 'model_redirect_blocked');
  assert.equal(f.fake.requests.length, 2);
  assert.equal(f.fake.state.unexpected, 0);
});

test(
  'connection test respects the 30-second caller limit even when run timeout is longer',
  { timeout: 35_000 },
  async (t) => {
    const f = await fixture(t, 'memory', [{ hang: true }]);
    const started = performance.now();
    const response = await f.post('/api/test-llm', connectionBody(f));
    const elapsed = performance.now() - started;
    assert.equal(response.status, 504);
    const result = await response.json();
    assert.equal(result.ok, false);
    assert.equal(result.subCode, 'model_timeout');
    assert.ok(elapsed >= 27_000 && elapsed < 30_000, `elapsed ${elapsed} ms`);
    await waitFor(() => f.fake.state.aborted === 1);
  },
);

test('caller cancellation stops a connection test', async (t) => {
  const f = await fixture(t, 'memory', [{ hang: true }]);
  const controller = new AbortController();
  const pending = f.post('/api/test-llm', connectionBody(f), controller.signal);
  await waitFor(() => f.fake.requests.length === 1);
  controller.abort();
  await assert.rejects(pending);
  await waitFor(() => f.fake.state.aborted === 1);
});
