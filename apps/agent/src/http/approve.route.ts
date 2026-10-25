import type { FastifyInstance } from 'fastify';
import type { RunEngine } from '../engine/run.js';
import { parseApprovalRequest } from '../contracts/requests.js';
import { streamRun } from './stream.js';
export function approveRoute(app: FastifyInstance, engine: RunEngine) {
  app.post('/api/chat/approve', async (request, reply) => {
    const body = parseApprovalRequest(request.body);
    if (body.userSkillId || body.userSkillIds?.length)
      app.log.warn(
        'User-defined skills are not supported; the selection was ignored',
      );
    return streamRun(engine, body, request, reply);
  });
}
