import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import { ToolMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';
import { RESUME_PATH, toolPath } from '../workspace/files.js';
import { proposedContent } from './resume-json.js';
import { contentText } from './common.js';
export const NAME = 'ResumeVerification';
// Tool results that carry the user's own material: form and choice answers, and
// attachments the user handed over. Facts found there are not new.
const EVIDENCE_TOOLS = new Set([
  'request_form',
  'ask_choice',
  'read_attachment',
]);
const factKeys =
  /company|employer|organization|school|institution|issuer|certificate|date|degree/i;
function collect(
  value: unknown,
  key = '',
  out = new Set<string>(),
): Set<string> {
  if (
    ['id', 'updatedAt', 'created_at', 'modified_at'].includes(
      key.split('.').at(-1) ?? '',
    )
  )
    return out;
  if (typeof value === 'string') {
    if (factKeys.test(key) && value.trim()) out.add(value.trim());
    for (const token of value.match(
      /\b\d+(?:[.,]\d+)*(?:\s?(?:%|years?|months?|million|billion|ms|MB|GB))?(?!\w)|\d+(?:\.\d+)?\s*(?:万|亿|年|月|%)/g,
    ) ?? [])
      out.add(token);
  } else if (Array.isArray(value))
    value.forEach((item) => collect(item, key, out));
  else if (value && typeof value === 'object')
    Object.entries(value).forEach(([field, item]) =>
      collect(item, key ? `${key}.${field}` : field, out),
    );
  return out;
}
export function newFacts(
  baseline: unknown,
  candidate: unknown,
  evidence: string,
): string[] {
  const known =
    JSON.stringify(baseline ?? {})
      .normalize('NFKC')
      .toLowerCase() + evidence.normalize('NFKC').toLowerCase();
  const prior = collect(baseline);
  return [...collect(candidate)]
    .filter(
      (fact) =>
        !prior.has(fact) &&
        !known.includes(fact.normalize('NFKC').toLowerCase()),
    )
    .slice(0, 40);
}
export function createResumeVerification(baseline: unknown) {
  return createMiddleware({
    name: NAME,
    wrapToolCall: async (request, handler) => {
      const content =
        toolPath(request.toolCall.args) === RESUME_PATH
          ? proposedContent(
              request.toolCall.name,
              request.toolCall.args,
              (request.state as { files?: unknown }).files,
            )
          : undefined;
      const result = await handler(request);
      if (
        content === undefined ||
        (ToolMessage.isInstance(result) && result.status === 'error')
      )
        return result;
      const evidence = request.state.messages
        .filter(
          (message) =>
            message.getType() === 'human' ||
            (message.getType() === 'tool' &&
              EVIDENCE_TOOLS.has(message.name ?? '')),
        )
        .map((message) => contentText(message.content))
        .join('\n');
      let candidate: unknown;
      try {
        candidate = JSON.parse(content);
      } catch {
        return result;
      }
      const suspectedFabrications = newFacts(baseline, candidate, evidence);
      if (suspectedFabrications.length) {
        await dispatchCustomEvent('resume_verification', {
          status: 'flagged',
          suspectedFabrications,
        });
        if (ToolMessage.isInstance(result))
          result.content = `${contentText(result.content)}\nUnverified new facts: ${suspectedFabrications.join(', ')}. Confirm their source from user evidence or remove them. Never present them as verified.`;
      }
      return result;
    },
  });
}
