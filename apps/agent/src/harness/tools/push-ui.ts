import { randomUUID } from 'node:crypto';
import { tool } from 'langchain';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import { z } from 'zod';
import { PUSHABLE_WIDGETS, validateWidget } from './widgets.js';
export function createPushUi() {
  const cards = new Map<
    string,
    { kind: string; props: Record<string, unknown> }
  >();
  return tool(
    async ({ kind, props, widgetId, merge }, config) => {
      if (!(PUSHABLE_WIDGETS as readonly string[]).includes(kind))
        return `Card unavailable for non-blocking pushes. Supported kinds: ${PUSHABLE_WIDGETS.join(', ')}. Use the input tools for blocking questions.`;
      const id = widgetId ?? randomUUID();
      const previous = cards.get(id);
      if (merge && (!previous || previous.kind !== kind))
        return 'A merge requires an existing card of the same kind and widgetId.';
      const candidate = merge ? { ...previous?.props, ...props } : props;
      const validation = validateWidget(kind, candidate);
      if (!validation?.success)
        return `Card rejected: ${validation?.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') ?? 'unknown kind'}. Correct its props and retry.`;
      const complete = validation.data as Record<string, unknown>;
      cards.set(id, { kind, props: complete });
      await dispatchCustomEvent(
        'ui_widget',
        { kind, props: complete, widgetId: id, merge: false },
        config,
      );
      return 'Card displayed. Continue the task; no response is required for this card.';
    },
    {
      name: 'push_ui',
      description:
        'Display a non-blocking card. kind: suggestion_rail {message?,options:string[]}, fabrication_notice {items:string[]}, template_gallery {message?}, job_research {jobTitle?,groups:[{key?,title?,items:string[]}]}, company_research {title?,summary?,groups:[{key,title?,items:[{text,url?}]}]}. Never invent research or sources.',
      schema: z.object({
        kind: z.string().min(1),
        props: z.record(z.unknown()),
        widgetId: z.string().max(128).optional(),
        merge: z.boolean().optional(),
      }),
    },
  );
}
