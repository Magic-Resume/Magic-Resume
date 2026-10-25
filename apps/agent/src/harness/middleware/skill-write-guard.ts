import { createMiddleware } from 'langchain';
import { isWriteTool, toolPath } from '../workspace/files.js';
import { denied } from './common.js';
export const NAME = 'SkillWriteGuard';
export function createSkillWriteGuard() {
  return createMiddleware({
    name: NAME,
    wrapToolCall: (request, handler) => {
      const path = toolPath(request.toolCall.args);
      if (
        isWriteTool(request.toolCall.name) &&
        (path === '/skills' || path?.startsWith('/skills/'))
      )
        return denied(
          request.toolCall,
          'The skill mount is read-only. Use the workspace for draft files.',
        );
      return handler(request);
    },
  });
}
