import assert from 'node:assert/strict';
import { proxySseResponse } from '@/lib/api/streamProxy';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readText(response: Response) {
  assert.ok(response.body);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return decoder.decode(
    chunks.reduce((all, chunk) => {
      const next = new Uint8Array(all.length + chunk.length);
      next.set(all);
      next.set(chunk, all.length);
      return next;
    }, new Uint8Array()),
  );
}

async function main() {
  const upstream = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: delta\ndata: one\n\n'));
        controller.enqueue(encoder.encode('data: two\n\n'));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } },
  );
  const proxied = proxySseResponse(upstream, '[TEST]');
  assert.ok(proxied);
  assert.equal(proxied.headers.get('content-type'), 'text/event-stream');
  assert.equal(
    await readText(proxied),
    'event: delta\ndata: one\n\ndata: two\n\n',
  );

  assert.equal(
    proxySseResponse(
      new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
    ),
    null,
  );
  console.log('API boundary smoke passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
