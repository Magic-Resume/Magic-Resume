import { z } from 'zod';
const text = z.string().trim().min(1).max(4000);
const optionalText = z.string().max(4000).optional();
const option = z.union([
  text,
  z.object({
    label: text,
    why: optionalText,
    confidence: z.enum(['high', 'medium', 'low']).optional(),
  }),
]);
export const FORM_KINDS = [
  'job_info',
  'target_language',
  'create_target',
  'create_inventory',
  'create_education',
  'create_experience',
  'create_project',
  'create_skills',
  'analysis_evidence',
] as const;
export const formSchema = z.object({
  formKind: z.enum(FORM_KINDS),
  message: optionalText,
  options: z.record(z.array(text).max(30)).optional(),
  values: z.record(z.string().max(60_000)).optional(),
});
export const choiceSchema = z.object({
  message: text,
  options: z.array(option).min(2).max(6),
  recommended: z.number().int().nonnegative().optional(),
  allowFreeText: z.boolean().optional(),
  values: z.record(z.string().max(4000)).optional(),
});
const researchItem = z.union([
  text,
  z.object({
    text,
    url: z
      .string()
      .url()
      .max(2048)
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      }, 'Research sources must use HTTP(S) links without credentials')
      .optional(),
    sourceName: optionalText,
    date: optionalText,
  }),
]);
const research = z.object({
  title: optionalText,
  summary: optionalText,
  groups: z
    .array(
      z.object({
        key: text,
        title: optionalText,
        items: z.array(researchItem).min(1).max(10),
      }),
    )
    .min(1)
    .max(8),
});
/** All keys mirror the app registry; availability is narrower than rendering compatibility. */
export const WIDGET_SCHEMAS = {
  template_replica: z.object({
    template: z.record(z.unknown()),
    note: z.string().max(200).optional(),
  }),
  company_logo_picker: z.object({
    formKind: z.literal('company_logos'),
    options: z
      .object({ companies: z.array(text).min(1).max(8) })
      .catchall(z.array(z.string())),
    message: optionalText,
  }),
  request_form: formSchema,
  template_gallery: z.object({ message: optionalText }),
  fabrication_notice: z.object({
    items: z.array(text).min(1).max(40),
    title: optionalText,
    body: optionalText,
  }),
  suggestion_rail: z.object({
    message: optionalText,
    options: z.array(option).min(1).max(6),
  }),
  job_research: z.object({
    jobTitle: optionalText,
    title: optionalText,
    message: optionalText,
    groups: z
      .array(
        z.object({
          key: optionalText,
          title: optionalText,
          tone: optionalText,
          items: z.array(researchItem).min(1).max(10),
        }),
      )
      .min(1)
      .max(8),
  }),
  company_research: research,
  interview_prep: research,
  tracker_fields_picker: z.object({}).strict(),
  application_tracker: z.object({
    applications: z
      .array(
        z.object({
          id: text,
          company: z.string(),
          role: z.string(),
          status: z.enum([
            'SAVED',
            'APPLIED',
            'SCREENING',
            'INTERVIEW',
            'OFFER',
            'REJECTED',
            'WITHDRAWN',
          ]),
        }),
      )
      .max(50),
    columns: z.array(z.record(z.unknown())).optional(),
  }),
  ask_choice: choiceSchema,
  ask_choice_recommended: choiceSchema.refine(
    (value) =>
      value.recommended === undefined ||
      value.recommended < value.options.length,
    'Recommended index is outside the option list',
  ),
} as const;
export const PUSHABLE_WIDGETS = [
  'template_gallery',
  'fabrication_notice',
  'suggestion_rail',
  'job_research',
  'company_research',
] as const;
export function validateWidget(kind: string, props: unknown) {
  const schema = WIDGET_SCHEMAS[kind as keyof typeof WIDGET_SCHEMAS];
  return schema?.safeParse(props);
}
