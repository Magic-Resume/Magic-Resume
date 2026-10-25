import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TestContext } from 'node:test';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** Ephemeral loopback ports keep tests independent of the running development services. */
export async function fakeBackend(
  t: TestContext,
  respond: (request: RecordedRequest, response: ServerResponse) => void = (_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end('{"ok":true}');
  },
) {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const recorded = {
      method: request.method ?? 'GET',
      url: request.url ?? '/',
      headers: request.headers,
      body: Buffer.concat(chunks),
    };
    requests.push(recorded);
    respond(recorded, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

export function setBackendUrl(t: TestContext, value?: string) {
  const previous = process.env.AI_BACKEND_URL;
  if (value === undefined) delete process.env.AI_BACKEND_URL;
  else process.env.AI_BACKEND_URL = value;
  t.after(() => {
    if (previous === undefined) delete process.env.AI_BACKEND_URL;
    else process.env.AI_BACKEND_URL = previous;
  });
}
