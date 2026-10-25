import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export interface ModelRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  reasoning_effort?: string;
  max_tokens?: number;
  tools?: unknown;
  [key: string]: unknown;
}

export async function startFakeModel(port = 0) {
  const requests: ModelRequest[] = [];
  const hosts: string[] = [];
  const state = { aborted: 0, unexpected: 0 };
  const server = createServer(async (request, response) => {
    if (request.url !== '/v1/chat/completions') {
      state.unexpected += 1;
      response.writeHead(404).end();
      return;
    }
    let raw = '';
    for await (const part of request) raw += part;
    const body = JSON.parse(raw) as ModelRequest;
    requests.push(body);
    hosts.push(request.headers.host ?? '');
    response.once('close', () => {
      if (!response.writableEnded) state.aborted += 1;
    });

    const reject = (
      status: number,
      code: string,
      message: string,
      param?: string,
    ) => {
      response
        .writeHead(status, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: { code, message, param } }));
    };
    const status = /^error-(\d+)$/.exec(body.model)?.[1];
    if (status) {
      reject(
        Number(status),
        `status_${status}`,
        'Provider detail: example-test-key',
      );
      return;
    }
    if (body.model === 'quota') {
      reject(429, 'insufficient_quota', 'Provider detail: example-test-key');
      return;
    }
    if (body.model === 'higher-tier') {
      reject(
        403,
        'model_access_restricted',
        'This model requires a higher tier. example-test-key',
      );
      return;
    }
    if (body.model === 'unsupported-effort' && body.reasoning_effort) {
      reject(
        400,
        'unsupported_parameter',
        'reasoning_effort is not supported',
        'reasoning_effort',
      );
      return;
    }
    if (body.model === 'redirect') {
      response.writeHead(307, { Location: '/should-never-be-requested' }).end();
      return;
    }
    if (body.model === 'hang') return;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const delta = (
      value: Record<string, unknown>,
      finish: string | null = null,
    ) => {
      response.write(
        `data: ${JSON.stringify({
          id: 'example-completion',
          object: 'chat.completion.chunk',
          created: 1,
          model: body.model,
          choices: [{ index: 0, delta: value, finish_reason: finish }],
        })}\n\n`,
      );
    };
    delta({ role: 'assistant', content: '' });
    if (body.model === 'reasoning')
      delta({ reasoning_content: 'Considering the question.' });
    if (body.model === 'reasoning-alias')
      delta({ reasoning: 'Considering the question.' });
    if (body.model === 'slow' || body.model === 'late-timeout') {
      delta({ content: 'First chunk' });
      if (body.model === 'slow') {
        const timer = setInterval(
          () => delta({ content: ' another chunk' }),
          30,
        );
        response.once('close', () => clearInterval(timer));
      }
      return;
    }
    if (body.model === 'late-error') {
      delta({ content: 'Before failure' });
      const timer = setTimeout(() => {
        response.end(
          `data: ${JSON.stringify({
            error: {
              code: 'upstream_failed',
              message: 'Provider detail: example-test-key',
            },
          })}\n\n`,
        );
      }, 30);
      response.once('close', () => clearTimeout(timer));
      return;
    }
    if (body.model !== 'empty') {
      const firstUser = body.messages.find(
        (message) => message.role === 'user',
      );
      const lastUser = body.messages.at(-1);
      const parts =
        lastUser?.content === 'What did I say?'
          ? ['You said: ', firstUser?.content ?? '']
          : ['Hello', ', ', 'world!\n你好。'];
      for (const text of parts) delta({ content: text });
    }
    delta({}, 'stop');
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test listener');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    hosts,
    state,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

// Reuse the same fixture for a manual curl check; no real provider credentials are needed.
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const fake = await startFakeModel(
    Number(process.env.FAKE_MODEL_PORT ?? 4100),
  );
  console.log(`Fake model listening at ${fake.baseUrl}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void fake.close();
    });
  }
}
