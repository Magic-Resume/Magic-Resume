import Fastify, { LogController } from 'fastify';
import rateLimit from '@fastify/rate-limit';
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
import { AttachmentStore } from './attachments/store.js';
import { uploadsRoutes } from './http/uploads.route.js';

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
  const attachments = new AttachmentStore(settings);
  const engine = new RunEngine(settings, persistence, resolver, attachments);
  app.log.info(
    settings.search
      ? `Web search enabled (${settings.search.provider})`
      : 'Web search disabled: configuration is absent or incomplete',
  );
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
  const attachmentSweep = setInterval(
    () => {
      void attachments
        .collectExpired()
        .catch(() =>
          app.log.warn('Expired attachments could not be collected'),
        );
    },
    Math.min(3_600_000, settings.attachmentTtlHours * 3_600_000),
  );
  attachmentSweep.unref();
  app.addHook('onReady', async () => {
    await persistence.collectExpired(settings.sessionTtlHours);
    await attachments.collectExpired();
  });
  app.addHook('onClose', async () => {
    clearInterval(sweep);
    clearInterval(attachmentSweep);
    persistence.close();
  });
  // The agent has no accounts. A per-address limit keeps one client from
  // filling the disk or the model budget if the port is ever exposed.
  if (settings.rateLimitPerMinute > 0)
    void app.register(rateLimit, {
      max: settings.rateLimitPerMinute,
      timeWindow: '1 minute',
      errorResponseBuilder: () =>
        new AgentError(429, 'rate_limited', 'agent_rate_limited'),
    });
  // Routes load after the limiter, so its onRoute hook covers every one of them.
  void app.register(async (routes) => {
    routes.get('/health', { config: { rateLimit: false } }, async () => ({
      ok: true,
    }));
    chatRoute(routes, engine);
    approveRoute(routes, engine);
    sessionRoutes(routes, engine.sessions);
    editRoutes(routes, settings, resolver);
    pdfRoute(routes, settings, resolver);
    testLlmRoute(routes, settings, resolver);
    uploadsRoutes(routes, settings, attachments);
  });
  return app;
}
