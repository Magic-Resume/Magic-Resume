import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiBackendNotConfigured, aiBackendUrl, fetchAiBackend } from './backend';
import { fakeBackend, setBackendUrl } from '../../../scripts/test-http-backend';

test('backend configuration is normalized and read per request', (t) => {
  setBackendUrl(t);
  assert.equal(aiBackendUrl(), null);
  process.env.AI_BACKEND_URL = '   ';
  assert.equal(aiBackendUrl(), null);
  process.env.AI_BACKEND_URL = ' https://backend.example.com/base/// ';
  assert.equal(aiBackendUrl(), 'https://backend.example.com/base');
  process.env.AI_BACKEND_URL = 'https://other.example.com';
  assert.equal(aiBackendUrl(), 'https://other.example.com');
});

test('an unconfigured backend has a stable 503 and fetch fails before networking', async (t) => {
  setBackendUrl(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  const response = aiBackendNotConfigured();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    errorCode: 'misconfigured', subCode: 'ai_backend_not_configured', error: 'misconfigured', retryable: false,
  });
  await assert.rejects(fetchAiBackend('/api/chat'), /AI_BACKEND_URL is not set/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('backend fetch forwards JSON, caller headers and queries with caching disabled', async (t) => {
  const backend = await fakeBackend(t);
  setBackendUrl(t, `${backend.origin}/`);
  const realFetch = globalThis.fetch;
  const fetch = t.mock.method(globalThis, 'fetch', realFetch);
  const body = JSON.stringify({ message: 'Example request' });
  await (await fetchAiBackend('/api/chat?tag=a%20b&tag=c', {
    method: 'POST', body, headers: { 'X-Example': 'forwarded' }, cache: 'force-cache',
  })).text();
  const [request] = backend.requests;
  assert.equal(request.url, '/api/chat?tag=a%20b&tag=c');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.headers['x-example'], 'forwarded');
  assert.equal(request.body.toString(), body);
  assert.equal(fetch.mock.calls[0].arguments[1]?.cache, 'no-store');
  await (await fetchAiBackend('/custom', {
    method: 'POST', body: 'plain', headers: { 'Content-Type': 'text/plain' },
  })).text();
  assert.equal(backend.requests[1].headers['content-type'], 'text/plain');
});

test('backend fetch lets multipart choose its boundary and GET has no content type', async (t) => {
  const backend = await fakeBackend(t);
  setBackendUrl(t, backend.origin);
  const form = new FormData();
  form.append('file', new File(['Example content'], 'example.txt', { type: 'text/plain' }));
  await (await fetchAiBackend('/upload', { method: 'POST', body: form })).text();
  const [upload] = backend.requests;
  const parsed = await new Response(upload.body, { headers: { 'Content-Type': String(upload.headers['content-type']) } }).formData();
  assert.match(String(upload.headers['content-type']), /^multipart\/form-data; boundary=/);
  assert.equal(await (parsed.get('file') as File).text(), 'Example content');
  await (await fetchAiBackend('/status')).text();
  assert.equal(backend.requests[1].headers['content-type'], undefined);
});
