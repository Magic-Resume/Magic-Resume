import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Sessions } from '../engine/sessions.js';
import {
  forkSchema,
  sessionIdSchema,
  parseInput,
} from '../contracts/requests.js';
const sessionSchema = z.object({ sessionId: sessionIdSchema });
export function sessionRoutes(app: FastifyInstance, sessions: Sessions) {
  app.get('/api/chat/session', async (request) => ({
    data: await sessions.state(
      parseInput(sessionSchema, request.query).sessionId,
    ),
  }));
  app.post('/api/chat/session/fork', async (request) => ({
    data: await sessions.fork(parseInput(forkSchema, request.body)),
  }));
  app.delete('/api/chat/session', async (request) => {
    await sessions.end(parseInput(sessionSchema, request.body).sessionId);
    return { data: { released: true } };
  });
}
