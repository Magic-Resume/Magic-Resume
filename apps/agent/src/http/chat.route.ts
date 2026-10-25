import type { FastifyInstance } from 'fastify';
import type { RunEngine } from '../engine/run.js';
import { parseChatRequest } from '../contracts/requests.js';
import { streamRun } from './stream.js';
export function chatRoute(app: FastifyInstance, engine: RunEngine) {
  app.post('/api/chat', async (request, reply) => {
    const body = parseChatRequest(request.body);
    if (body.userSkillId || body.userSkillIds?.length)
      app.log.warn(
        'User-defined skills are not supported; the selection was ignored',
      );
    return streamRun(engine, body, request, reply);
  });
}
