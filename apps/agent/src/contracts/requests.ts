import { resumeSchema, defaultResume } from '@magic-resume-kit/resume-schema';
import { z } from 'zod';
import { parseModelConfig } from './model-config.js';
import { AgentError } from './errors.js';

export const resumeContextSchema = resumeSchema.pick({
  info: true,
  sections: true,
  sectionOrder: true,
  documentLanguage: true,
  documentLanguageSource: true,
});

export const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant', 'ai']),
        content: z.string().max(200_000),
      }),
    )
    .min(1)
    .max(512),
  agentMode: z.enum(['cocreate', 'plan', 'ask']).default('cocreate'),
  currentResume: z.unknown().optional(),
  config: z.unknown(),
  sessionId: z
    .string()
    .regex(/^[A-Za-z0-9._:-]{1,128}$/)
    .optional(),
  turnId: z
    .string()
    .regex(/^[A-Za-z0-9._:-]{1,128}$/)
    .optional(),
  resumeId: z
    .string()
    .regex(/^[A-Za-z0-9._:-]{1,128}$/)
    .optional(),
  mode: z
    .enum([
      'create',
      'optimize',
      'analyze',
      'fit',
      'translate',
      'interview',
      'interview-prep',
      'cover-letter',
      'company-research',
      'job-research',
      'applications',
      'general',
    ])
    .optional(),
  attachments: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        name: z.string().min(1).max(512),
        contentType: z.enum([
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/webp',
        ]),
        sourceUrl: z.string().url().max(8192),
      }),
    )
    .max(3)
    .optional(),
  userSkillId: z.string().optional(),
  userSkillIds: z.array(z.string()).optional(),
  request_type: z.literal('fix_analysis_weakness').optional(),
  context: z.record(z.unknown()).optional(),
});

export function parseChatRequest(value: unknown) {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) {
    throw new AgentError(400, 'invalid_input', 'chat_request_invalid');
  }
  const config = parseModelConfig(parsed.data.config);
  let currentResume: z.infer<typeof resumeContextSchema> | undefined;
  // Ask never validates, serializes or forwards the supplied document.
  if (
    parsed.data.agentMode !== 'ask' &&
    parsed.data.currentResume !== undefined
  ) {
    const resume = resumeContextSchema.safeParse(parsed.data.currentResume);
    if (!resume.success) {
      throw new AgentError(400, 'invalid_input', 'resume_context_invalid');
    }
    const full = resumeSchema.safeParse(parsed.data.currentResume);
    currentResume = full.success
      ? full.data
      : { ...defaultResume, ...resume.data };
  }
  return {
    ...parsed.data,
    config,
    currentResume,
    context: parsed.data.agentMode === 'ask' ? undefined : parsed.data.context,
    resumeId:
      parsed.data.agentMode === 'ask' ? undefined : parsed.data.resumeId,
  };
}

export type ChatRequest = ReturnType<typeof parseChatRequest>;

export const sessionIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
export const decisionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approve') }),
  z.object({
    type: z.literal('reject'),
    message: z.string().max(4000).optional(),
  }),
  z.object({
    type: z.literal('edit'),
    editedAction: z.object({
      name: z.string().min(1),
      args: z.record(z.unknown()),
    }),
  }),
]);
export type Decision = z.infer<typeof decisionSchema>;
const approvalSchema = requestSchema.omit({ messages: true }).extend({
  sessionId: sessionIdSchema,
  interruptId: z.string().min(1).max(256),
  operationId: z.string().regex(/^[a-f0-9]{64}$/),
  expectedCheckpointId: z.string().min(1).max(256),
  decisions: z.array(decisionSchema).min(1).max(20),
});
export function parseApprovalRequest(value: unknown) {
  const parsed = approvalSchema.safeParse(value);
  if (!parsed.success)
    throw new AgentError(400, 'invalid_input', 'approval_request_invalid');
  const context = parseChatRequest({
    ...parsed.data,
    messages: [{ role: 'user', content: '' }],
  });
  return {
    ...context,
    ...parsed.data,
    config: context.config,
    currentResume: context.currentResume,
    resumeId: context.resumeId,
    context: context.context,
  };
}
export type ApprovalRequest = ReturnType<typeof parseApprovalRequest>;
export const forkSchema = z.object({
  sourceSessionId: sessionIdSchema,
  sourceTurnId: sessionIdSchema,
  expectedCheckpointId: z.string().min(1).max(256),
  newSessionId: sessionIdSchema,
});
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AgentError(400, 'invalid_input', 'session_request_invalid');
  return result.data;
}
