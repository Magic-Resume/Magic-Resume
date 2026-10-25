import { z } from 'zod';
import { AgentError } from './errors.js';

export const modelConfigSchema = z.object({
  source: z.literal('byok').default('byok'),
  apiKey: z
    .string()
    .trim()
    .min(1)
    .max(8192)
    .regex(/^[^\r\n]+$/),
  baseUrl: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .url()
    .refine((raw) => {
      try {
        const url = new URL(raw);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    })
    .transform((raw) => raw.replace(/\/+$/, '')),
  modelName: z.string().trim().min(1).max(256),
  maxTokens: z.number().int().positive().max(1_048_576).optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;

export function parseModelConfig(value: unknown): ModelConfig {
  const result = modelConfigSchema.safeParse(value);
  if (!result.success) {
    throw new AgentError(400, 'misconfigured', 'model_config_invalid');
  }
  return result.data;
}
