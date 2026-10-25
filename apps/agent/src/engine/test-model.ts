import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Settings } from '../config.js';
import type { ModelConfig } from '../contracts/model-config.js';
import { AgentError } from '../contracts/errors.js';
import { createDirectModel } from '../model/direct.js';
import type { ModelResolver } from '../model/transport.js';

// A 64x64 solid blue square: the probe checks image content rather than just
// HTTP acceptance. A single pixel is too small; providers rescale it and models
// misread its color.
export const VISION_PROBE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PQQkAAAgAsetfWiP4FgYrsGqeExAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBA4LMf88OL0EKXAAAAAAElFTkSuQmCC';
const VISION_PROBE_TIMEOUT_MS = 12_000;
export async function testModel(
  config: ModelConfig,
  settings: Settings,
  signal: AbortSignal,
  resolver?: ModelResolver,
) {
  const started = performance.now();
  const model = await createDirectModel(
    { ...config, maxTokens: 128, effort: undefined },
    settings,
    signal,
    resolver,
  );
  try {
    const text = await model.generate([
      new SystemMessage('This is a connection test. Reply with OK only.'),
      new HumanMessage('Reply OK.'),
    ]);
    if (!text.trim())
      throw new AgentError(502, 'upstream_unavailable', 'model_empty_response');
    const latencyMs = Math.round(performance.now() - started);
    let supportsImage = false;
    try {
      const probe = await model.generate(
        [
          new SystemMessage(
            'Identify the color in the supplied image. Reply with exactly RED, GREEN, or BLUE. If you cannot read images, reply UNSUPPORTED.',
          ),
          new HumanMessage({
            content: [
              { type: 'text', text: 'What color is this pixel?' },
              {
                type: 'image_url',
                image_url: { url: VISION_PROBE_IMAGE, detail: 'low' },
              },
            ],
          }),
        ],
        undefined,
        AbortSignal.timeout(VISION_PROBE_TIMEOUT_MS),
      );
      supportsImage = /\bBLUE\b/.test(probe.toUpperCase());
    } catch {
      /* Image probing is optional and cannot turn a working text connection into failure. */
    }
    return { ok: true, latencyMs, supportsImage };
  } finally {
    await model.close();
  }
}
