import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Settings } from '../config.js';
import { parseModelConfig } from '../contracts/model-config.js';
import { AgentError } from '../contracts/errors.js';
import { testModel } from '../engine/test-model.js';
import { modelError } from '../model/errors.js';
import type { ModelResolver } from '../model/transport.js';
import { requestLifetime } from './lifetime.js';

const testSchema = z.object({
  provider: z.string().trim().min(1).max(80).optional(),
  apiKey: z.unknown(),
  baseUrl: z.unknown(),
  model: z.unknown(),
});
const messages: Record<string, string> = {
  unauthenticated: 'The model provider rejected the API key.',
  forbidden: 'The API key cannot access this model.',
  quota_exceeded: 'The model provider has no available quota.',
  plan_required:
    'The model provider requires additional access for this model.',
  rate_limited: 'The model provider is temporarily rate limited.',
  misconfigured: 'Check the model name, base URL and connection settings.',
  invalid_input: 'The model provider rejected the connection test.',
};
export function testLlmRoute(
  app: FastifyInstance,
  settings: Settings,
  resolver?: ModelResolver,
) {
  app.post('/api/test-llm', { bodyLimit: 32_768 }, async (request, reply) => {
    // Leave a margin for the Next.js 30-second deadline, including DNS and image probing.
    const lifetime = requestLifetime(
      request,
      reply,
      Math.min(28_000, settings.runTimeoutMs),
    );
    try {
      const parsed = testSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AgentError(400, 'misconfigured', 'model_config_invalid');
      const config = parseModelConfig({
        ...parsed.data,
        modelName: parsed.data.model,
      });
      return await testModel(config, settings, lifetime.signal, resolver);
    } catch (error) {
      const failure = modelError(error, lifetime.signal);
      return reply.code(failure.status).send({
        ok: false,
        ...failure.payload,
        status: failure.status,
        message:
          failure.payload.subCode === 'model_timeout'
            ? 'The model connection test timed out.'
            : (messages[failure.payload.errorCode] ??
              'Could not reach the model provider.'),
      });
    } finally {
      lifetime.close();
    }
  });
}
