/**
 * Streaming text arrives at provider-token cadence, which can be hundreds of
 * updates per second. React should render at a human-visible cadence instead.
 *
 * This buffer owns only the ephemeral text for the active assistant message.
 * Semantic events (tools, approvals, plans) continue to bypass it so they stay
 * immediate. The caller persists one final snapshot when the run ends.
 */

export const STREAM_RENDER_INTERVAL_MS = 40;

export type StreamingTextSnapshot = {
  content: string;
  reasoning: string;
};

type TimerHandle = ReturnType<typeof setTimeout>;

type StreamingBufferOptions = {
  onFrame: (snapshot: StreamingTextSnapshot) => void;
  intervalMs?: number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
};

export type StreamingTextBuffer = {
  appendContent: (delta: string) => void;
  appendReasoning: (delta: string) => void;
  snapshot: () => StreamingTextSnapshot;
  flush: () => StreamingTextSnapshot;
  cancel: () => void;
};

export function createStreamingTextBuffer({
  onFrame,
  intervalMs = STREAM_RENDER_INTERVAL_MS,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = clearTimeout,
}: StreamingBufferOptions): StreamingTextBuffer {
  let content = '';
  let reasoning = '';
  let timer: TimerHandle | null = null;
  let dirty = false;

  const snapshot = (): StreamingTextSnapshot => ({ content, reasoning });

  const publish = () => {
    timer = null;
    if (!dirty) return;
    dirty = false;
    onFrame(snapshot());
  };

  const queue = () => {
    dirty = true;
    if (timer !== null) return;
    timer = schedule(publish, intervalMs);
  };

  const stopTimer = () => {
    if (timer === null) return;
    cancel(timer);
    timer = null;
  };

  return {
    appendContent(delta) {
      content += delta;
      queue();
    },
    appendReasoning(delta) {
      reasoning += delta;
      queue();
    },
    snapshot,
    flush() {
      stopTimer();
      if (dirty) {
        dirty = false;
        onFrame(snapshot());
      }
      return snapshot();
    },
    cancel() {
      stopTimer();
      dirty = false;
    },
  };
}
