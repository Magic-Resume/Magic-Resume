import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { POST as chat } from './route';
import { POST as approve } from './approve/route';
import { POST as edit } from './edit/route';
import { GET as session, POST as fork, DELETE as release } from './session/route';
import { POST as testLlm } from '../test-llm/route';
import { POST as parsePdf } from '../pdf/parse/route';
import * as passthrough from '../backend/[...path]/route';
import { fakeBackend, setBackendUrl } from '../../../../scripts/test-http-backend';

const config = { provider: 'custom', apiKey: 'example-test-key', baseUrl: 'https://model.example.com/v1', model: 'example-model' };
const jsonRequest = (body: unknown = { messages: [], config }, method = 'POST', url = 'http://web.example/api/chat-agent') =>
  new NextRequest(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer example-browser-token', Cookie: 'example=value' }, body: method === 'GET' ? undefined : JSON.stringify(body) });
const context = { params: Promise.resolve({ path: ['api', 'example'] }) };

const routes = [
  ['chat', chat], ['approve', approve], ['edit', edit], ['session GET', session],
  ['session fork', fork], ['session DELETE', release], ['test-llm', testLlm], ['pdf parse', parsePdf],
  ...(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((method) =>
    [`backend ${method}`, (req: NextRequest) => passthrough[method](req, context)] as const),
] as const;

for (const [name, handler] of routes) {
  test(`${name} reports a missing backend without contacting a server`, async (t) => {
    setBackendUrl(t);
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
    const response = await handler(jsonRequest());
    assert.equal(response.status, 503);
    const body = await response.json();
    if (name === 'test-llm') {
      assert.deepEqual(body, { ok: false, errorCode: 'misconfigured', subCode: 'ai_backend_not_configured', message: 'AI_BACKEND_URL is not configured', status: 503 });
    } else {
      assert.deepEqual(body, { errorCode: 'misconfigured', subCode: 'ai_backend_not_configured', error: 'misconfigured', retryable: false });
    }
    assert.equal(fetch.mock.callCount(), 0);
  });
}

for (const [name, handler, path] of [
  ['chat', chat, '/api/chat'], ['approve', approve, '/api/chat/approve'], ['edit', edit, '/api/agent/edit'],
  ['fork', fork, '/api/chat/session/fork'], ['release', release, '/api/chat/session'],
] as const) {
  test(`${name} forwards its JSON body and keeps browser credentials at the web boundary`, async (t) => {
    const backend = await fakeBackend(t);
    setBackendUrl(t, backend.origin);
    const body = { sessionId: 'example-session', config, decisions: [{ type: 'approve' }], message: '保留中文正文' };
    const request = jsonRequest(body, name === 'release' ? 'DELETE' : 'POST');
    const response = await handler(request);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    const [forwarded] = backend.requests;
    assert.equal(forwarded.url, path);
    assert.equal(forwarded.method, request.method);
    assert.equal(forwarded.body.toString(), JSON.stringify(body));
    assert.equal(forwarded.headers['content-type'], 'application/json');
    assert.equal(forwarded.headers.authorization, undefined);
    assert.equal(forwarded.headers.cookie, undefined);
  });
}

test('session GET validates and encodes sessionId without forwarding unrelated query parameters', async (t) => {
  const backend = await fakeBackend(t);
  setBackendUrl(t, backend.origin);
  const missing = await session(jsonRequest(undefined, 'GET', 'http://web.example/api/chat-agent/session'));
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), { errorCode: 'session_invalid' });
  assert.equal(backend.requests.length, 0);
  const sessionId = 'example session/&?';
  const response = await session(jsonRequest(undefined, 'GET', `http://web.example/api/chat-agent/session?sessionId=${encodeURIComponent(sessionId)}&extra=ignored`));
  await response.text();
  assert.equal(backend.requests[0].url, `/api/chat/session?sessionId=${encodeURIComponent(sessionId)}`);
  assert.equal(backend.requests[0].method, 'GET');
  assert.equal(backend.requests[0].body.length, 0);
});

for (const [name, handler] of [['chat', chat], ['approve', approve], ['pdf parse', parsePdf]] as const) {
  test(`${name} streams SSE bytes and delimiters before the backend finishes`, { timeout: 5000 }, async (t) => {
    let finish: () => void = () => {};
    const prefix = ': heartbeat\r\n\r\nevent: message_chunk\ndata: {"content":"你好"}\n\n';
    const suffix = 'event: done\ndata: {}\n\n';
    const backend = await fakeBackend(t, (_request, response) => {
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.write(prefix);
      finish = () => response.end(suffix);
    });
    setBackendUrl(t, backend.origin);
    const form = new FormData();
    form.set('sourceUrl', 'https://files.example.com/example.pdf');
    const request = name === 'pdf parse' ? new NextRequest('http://web.example/api/pdf/parse', { method: 'POST', body: form }) : jsonRequest();
    const response = await handler(request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    assert.equal(response.headers.get('cache-control'), 'no-cache, no-transform');
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    const reader = response.body!.getReader();
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    // TCP may split a single write anywhere, including inside a UTF-8 character.
    while (receivedBytes < Buffer.byteLength(prefix)) {
      const first = await reader.read();
      assert.equal(first.done, false);
      chunks.push(Buffer.from(first.value!));
      receivedBytes += first.value!.byteLength;
    }
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(prefix));
    finish();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(Buffer.from(chunk.value));
    }
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(prefix + suffix));
    if (name === 'pdf parse') {
      const forwarded = backend.requests[0];
      const parsed = await new Response(forwarded.body, { headers: { 'Content-Type': String(forwarded.headers['content-type']) } }).formData();
      assert.equal(parsed.get('sourceUrl'), 'https://files.example.com/example.pdf');
    }
  });
}

for (const [name, handler] of [['chat', chat], ['approve', approve], ['edit', edit], ['pdf parse', parsePdf]] as const) {
  test(`${name} projects upstream errors without provider diagnostics`, async (t) => {
    t.mock.method(console, 'error', () => {});
    const backend = await fakeBackend(t, (_request, response) => {
      response.writeHead(429, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ errorCode: 'rate_limited', subCode: 'provider_limit', params: { retryAfter: 8 }, requestId: 'example-request', retryable: true, message: 'Example provider diagnostic', stack: 'Example stack', error: 'Example provider exception' }));
    });
    setBackendUrl(t, backend.origin);
    const form = new FormData();
    form.set('sourceUrl', 'https://files.example.com/example.pdf');
    const response = await handler(name === 'pdf parse' ? new NextRequest('http://web.example/api/pdf/parse', { method: 'POST', body: form }) : jsonRequest());
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { errorCode: 'rate_limited', subCode: 'provider_limit', params: { retryAfter: 8 }, requestId: 'example-request', retryable: true, error: 'rate_limited' });
  });
}

for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
  test(`backend ${method} preserves path segments, repeated query values, bytes, status and content type`, async (t) => {
    const backend = await fakeBackend(t, (_request, response) => {
      response.writeHead(418, { 'Content-Type': 'text/plain', 'X-Example': 'private-to-backend' });
      response.end('Example backend response');
    });
    setBackendUrl(t, backend.origin);
    const bytes = new Uint8Array([0, 1, 128, 255]);
    const request = new NextRequest('http://web.example/api/backend/example?tag=a%20b&tag=c', {
      method, body: method === 'GET' ? undefined : bytes,
      headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer example-token', Cookie: 'example=value' },
    });
    const response = await passthrough[method](request, { params: Promise.resolve({ path: ['api', 'example / name', 'item?x'] }) });
    assert.equal(response.status, 418);
    assert.equal(response.headers.get('content-type'), 'text/plain');
    assert.equal(response.headers.get('x-example'), null);
    assert.equal(await response.text(), 'Example backend response');
    const [forwarded] = backend.requests;
    assert.equal(forwarded.url, '/api/example%20%2F%20name/item%3Fx?tag=a%20b&tag=c');
    assert.equal(forwarded.method, method);
    assert.deepEqual(forwarded.body, method === 'GET' ? Buffer.alloc(0) : Buffer.from(bytes));
    assert.equal(forwarded.headers['content-type'], 'application/octet-stream');
    assert.equal(forwarded.headers.authorization, undefined);
    assert.equal(forwarded.headers.cookie, undefined);
  });
}

test('test-llm rejects incomplete configuration and forwards only connection fields', async (t) => {
  const backend = await fakeBackend(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"ok":true,"supportsImage":false,"latencyMs":12}');
  });
  setBackendUrl(t, backend.origin);
  for (const body of [{}, { ...config, apiKey: ' ' }, { ...config, baseUrl: 42 }]) {
    const response = await testLlm(jsonRequest(body));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, message: 'Missing model configuration', status: 400 });
  }
  assert.equal(backend.requests.length, 0);
  const response = await testLlm(jsonRequest({ ...config, ignored: 'extra' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, supportsImage: false, latencyMs: 12 });
  assert.equal(backend.requests[0].url, '/api/test-llm');
  assert.deepEqual(JSON.parse(backend.requests[0].body.toString()), config);
});

test('pdf parse forwards file bytes and model config as multipart', async (t) => {
  const backend = await fakeBackend(t);
  setBackendUrl(t, backend.origin);
  const form = new FormData();
  form.set('file', new File(['Example PDF bytes'], 'example.pdf', { type: 'application/pdf' }));
  form.set('config', JSON.stringify(config));
  const response = await parsePdf(new NextRequest('http://web.example/api/pdf/parse', { method: 'POST', body: form }));
  assert.deepEqual(await response.json(), { ok: true });
  const [forwarded] = backend.requests;
  assert.equal(forwarded.url, '/api/pdf/parse');
  const uploaded = await new Response(forwarded.body, { headers: { 'Content-Type': String(forwarded.headers['content-type']) } }).formData();
  const file = uploaded.get('file') as File;
  assert.equal(file.name, 'example.pdf');
  assert.equal(file.type, 'application/pdf');
  assert.equal(await file.text(), 'Example PDF bytes');
  assert.deepEqual(JSON.parse(String(uploaded.get('config'))), config);
});

test('pdf parse rejects missing, unsupported and oversized inputs before contacting the backend', async (t) => {
  const backend = await fakeBackend(t);
  setBackendUrl(t, backend.origin);
  for (const [file, expectedStatus, error] of [
    [null, 400, 'Missing file'],
    [new File(['example'], 'example.pdf', { type: 'application/zip' }), 415, 'Unsupported file type'],
    [new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'example.pdf', { type: 'application/pdf' }), 413, 'File too large'],
  ] as const) {
    const form = new FormData();
    if (file) form.set('file', file);
    const response = await parsePdf(new NextRequest('http://web.example/api/pdf/parse', { method: 'POST', body: form }));
    assert.equal(response.status, expectedStatus);
    assert.deepEqual(await response.json(), { error });
  }
  const early = await parsePdf(new NextRequest('http://web.example/api/pdf/parse', { method: 'POST', headers: { 'Content-Length': String(12 * 1024 * 1024) } }));
  assert.equal(early.status, 413);
  assert.equal(backend.requests.length, 0);
});

test('chat cancellation reaches a backend request that is still waiting for headers', { timeout: 5000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  let received: () => void = () => {};
  let closed: () => void = () => {};
  const started = new Promise<void>((resolve) => { received = resolve; });
  const disconnected = new Promise<void>((resolve) => { closed = resolve; });
  const backend = await fakeBackend(t, (_request, response) => {
    response.on('close', closed);
    received();
  });
  setBackendUrl(t, backend.origin);
  const controller = new AbortController();
  const response = chat(new NextRequest(jsonRequest(), { signal: controller.signal }));
  await started;
  controller.abort();
  assert.equal((await response).status, 502);
  await disconnected;
});
