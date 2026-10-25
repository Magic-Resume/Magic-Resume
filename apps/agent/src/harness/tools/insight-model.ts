import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';
import type { AgentChatModel } from '../../model/factory.js';
import type { RunBudget } from '../middleware/run-budget.js';
import { withModelRetry } from '../middleware/model-resilience.js';
import { contentText } from '../middleware/common.js';
export class InsightError extends Error {}
export type InsightInvoker = <T>(
  prompt: string,
  schema: z.ZodType<T>,
  config?: RunnableConfig,
) => Promise<T>;
export function createInsightInvoker(
  model: AgentChatModel,
  budget: RunBudget,
): InsightInvoker {
  return async (prompt, schema, config) => {
    if (!budget.claimInternal())
      throw new InsightError(
        'The shared processing budget is exhausted; report the unfinished assessment.',
      );
    const result = await withModelRetry(
      () =>
        model.invoke(prompt, {
          ...config,
          tags: [...(config?.tags ?? []), 'agent:insight'],
        }),
      { signal: config?.signal, emitted: () => model.emitted },
    );
    const text = contentText(result.content)
      .trim()
      .replace(/^```(?:json)?\s*|\s*```$/g, '');
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new InsightError(
        'The assessment returned invalid JSON. Retry a concise structured assessment.',
      );
    }
    const validated = schema.safeParse(value);
    if (!validated.success)
      throw new InsightError(
        `The assessment has invalid fields: ${validated.error.issues
          .slice(0, 6)
          .map((issue) => issue.path.join('.'))
          .join(', ')}.`,
      );
    return validated.data;
  };
}
