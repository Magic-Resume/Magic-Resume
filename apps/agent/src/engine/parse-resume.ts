import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import {
  defaultResume,
  resumeJsonSchema,
  resumeSchema,
} from '@magic-resume-kit/resume-schema';
import type { Settings } from '../config.js';
import type { AgentEvent, EventSink } from '../contracts/events.js';
import { AgentError } from '../contracts/errors.js';
import type { DocumentFile } from '../document/input.js';
import { extractDocument } from '../document/extract.js';
import { parseJsonOutput, type createDirectModel } from '../model/direct.js';
import { stripTags } from '../text.js';

export function importProgress(
  phase: 'extracting' | 'analyzing',
  extra: Record<string, unknown> = {},
): AgentEvent {
  return {
    type: 'tool_result',
    payload: { kind: 'pdf_progress', phase, ...extra },
  };
}
const fieldNames = new Set([
  'info',
  'experience',
  'education',
  'projects',
  'skills',
  'languages',
  'certificates',
]);
function hasContent(resume: typeof resumeSchema._output) {
  return (
    Object.entries(resume.info).some(
      ([key, value]) =>
        key !== 'avatar' && typeof value === 'string' && value.trim(),
    ) ||
    Object.values(resume.sections).some((items) =>
      items.some((item) =>
        Object.entries(item).some(
          ([key, value]) =>
            key !== 'id' &&
            typeof value === 'string' &&
            stripTags(value).trim(),
        ),
      ),
    )
  );
}
export async function parseResumeDocument(
  file: DocumentFile,
  model: Awaited<ReturnType<typeof createDirectModel>>,
  settings: Settings,
  signal: AbortSignal,
  emit: EventSink,
) {
  await emit(importProgress('extracting'));
  const source = await extractDocument(file, signal);
  signal.throwIfAborted();
  const vision =
    source.kind === 'images'
      ? { mode: 'vision', pageCount: source.pageCount }
      : {};
  await emit(
    importProgress('analyzing', { charCount: 0, fields: [], ...vision }),
  );
  const skill = await readFile(
    join(settings.skillsDir, 'resume-parse/SKILL.md'),
    'utf8',
  );
  const messages: BaseMessage[] = [
    new SystemMessage(
      [
        skill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''),
        'The public resume JSON schema is:',
        JSON.stringify(resumeJsonSchema),
        'Empty structural example (all personal facts are blank):',
        JSON.stringify(defaultResume),
      ].join('\n\n'),
    ),
    new HumanMessage({
      content:
        source.kind === 'text'
          ? `Extract this document as resume JSON. Document data:\n${source.text}`
          : [
              {
                type: 'text',
                text: `Extract the resume visible in these ${source.pageCount} ordered page images. Do not infer any fact you cannot read.`,
              },
              ...source.images.map((url) => ({
                type: 'image_url' as const,
                image_url: { url, detail: 'high' },
              })),
            ],
    }),
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    let lastCount = 0;
    let lastTime = 0;
    const seen = new Set<string>();
    const text = await model.generate(messages, async (content) => {
      const fields = [
        ...content.matchAll(
          /(?<!\\)"(info|experience|education|projects|skills|languages|certificates)"\s*:/g,
        ),
      ]
        .map((match) => match[1])
        .filter((field) => fieldNames.has(field) && !seen.has(field));
      const unique = [...new Set(fields)];
      unique.forEach((field) => seen.add(field));
      const now = Date.now();
      if (
        !unique.length &&
        (content.length - lastCount < 200 || now - lastTime < 250)
      )
        return;
      lastCount = content.length;
      lastTime = now;
      await emit(
        importProgress('analyzing', {
          charCount: content.length,
          fields: unique,
          ...vision,
        }),
      );
    });
    signal.throwIfAborted();
    let candidate: unknown;
    try {
      candidate = parseJsonOutput(text);
    } catch {
      /* The model receives a structural error below. */
    }
    const result = resumeSchema.safeParse(candidate);
    if (result.success && hasContent(result.data)) {
      await emit(
        importProgress('analyzing', {
          charCount: text.length,
          fields: ['info', ...Object.keys(result.data.sections)].filter((key) =>
            fieldNames.has(key),
          ),
          ...vision,
        }),
      );
      return result.data;
    }
    if (attempt === 2)
      throw new AgentError(422, 'invalid_input', 'resume_parse_invalid');
    const errors = !result.success
      ? result.error.issues.slice(0, 20).map((issue) => ({
          path: issue.path.join('.') || '(root)',
          code: issue.code,
          message: issue.message,
        }))
      : [
          {
            path: '(root)',
            code: 'empty_resume',
            message:
              'No source facts were extracted. Read the source; never invent facts.',
          },
        ];
    messages.push(
      new AIMessage(text),
      new HumanMessage(
        `Repair the previous JSON using the same source and schema. Return only the complete corrected JSON. Field errors: ${JSON.stringify(errors)}`,
      ),
    );
  }
  throw new AgentError(422, 'invalid_input', 'resume_parse_invalid');
}
