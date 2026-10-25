import { randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import { readSettings, type Settings } from './config.js';
import { AgentError, modelError } from './errors.js';
import { createModelTransport, type ModelResolver } from './model-fetch.js';
import { streamChatModel } from './model.js';
import { parseChatRequest } from './request.js';
import { openEventStream } from './sse.js';

interface ServerOptions {
  settings?: Settings;
  resolver?: ModelResolver;
  logger?: boolean;
}

export function buildServer({
  settings = readSettings(),
  resolver,
  logger = false,
}: ServerOptions = {}) {
  const app = Fastify({
    logger,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: settings.bodyLimitBytes,
    forceCloseConnections: true,
  });
  if (settings.privateHostsRequested && !settings.allowPrivateModelHosts) {
    app.log.warn('AGENT_ALLOW_PRIVATE_MODEL_HOSTS is ignored in production');
  }

  // Framework errors can contain submitted data, so return only authored codes.
  app.setErrorHandler((error, _request, reply) => {
    const known = error instanceof AgentError ? error : undefined;
    const errorStatus =
      error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined;
    const status =
      known?.status ??
      (typeof errorStatus === 'number' && errorStatus < 500
        ? errorStatus
        : 500);
    return reply.code(status).send(
      known?.payload ?? {
        errorCode: status < 500 ? 'invalid_input' : 'internal_error',
        subCode:
          status === 413
            ? 'request_too_large'
            : status < 500
              ? 'request_invalid'
              : 'request_failed',
        retryable: false,
      },
    );
  });

  app.get('/health', async () => ({ ok: true }));

  app.post('/api/chat', async (request, reply) => {
    const disconnected = new AbortController();
    const signal = AbortSignal.any([
      disconnected.signal,
      AbortSignal.timeout(settings.modelTimeoutMs),
    ]);
    const onDisconnect = () => {
      if (!reply.raw.writableFinished) disconnected.abort();
    };
    request.raw.once('aborted', onDisconnect);
    reply.raw.once('close', onDisconnect);
    let transport: Awaited<ReturnType<typeof createModelTransport>> | undefined;
    let stream: ReturnType<typeof streamChatModel> | undefined;
    let send: ReturnType<typeof openEventStream> | undefined;
    try {
      const body = parseChatRequest(request.body);
      transport = await createModelTransport(
        body.config.baseUrl,
        settings.allowPrivateModelHosts,
        signal,
        resolver,
      );
      stream = streamChatModel(body, transport.fetch, signal);
      // The first read catches provider HTTP/configuration failures before committing SSE headers.
      const first = await stream.next();
      signal.throwIfAborted();
      reply.hijack();
      send = openEventStream(reply.raw, randomUUID(), disconnected.signal);
      await send({ type: 'run_started' });
      if (!first.done) await send(first.value);
      for await (const event of stream) await send(event);
      await send({ type: 'done' });
    } catch (error) {
      if (disconnected.signal.aborted) return;
      const failure = modelError(error, signal);
      if (send) {
        await send({ type: 'error', payload: failure.payload }).catch(() => {});
      } else {
        return reply.code(failure.status).send(failure.payload);
      }
    } finally {
      disconnected.abort();
      await transport?.close();
      await stream?.return(undefined);
      request.raw.removeListener('aborted', onDisconnect);
      reply.raw.removeListener('close', onDisconnect);
      if (send && !reply.raw.destroyed) reply.raw.end();
    }
  });
  return app;
}
