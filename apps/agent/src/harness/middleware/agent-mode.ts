import { SystemMessage } from '@langchain/core/messages';
import { createMiddleware, type BuiltInState } from 'langchain';
import { MODE_CONTRACTS, type AgentMode } from '../prompts/instructions.js';
import { RESUME_PATH, isWriteTool, toolPath } from '../workspace/files.js';
import { denied } from './common.js';
export const NAME = 'AgentMode';
const resumeTools = new Set([
  'read_resume',
  'analyze_resume',
  'evaluate_fit',
  'explain_changes',
]);
export function createAgentMode(mode: AgentMode) {
  return createMiddleware({
    name: NAME,
    beforeAgent: () => {
      if (mode !== 'ask') return;
      // Native summaries use private channels excluded from graph input.
      // Clear them in a graph node before they can restore resume context.
      const reset: Partial<BuiltInState> & Record<string, unknown> = {
        _summarizationEvent: undefined,
        _summarizationSessionId: undefined,
      };
      return reset;
    },
    wrapModelCall: (request, handler) => {
      const base = (
        request.systemMessage ?? new SystemMessage(request.systemPrompt ?? '')
      ).content;
      const blocks =
        typeof base === 'string'
          ? [{ type: 'text' as const, text: base }]
          : base;
      const remaining = blocks.filter(
        (block) =>
          !(
            block.type === 'text' &&
            typeof block.text === 'string' &&
            block.text.startsWith('\n\nPermission boundary:')
          ),
      );
      return handler({
        ...request,
        tools: request.tools.filter((tool) => {
          const name = 'name' in tool ? tool.name : '';
          return (
            !(
              mode === 'ask' &&
              (resumeTools.has(String(name)) || name === 'task')
            ) && !(mode === 'plan' && name === 'explain_changes')
          );
        }),
        systemMessage: new SystemMessage([
          ...remaining,
          {
            type: 'text',
            text: `\n\nPermission boundary: ${MODE_CONTRACTS[mode]}`,
          },
        ]),
      });
    },
    wrapToolCall: (request, handler) => {
      const name = request.toolCall.name;
      const path = toolPath(request.toolCall.args);
      if (
        name === 'delete_file' &&
        (path === '/' || path === '/workspace' || path === RESUME_PATH)
      )
        return denied(request.toolCall, 'The resume source cannot be deleted.');
      if (
        mode === 'ask' &&
        (resumeTools.has(name) || name === 'task' || path === RESUME_PATH)
      )
        return denied(
          request.toolCall,
          'General question mode has no resume access.',
        );
      if (
        mode !== 'cocreate' &&
        ((isWriteTool(name) && path === RESUME_PATH) ||
          name === 'explain_changes')
      )
        return denied(
          request.toolCall,
          'The current mode permits reading and planning only; no resume write was executed.',
        );
      return handler(request);
    },
  });
}
