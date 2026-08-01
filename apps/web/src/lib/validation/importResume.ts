import { z, type ZodError } from 'zod';
import { nanoid } from 'nanoid';
import { normalizeResumeSectionOrder } from '@/lib/utils/resumeSectionOrder';

const importedResumeInfoSchema = z.object({
  fullName: z.string().default(''),
  headline: z.string().default(''),
  email: z.string().default(''),
  phoneNumber: z.string().default(''),
  address: z.string().default(''),
  website: z.string().default(''),
  avatar: z.string().default(''),
});

const importedResumeSectionItemSchema = z
  .object({
    id: z.string(),
    visible: z.boolean().default(true),
    company: z.string().nullable().default(null),
    position: z.string().nullable().default(null),
    date: z.string().nullable().default(null),
    location: z.string().nullable().default(null),
    website: z.string().nullable().default(null),
    summary: z.string().nullable().default(null),
    name: z.string().nullable().default(null),
    role: z.string().nullable().default(null),
    link: z.string().nullable().default(null),
    school: z.string().nullable().default(null),
    degree: z.string().nullable().default(null),
    major: z.string().nullable().default(null),
    level: z.string().nullable().default(null),
    language: z.string().nullable().default(null),
    issuer: z.string().nullable().default(null),
    platform: z.string().nullable().default(null),
    url: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
  })
  .passthrough();

const importedResumeSectionOrderItemSchema = z.object({
  key: z.string(),
  label: z.string(),
});

const importedResumeSectionsSchema = z
  .object({
    experience: z.array(importedResumeSectionItemSchema).default([]),
    education: z.array(importedResumeSectionItemSchema).default([]),
    projects: z.array(importedResumeSectionItemSchema).default([]),
    skills: z.array(importedResumeSectionItemSchema).default([]),
    languages: z.array(importedResumeSectionItemSchema).default([]),
    certificates: z.array(importedResumeSectionItemSchema).default([]),
  })
  .passthrough();

export const importedResumeSchema = z.object({
  info: importedResumeInfoSchema,
  sections: importedResumeSectionsSchema,
  sectionOrder: z.array(importedResumeSectionOrderItemSchema).default([]),
});

export type ImportedResume = z.infer<typeof importedResumeSchema> & Record<string, unknown>;

/**
 * Give every imported item the same kind of id the app mints for itself.
 *
 * An imported id is whatever the source said — for a PDF that is whatever the
 * model wrote, and the model copies the prompt's example, so real resumes
 * arrived full of `skill-1` / `exp-1`. Those are not the app's ids (it uses
 * `nanoid()` in `SectionListWithModal`), and nothing anywhere deduplicated
 * them: a model that numbers two sections from 1, or repeats itself, produces
 * colliding React keys and a drag-and-drop list that reorders the wrong row.
 *
 * Reissuing here rather than in the backend normalizer puts it on the one path
 * both imports share — PDF and JSON — and makes the guarantee independent of
 * whatever produced the file.
 */
function reissueItemIds(
  sections: Record<string, Array<Record<string, unknown>>>,
): Record<string, Array<Record<string, unknown>>> {
  return Object.fromEntries(
    Object.entries(sections).map(([key, items]) => [
      key,
      (items ?? []).map((item) => ({ ...item, id: nanoid() })),
    ]),
  );
}

export function validateAndNormalizeImportedResume(data: unknown): ImportedResume {
  const parsed = importedResumeSchema.parse(data);
  const raw = { ...(data as Record<string, unknown>) };

  delete raw.isPublic;
  delete raw.shareId;
  delete raw.shareRole;

  const sections = reissueItemIds(
    parsed.sections as Record<string, Array<Record<string, unknown>>>,
  );

  return {
    ...raw,
    info: parsed.info,
    sections: sections as typeof parsed.sections,
    sectionOrder: normalizeResumeSectionOrder(parsed.sectionOrder, sections),
  };
}

export function formatResumeImportValidationError(error: ZodError): string {
  const issues = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  return `Invalid resume format: ${issues}`;
}

export function formatResumeImportError(error: unknown, fallbackMessage: string): string {
  if (error instanceof z.ZodError) {
    return formatResumeImportValidationError(error);
  }

  return error instanceof Error ? error.message : fallbackMessage;
}
