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
  /**
   * 上一次封段之后新写的正文，也就是时间线上**还没定稿的那一段**。
   *
   * `content` 始终是整条消息的全文（复制、重新生成、eval 都读它），所以封段不能把它清空；
   * 改用一个游标，让「全文」和「当前这一段」同时成立。
   */
  tail: string;
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
  /**
   * 在工具边界给正文封段：返回上一段封口以来的文本，并把游标推到当前末尾。
   *
   * 返回空串表示这次工具之前模型什么都没说——那就不该凭空造出一个空的文本节拍。
   */
  sealContent: () => string;
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
  /** 已封段到 `content` 的哪个位置。见 `sealContent`。 */
  let sealedAt = 0;
  let timer: TimerHandle | null = null;
  let dirty = false;

  const snapshot = (): StreamingTextSnapshot => ({
    content,
    reasoning,
    tail: content.slice(sealedAt),
  });

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
    sealContent() {
      stopTimer();
      const sealed = content.slice(sealedAt);
      sealedAt = content.length;
      /*
       * **先封口，再落帧。**
       *
       * 反过来（先用封口前的快照落帧、再推进 `sealedAt`）会让这一段文字同时以两种身份
       * 存在：时间线上刚封的那一拍，和 overlay 里还没清掉的 `tail`。工具执行期间模型不
       * 产字，`queue()` 不会被触发，那个陈旧的 tail 就一直挂着——屏幕上就是同一句话在
       * 工具行前后各出现一遍。
       *
       * 这一帧必须无条件发：`dirty` 为假也要发，因为要清的正是上一帧留下的 tail。
       */
      dirty = false;
      onFrame(snapshot());
      return sealed;
    },
    cancel() {
      stopTimer();
      dirty = false;
    },
  };
}
