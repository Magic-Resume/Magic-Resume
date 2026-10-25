import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';

const milliseconds = (fallback: number) =>
  z.coerce.number().int().positive().max(3_600_000).default(fallback);
const environmentSchema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  AGENT_DATA_DIR: z.string().min(1).default('./data'),
  AGENT_SKILLS_DIR: z
    .string()
    .min(1)
    .default(fileURLToPath(new URL('../skills/', import.meta.url))),
  AGENT_MAX_MODEL_CALLS: z.coerce.number().int().min(1).max(100).default(40),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().positive().max(300).default(60),
  AGENT_IDLE_TIMEOUT_MS: milliseconds(120_000),
  AGENT_RUN_TIMEOUT_MS: milliseconds(900_000),
  AGENT_FIRST_EVENT_WAIT_MS: milliseconds(15_000),
  AGENT_SESSION_TTL_HOURS: z.coerce.number().positive().max(8760).default(168),
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
    dataDir: resolve(data.AGENT_DATA_DIR),
    skillsDir: resolve(data.AGENT_SKILLS_DIR),
    maxModelCalls: data.AGENT_MAX_MODEL_CALLS,
    maxToolCalls: data.AGENT_MAX_TOOL_CALLS,
    idleTimeoutMs: data.AGENT_IDLE_TIMEOUT_MS,
    runTimeoutMs: data.AGENT_RUN_TIMEOUT_MS,
    firstEventWaitMs: data.AGENT_FIRST_EVENT_WAIT_MS,
    sessionTtlHours: data.AGENT_SESSION_TTL_HOURS,
    bodyLimitBytes: data.AGENT_BODY_LIMIT_BYTES,
    privateHostsRequested: data.AGENT_ALLOW_PRIVATE_MODEL_HOSTS === 'true',
    allowPrivateModelHosts:
      data.NODE_ENV !== 'production' &&
      data.AGENT_ALLOW_PRIVATE_MODEL_HOSTS === 'true',
  };
}

export type Settings = ReturnType<typeof readSettings>;
