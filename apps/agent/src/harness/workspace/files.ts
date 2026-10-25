import { resumeSchema } from '@magic-resume-kit/resume-schema';
import { posix } from 'node:path';

export const RESUME_PATH = '/workspace/resume.json';
export const SKILLS_MOUNT = '/skills/';
export interface FileData {
  content: string[];
  created_at: string;
  modified_at: string;
}
export function fileData(text: string): FileData {
  const now = new Date().toISOString();
  return { content: text.split('\n'), created_at: now, modified_at: now };
}
export function seedResume(resume: unknown): Record<string, FileData> {
  return resume === undefined
    ? {}
    : { [RESUME_PATH]: fileData(JSON.stringify(resume, null, 2)) };
}
export function readFile(
  files: unknown,
  path = RESUME_PATH,
): string | undefined {
  if (!files || typeof files !== 'object') return undefined;
  const entry = (files as Record<string, FileData | string>)[path];
  if (typeof entry === 'string') return entry;
  return rawContent(entry?.content);
}
export function readResume(
  files: unknown,
): Record<string, unknown> | undefined {
  const text = readFile(files);
  if (text === undefined) return undefined;
  try {
    return validateResume(text).resume;
  } catch {
    return undefined;
  }
}
export function validateResume(
  content: string,
):
  | { resume: Record<string, unknown>; error?: never }
  | { resume?: never; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content, (key, value: unknown) => {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('unsafe_resume_key');
      return value;
    });
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message === 'unsafe_resume_key'
          ? 'Reserved object keys are not allowed in resume JSON.'
          : 'The resume must be complete, valid JSON.',
    };
  }
  const result = resumeSchema.safeParse(parsed);
  if (!result.success)
    return {
      error: result.error.issues
        .slice(0, 12)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; '),
    };
  // Validation must not silently discard fields or replace the browser's source with defaults.
  return { resume: parsed as Record<string, unknown> };
}
export function toolPath(args: Record<string, unknown>): string | undefined {
  const raw = args.file_path ?? args.path ?? args.filePath;
  return typeof raw === 'string' && raw.startsWith('/') && !raw.includes('\0')
    ? normalizePath(raw)
    : undefined;
}
export const isWriteTool = (name: string) =>
  ['write_file', 'edit_file', 'delete_file'].includes(name);
export function applyEdit(
  text: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): string | undefined {
  if (!oldString || !text.includes(oldString)) return undefined;
  if (!replaceAll && text.indexOf(oldString) !== text.lastIndexOf(oldString))
    return undefined;
  return replaceAll
    ? text.split(oldString).join(newString)
    : text.replace(oldString, () => newString);
}

export function rawContent(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.join('\n');
  if (content instanceof Uint8Array) return new TextDecoder().decode(content);
  return undefined;
}

export function normalizePath(path: string): string {
  const normalized = posix.normalize(path);
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
}
