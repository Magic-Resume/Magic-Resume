import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Settings } from '../config.js';
import type { ModelConfig } from '../contracts/model-config.js';
import { AgentError } from '../contracts/errors.js';
import { createDirectModel } from '../model/direct.js';
import type { ModelResolver } from '../model/transport.js';

// 64x64 solid squares, one picked at random per probe, so a text-only model that
// ignores the image cannot pass by guessing. A single pixel is too small:
// providers rescale it and models misread its color.
export const VISION_PROBES = [
  {
    color: 'RED',
    image:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PQQkAAAgAsetfWiP4FgYrsKZeS0BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDgsqnc8OJg6Ln3AAAAAElFTkSuQmCC',
  },
  {
    color: 'GREEN',
    image:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAATElEQVR42u3PQQkAAAgAseufwqhG8C0MVmA1/SYgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcFlT0gCXrcLQywAAAABJRU5ErkJggg==',
  },
  {
    color: 'BLUE',
    image:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PQQkAAAgAsetfWiP4FgYrsGqeExAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBA4LMf88OL0EKXAAAAAAElFTkSuQmCC',
  },
] as const;
export function pickVisionProbe(random: () => number = Math.random) {
  return (
    VISION_PROBES[Math.floor(random() * VISION_PROBES.length)] ??
    VISION_PROBES[0]
  );
}
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
    const visionProbe = pickVisionProbe();
    try {
      const probe = await model.generate(
        [
          new SystemMessage(
            'Name the color that fills the supplied image with one English word. If you cannot see an image, reply UNSUPPORTED.',
          ),
          new HumanMessage({
            content: [
              { type: 'text', text: 'What color is this image?' },
              {
                type: 'image_url',
                image_url: { url: visionProbe.image, detail: 'low' },
              },
            ],
          }),
        ],
        undefined,
        AbortSignal.timeout(VISION_PROBE_TIMEOUT_MS),
      );
      supportsImage = new RegExp(`\\b${visionProbe.color}\\b`).test(
        probe.toUpperCase(),
      );
    } catch {
      /* Image probing is optional and cannot turn a working text connection into failure. */
    }
    return { ok: true, latencyMs, supportsImage };
  } finally {
    await model.close();
  }
}
