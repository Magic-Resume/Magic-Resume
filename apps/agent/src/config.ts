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

const environmentSchema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  AGENT_MODEL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3_600_000)
    .default(120_000),
  AGENT_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(33_554_432)
    .default(2_097_152),
  AGENT_ALLOW_PRIVATE_MODEL_HOSTS: z.enum(['true', 'false']).default('false'),
});

export function readSettings(env: NodeJS.ProcessEnv = process.env) {
  const result = environmentSchema.safeParse(env);
  if (!result.success)
    throw new Error('Invalid agent environment configuration');
  const data = result.data;
  return {
    host: data.HOST,
    port: data.PORT,
    modelTimeoutMs: data.AGENT_MODEL_TIMEOUT_MS,
    bodyLimitBytes: data.AGENT_BODY_LIMIT_BYTES,
    privateHostsRequested: data.AGENT_ALLOW_PRIVATE_MODEL_HOSTS === 'true',
    allowPrivateModelHosts:
      data.NODE_ENV !== 'production' &&
      data.AGENT_ALLOW_PRIVATE_MODEL_HOSTS === 'true',
  };
}

export type Settings = ReturnType<typeof readSettings>;
