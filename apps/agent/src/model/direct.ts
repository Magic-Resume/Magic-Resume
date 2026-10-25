import type { BaseMessage } from '@langchain/core/messages';
import type { Settings } from '../config.js';
import type { ModelConfig } from '../contracts/model-config.js';
import { AgentError } from '../contracts/errors.js';
import { createChatModel } from './factory.js';
import { modelError } from './errors.js';
import { createModelTransport, type ModelResolver } from './transport.js';

export async function createDirectModel(
  config: ModelConfig,
  settings: Settings,
  signal: AbortSignal,
  resolver?: ModelResolver,
) {
  const transport = await createModelTransport(
    config.baseUrl,
    settings.allowPrivateModelHosts,
    signal,
    resolver,
    settings.idleTimeoutMs,
  );
  const model = createChatModel(config, transport.fetch);
  return {
    close: transport.close,
    async generate(
      messages: BaseMessage[],
      onText?: (text: string) => Promise<void>,
      callSignal = signal,
    ) {
      const operationSignal = AbortSignal.any([signal, callSignal]);
      let text = '';
      try {
        const stream = await model.stream(messages, {
          signal: operationSignal,
        });
        for await (const chunk of stream) {
          operationSignal.throwIfAborted();
          const delta =
            typeof chunk.content === 'string'
              ? chunk.content
              : chunk.content
                  .filter(
                    (block) =>
                      block.type === 'text' && typeof block.text === 'string',
                  )
                  .map((block) => block.text)
                  .join('');
          if (!delta) continue;
          // Bound untrusted model output before accumulating it or retrying JSON repair.
          if (text.length + delta.length > 1_048_576)
            throw new AgentError(
              502,
              'upstream_unavailable',
              'model_output_too_large',
            );
          text += delta;
          await onText?.(text);
        }
        operationSignal.throwIfAborted();
        return text;
      } catch (error) {
        throw modelError(error, operationSignal);
      }
    },
  };
}

export function parseJsonOutput(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  // Accept one fenced JSON value, never mine a later object out of unrelated prose.
  return JSON.parse(stripped, (key, value: unknown) => {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error('Reserved JSON key');
    return value;
  });
}
