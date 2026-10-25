import { createMiddleware } from 'langchain';
import {
  RESUME_PATH,
  applyEdit,
  readFile,
  toolPath,
  validateResume,
} from '../workspace/files.js';
import { denied } from './common.js';
export const NAME = 'ResumeJson';
export function proposedContent(
  name: string,
  args: Record<string, unknown>,
  files: unknown,
): string | undefined {
  if (name === 'write_file')
    return typeof args.content === 'string' ? args.content : undefined;
  if (name !== 'edit_file') return undefined;
  const before = readFile(files);
  return before !== undefined &&
    typeof args.old_string === 'string' &&
    typeof args.new_string === 'string'
    ? applyEdit(
        before,
        args.old_string,
        args.new_string,
        args.replace_all === true,
      )
    : undefined;
}
export function createResumeJson() {
  return createMiddleware({
    name: NAME,
    wrapToolCall: (request, handler) => {
      if (toolPath(request.toolCall.args) !== RESUME_PATH)
        return handler(request);
      if (request.toolCall.name === 'delete_file')
        return denied(
          request.toolCall,
          'A resume proposal cannot delete the source document.',
        );
      if (!['write_file', 'edit_file'].includes(request.toolCall.name))
        return handler(request);
      const content = proposedContent(
        request.toolCall.name,
        request.toolCall.args,
        (request.state as { files?: unknown }).files,
      );
      if (content === undefined)
        return denied(
          request.toolCall,
          'Cannot apply this edit: use an exact, unique old_string from the current file.',
        );
      const result = validateResume(content);
      return result.error
        ? denied(
            request.toolCall,
            `Resume write rejected: ${result.error}. The file was not changed. Correct these fields and retry.`,
          )
        : handler(request);
    },
  });
}
