import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Settings } from '../config.js';
import { parseEditRequest } from '../contracts/edit.js';
import { editSnippet } from '../engine/edit.js';
import { modelError } from '../model/errors.js';
import type { ModelResolver } from '../model/transport.js';
import { requestLifetime } from './lifetime.js';

export function editRoutes(
  app: FastifyInstance,
  settings: Settings,
  resolver?: ModelResolver,
) {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const lifetime = requestLifetime(request, reply, settings.runTimeoutMs);
    try {
      const body = parseEditRequest(request.body);
      return await editSnippet(body, settings, lifetime.signal, resolver);
    } catch (error) {
      const failure = modelError(error, lifetime.signal);
      return reply.code(failure.status).send(failure.payload);
    } finally {
      lifetime.close();
    }
  };
  app.post('/api/agent/edit', handler);
  app.post('/api/chat/edit', handler);
}
