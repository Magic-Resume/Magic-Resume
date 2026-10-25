import { resumeSchema } from '@magic-resume-kit/resume-schema';
import { z } from 'zod';
import { parseModelConfig } from './config.js';
import { AgentError } from './errors.js';

const resumeContextSchema = resumeSchema.pick({
  info: true,
  sections: true,
  sectionOrder: true,
  documentLanguage: true,
  documentLanguageSource: true,
});

const requestSchema = z.object({
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
  sessionId: z.string().max(256).optional(),
  turnId: z.string().max(256).optional(),
  resumeId: z.string().max(256).optional(),
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
      'applications',
      'general',
    ])
    .optional(),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        contentType: z.string(),
        sourceUrl: z.string(),
      }),
    )
    .max(20)
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
    currentResume = resume.data;
  }
  return {
    ...parsed.data,
    config,
    currentResume,
    resumeId:
      parsed.data.agentMode === 'ask' ? undefined : parsed.data.resumeId,
  };
}

export type ChatRequest = ReturnType<typeof parseChatRequest>;
