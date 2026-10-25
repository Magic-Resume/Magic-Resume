import { z } from 'zod';
import { AgentError } from './errors.js';
import { parseModelConfig } from './model-config.js';

const editSchema = z
  .object({
    action: z.enum([
      'polish',
      'shorten',
      'translate',
      'quantify',
      'concise',
      'verb',
      'evidence',
      'rewrite',
      'tone',
      'insert',
      'free',
    ]),
    before: z.string().max(100_000),
    resumePath: z.string().max(2048).optional(),
    selectionText: z.string().min(1).max(50_000).optional(),
    instruction: z.string().max(10_000).optional(),
    lang: z.string().trim().min(1).max(100).optional(),
    locale: z.string().trim().min(1).max(35).default('zh'),
    config: z.unknown(),
  })
  .superRefine((body, ctx) => {
    if (body.action !== 'insert' && !body.before.trim())
      ctx.addIssue({
        code: 'custom',
        path: ['before'],
        message: 'Source text is required',
      });
    if (body.selectionText && !body.before.includes(body.selectionText))
      ctx.addIssue({
        code: 'custom',
        path: ['selectionText'],
        message: 'Selection must occur in source',
      });
    if (body.action === 'translate' && !body.lang && !body.instruction?.trim())
      ctx.addIssue({
        code: 'custom',
        path: ['lang'],
        message: 'Target language is required',
      });
    if (body.action === 'insert' && !body.instruction?.trim())
      ctx.addIssue({
        code: 'custom',
        path: ['instruction'],
        message: 'Source facts are required for insertion',
      });
  });
export function parseEditRequest(value: unknown) {
  const result = editSchema.safeParse(value);
  if (!result.success)
    throw new AgentError(400, 'invalid_input', 'edit_request_invalid');
  return { ...result.data, config: parseModelConfig(result.data.config) };
}
export type EditRequest = ReturnType<typeof parseEditRequest>;
