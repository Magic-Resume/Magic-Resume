import { ToolMessage } from '@langchain/core/messages';
export function denied(call: { name: string; id?: string }, reason: string) {
  return new ToolMessage({
    name: call.name,
    tool_call_id: call.id ?? 'invalid-call',
    status: 'error',
    content: reason,
  });
}
export function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) =>
      part && typeof part === 'object' && typeof part.text === 'string'
        ? part.text
        : '',
    )
    .join('');
}
