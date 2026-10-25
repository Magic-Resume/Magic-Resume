import type { AgentEvent } from '../contracts/events.js';
import type { AgentMode } from '../harness/prompts/instructions.js';
import { RESUME_PATH, validateResume } from '../harness/workspace/files.js';

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
}
const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const pointer = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');
/** RFC 6902 operations apply to the document object the canvas already owns. */
export function resumeDiff(
  before: unknown,
  after: unknown,
  path = '',
): JsonPatchOperation[] {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const operations: JsonPatchOperation[] = [];
    for (let index = before.length - 1; index >= after.length; index--)
      operations.push({ op: 'remove', path: `${path}/${index}` });
    for (let index = 0; index < Math.min(before.length, after.length); index++)
      operations.push(
        ...resumeDiff(before[index], after[index], `${path}/${index}`),
      );
    for (let index = before.length; index < after.length; index++)
      operations.push({ op: 'add', path: `${path}/-`, value: after[index] });
    return operations;
  }
  if (isObject(before) && isObject(after)) {
    const operations: JsonPatchOperation[] = [];
    for (const key of Object.keys(before))
      if (!Object.hasOwn(after, key))
        operations.push({ op: 'remove', path: `${path}/${pointer(key)}` });
    for (const [key, value] of Object.entries(after))
      operations.push(
        ...(Object.hasOwn(before, key)
          ? resumeDiff(before[key], value, `${path}/${pointer(key)}`)
          : [{ op: 'add' as const, path: `${path}/${pointer(key)}`, value }]),
      );
    return operations;
  }
  return [{ op: 'replace', path, value: after }];
}

export class ResumeAccumulator {
  private latest: Record<string, unknown> | undefined;
  private finalized = false;
  constructor(
    private readonly baseline: Record<string, unknown> | undefined,
    private readonly mode: AgentMode,
  ) {
    this.latest = baseline;
  }
  accept(resume: Record<string, unknown>): AgentEvent[] {
    if (
      this.mode !== 'cocreate' ||
      this.finalized ||
      validateResume(JSON.stringify(resume)).error
    )
      return [];
    const patch = resumeDiff(this.latest ?? {}, resume);
    this.latest = resume;
    if (!patch.length) return [];
    return [
      {
        type: 'resume_patch',
        payload: {
          path: RESUME_PATH,
          patch,
          mutation: { kind: 'patch', authoritative: false, path: RESUME_PATH },
        },
      },
    ];
  }
  finalize(): AgentEvent[] {
    if (this.finalized) return [];
    this.finalized = true;
    if (
      this.mode !== 'cocreate' ||
      !this.latest ||
      !resumeDiff(this.baseline ?? {}, this.latest).length
    )
      return [];
    return [
      {
        type: 'resume_update',
        payload: {
          resume: this.latest,
          final: true,
          mutation: {
            kind: 'snapshot',
            authoritative: true,
            final: true,
            resume: this.latest,
          },
        },
      },
    ];
  }
}
