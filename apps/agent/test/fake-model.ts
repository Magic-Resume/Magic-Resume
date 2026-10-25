import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export interface ModelRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: Array<{
      id: string;
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
  reasoning_effort?: string;
  max_tokens?: number;
  tools?: Array<{ function: { name: string } }>;
  stream?: boolean;
  tool_choice?: string;
  [key: string]: unknown;
}
export interface Script {
  text?: string | string[];
  reasoning?: string;
  reasoningKey?: 'reasoning' | 'reasoning_content';
  calls?: Array<{ name: string; args: unknown; id?: string }>;
  status?: number;
  code?: string;
  message?: string;
  beforeMs?: number;
  intervalMs?: number;
  hang?: boolean;
  disconnect?: boolean;
}
function orphaned(messages: ModelRequest['messages']) {
  const pending = new Set<string>();
  for (const message of messages) {
    if (pending.size && message.role !== 'tool') return true;
    if (message.role === 'assistant')
      for (const call of message.tool_calls ?? []) pending.add(call.id);
    if (message.role === 'tool') pending.delete(message.tool_call_id ?? '');
  }
  return pending.size > 0;
}
export async function startFakeModel(port = 0, initialScripts: Script[] = []) {
  const scripts = [...initialScripts];
  const requests: ModelRequest[] = [];
  const hosts: string[] = [];
  const authorization: Array<string | undefined> = [];
  const state = { aborted: 0, unexpected: 0, invalidHistory: 0 };
  const server = createServer(async (request, response) => {
    if (request.url !== '/v1/chat/completions') {
      state.unexpected++;
      response.writeHead(404).end();
      return;
    }
    let raw = '';
    for await (const part of request) raw += part;
    const body = JSON.parse(raw) as ModelRequest;
    requests.push(body);
    const requestIndex = requests.length;
    const completionId = `example-completion-${requestIndex}`;
    hosts.push(request.headers.host ?? '');
    authorization.push(request.headers.authorization);
    response.once('close', () => {
      if (!response.writableEnded) state.aborted++;
    });
    const reject = (
      status: number,
      code: string,
      message: string,
      param?: string,
    ) =>
      response
        .writeHead(status, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: { code, message, param } }));
    if (orphaned(body.messages)) {
      state.invalidHistory++;
      reject(400, 'invalid_tool_history', 'Missing tool response');
      return;
    }
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
    const script =
      scripts.shift() ??
      (body.model === 'hang'
        ? { hang: true }
        : body.model === 'slow' || body.model === 'late-timeout'
          ? {
              text: 'First chunk',
              hang: true,
              intervalMs: body.model === 'slow' ? 30 : undefined,
            }
          : body.model === 'late-error'
            ? { text: 'Before failure', disconnect: true }
            : body.model === 'empty'
              ? { text: '' }
              : {
                  text: ['Hello', ', ', 'world!\n你好。'],
                  ...(body.model.startsWith('reasoning')
                    ? {
                        reasoning: 'Considering the question.',
                        reasoningKey:
                          body.model === 'reasoning-alias'
                            ? ('reasoning' as const)
                            : ('reasoning_content' as const),
                      }
                    : {}),
                });
    if (script.beforeMs) await delay(script.beforeMs);
    if (response.destroyed) return;
    if (script.status) {
      reject(
        script.status,
        script.code ?? 'upstream_failure',
        script.message ?? 'Provider detail: example-test-key',
      );
      return;
    }
    if (script.hang && !script.text && !script.calls) return;
    if (body.stream === false) {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          id: completionId,
          object: 'chat.completion',
          model: body.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: script.text ?? '',
                tool_calls: script.calls?.map((call, index) => ({
                  id: call.id ?? `call-${requestIndex}-${index}`,
                  type: 'function',
                  function: {
                    name: call.name,
                    arguments: JSON.stringify(call.args),
                  },
                })),
              },
              finish_reason: script.calls ? 'tool_calls' : 'stop',
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 8,
            total_tokens: 20,
          },
        }),
      );
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const delta = (
      value: Record<string, unknown>,
      finish: string | null = null,
    ) =>
      response.write(
        `data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: value, finish_reason: finish }] })}\n\n`,
      );
    delta({ role: 'assistant', content: '' });
    if (script.reasoning)
      delta({ [script.reasoningKey ?? 'reasoning_content']: script.reasoning });
    for (const content of typeof script.text === 'string'
      ? [script.text]
      : (script.text ?? [])) {
      if (script.intervalMs) await delay(script.intervalMs);
      if (response.destroyed) return;
      if (content) delta({ content });
    }
    if (script.calls) {
      for (const [index, call] of script.calls.entries()) {
        const args = JSON.stringify(call.args);
        const middle = Math.ceil(args.length / 2);
        delta({
          tool_calls: [
            {
              index,
              id: call.id ?? `call-${requestIndex}-${index}`,
              type: 'function',
              function: { name: call.name, arguments: args.slice(0, middle) },
            },
          ],
        });
        delta({
          tool_calls: [{ index, function: { arguments: args.slice(middle) } }],
        });
      }
    }
    if (script.disconnect) {
      const timer = setTimeout(() => response.destroy(), 20);
      response.once('close', () => clearTimeout(timer));
      return;
    }
    if (script.hang) {
      if (script.intervalMs) {
        const timer = setInterval(
          () => delta({ content: ' another chunk' }),
          script.intervalMs,
        );
        response.once('close', () => clearInterval(timer));
      }
      return;
    }
    delta({}, script.calls ? 'tool_calls' : 'stop');
    response.write(
      `data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', model: body.model, choices: [], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } })}\n\n`,
    );
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
    scripts,
    requests,
    hosts,
    authorization,
    state,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const fake = await startFakeModel(
    Number(process.env.FAKE_MODEL_PORT ?? 4100),
  );
  console.log(`Fake model listening at ${fake.baseUrl}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void fake.close();
    });
}
