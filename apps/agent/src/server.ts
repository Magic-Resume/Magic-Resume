import Fastify, { LogController } from 'fastify';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { readSettings, type Settings } from './config.js';
import { AgentError } from './contracts/errors.js';
import type { ModelResolver } from './model/transport.js';
import { RunEngine } from './engine/run.js';
import { Persistence } from './persistence/store.js';
import { chatRoute } from './http/chat.route.js';
import { approveRoute } from './http/approve.route.js';
import { sessionRoutes } from './http/session.route.js';
import { editRoutes } from './http/edit.route.js';
import { pdfRoute } from './http/pdf.route.js';
import { testLlmRoute } from './http/test-llm.route.js';

interface ServerOptions {
  settings?: Settings;
  resolver?: ModelResolver;
  logger?: boolean;
  checkpointer?: BaseCheckpointSaver;
}
export function buildServer({
  settings = readSettings(),
  resolver,
  logger = false,
  checkpointer,
}: ServerOptions = {}) {
  // Request bodies and provider failures contain private documents and keys.
  for (const variable of [
    'LANGSMITH_TRACING',
    'LANGCHAIN_TRACING_V2',
    'LANGCHAIN_TRACING',
    'LANGCHAIN_VERBOSE',
  ])
    delete process.env[variable];
  const app = Fastify({
    logger,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: settings.bodyLimitBytes,
    forceCloseConnections: true,
  });
  const persistence = new Persistence(settings.dataDir, checkpointer);
  const engine = new RunEngine(settings, persistence, resolver);
  if (settings.privateHostsRequested && !settings.allowPrivateModelHosts)
    app.log.warn('AGENT_ALLOW_PRIVATE_MODEL_HOSTS is ignored in production');
  app.setErrorHandler((error, _request, reply) => {
    const known = error instanceof AgentError ? error : undefined;
    const candidate =
      error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined;
    const status =
      known?.status ??
      (typeof candidate === 'number' && candidate < 500 ? candidate : 500);
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
  const sweep = setInterval(
    () => {
      void persistence
        .collectExpired(settings.sessionTtlHours)
        .catch(() => app.log.warn('Expired sessions could not be collected'));
    },
    Math.min(3_600_000, settings.sessionTtlHours * 3_600_000),
  );
  sweep.unref();
  app.addHook('onReady', async () => {
    await persistence.collectExpired(settings.sessionTtlHours);
  });
  app.addHook('onClose', async () => {
    clearInterval(sweep);
    persistence.close();
  });
  app.get('/health', async () => ({ ok: true }));
  chatRoute(app, engine);
  approveRoute(app, engine);
  sessionRoutes(app, engine.sessions);
  editRoutes(app, settings, resolver);
  pdfRoute(app, settings, resolver);
  testLlmRoute(app, settings, resolver);
  return app;
}
