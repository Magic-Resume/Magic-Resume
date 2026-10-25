import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { fakeBackend } from '../../../scripts/test-http-backend';
import { AttachmentUploadError, getAttachmentReadUrl, uploadAttachmentToBackend } from './attachmentUpload';

const file = () => new File(['Example PDF bytes'], 'example.pdf', { type: 'application/pdf' });

function useBrowserOrigin(t: TestContext, origin: string) {
  const fetch = globalThis.fetch;
  return t.mock.method(globalThis, 'fetch', (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(typeof input, 'string');
    assert.ok(String(input).startsWith('/api/backend/'));
    return fetch(new URL(String(input), origin), init);
  });
}

test('upload uses the web proxy with multipart bytes and returns only the stored attachment envelope', async (t) => {
  const stored = { key: 'example/file', filename: 'example.pdf', contentType: 'application/pdf' };
  const backend = await fakeBackend(t, (_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ data: stored }));
  });
  const fetch = useBrowserOrigin(t, backend.origin);
  const controller = new AbortController();
  assert.deepEqual(await uploadAttachmentToBackend(file(), controller.signal), stored);
  assert.equal(fetch.mock.calls[0].arguments[1]?.signal, controller.signal);
  const [request] = backend.requests;
  assert.equal(request.method, 'POST');
  assert.equal(request.url, '/api/backend/api/uploads/attachment');
  assert.equal(request.headers.authorization, undefined);
  assert.match(String(request.headers['content-type']), /^multipart\/form-data; boundary=/);
  const form = await new Response(request.body, { headers: { 'Content-Type': String(request.headers['content-type']) } }).formData();
  assert.deepEqual([...form.keys()], ['file']);
  const uploaded = form.get('file') as File;
  assert.equal(uploaded.name, 'example.pdf');
  assert.equal(uploaded.type, 'application/pdf');
  assert.equal(await uploaded.text(), 'Example PDF bytes');
});

test('read URL is requested on demand using only the stored key and returns the URL string', async (t) => {
  const backend = await fakeBackend(t, (_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ data: { url: 'https://files.example.com/example.pdf', expiresAt: '2026-10-26T12:00:00Z' } }));
  });
  const fetch = useBrowserOrigin(t, backend.origin);
  const controller = new AbortController();
  assert.equal(backend.requests.length, 0);
  assert.equal(await getAttachmentReadUrl('example/file', controller.signal), 'https://files.example.com/example.pdf');
  assert.equal(fetch.mock.calls[0].arguments[1]?.signal, controller.signal);
  const [request] = backend.requests;
  assert.equal(request.url, '/api/backend/api/uploads/attachment/read-url');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(request.body.toString()), { key: 'example/file' });
});

for (const status of [413, 500]) {
  test(`upload and read URL requests map HTTP ${status} to a stable attachment error`, async (t) => {
    const backend = await fakeBackend(t, (_request, response) => {
      response.writeHead(status);
      response.end('Example backend diagnostic');
    });
    useBrowserOrigin(t, backend.origin);
    await assert.rejects(uploadAttachmentToBackend(file()), { name: 'Error', message: status === 413 ? 'File too large' : 'Could not upload attachment' });
    await assert.rejects(getAttachmentReadUrl('example/file'), { name: 'Error', message: status === 413 ? 'File too large' : 'Could not prepare attachment upload' });
  });
}

test('missing upload metadata and read URLs are rejected rather than reported ready', async (t) => {
  const backend = await fakeBackend(t, (_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end('{"data":{}}');
  });
  useBrowserOrigin(t, backend.origin);
  await assert.rejects(uploadAttachmentToBackend(file()), { message: 'Could not upload attachment' });
  await assert.rejects(getAttachmentReadUrl('example/file'), { message: 'Could not read attachment' });
});

test('network failures become attachment errors while caller cancellation remains an AbortError', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Example network failure'); });
  await assert.rejects(uploadAttachmentToBackend(file()), AttachmentUploadError);
  await assert.rejects(getAttachmentReadUrl('example/file'), AttachmentUploadError);
  const aborted = new DOMException('Example cancelled request', 'AbortError');
  fetch.mock.mockImplementation(async () => { throw aborted; });
  await assert.rejects(uploadAttachmentToBackend(file()), (error) => error === aborted);
  await assert.rejects(getAttachmentReadUrl('example/file'), (error) => error === aborted);
});
