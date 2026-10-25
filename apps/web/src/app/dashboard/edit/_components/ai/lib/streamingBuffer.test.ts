import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStreamingTextBuffer, STREAM_RENDER_INTERVAL_MS, type StreamingTextSnapshot } from './streamingBuffer';

function harness() {
  const frames: StreamingTextSnapshot[] = [];
  const callbacks = new Map<ReturnType<typeof setTimeout>, () => void>();
  const delays: number[] = [];
  let nextId = 0;
  const buffer = createStreamingTextBuffer({
    onFrame: (frame) => frames.push(frame),
    schedule: (callback, delay) => {
      const id = ++nextId as unknown as ReturnType<typeof setTimeout>;
      callbacks.set(id, callback);
      delays.push(delay);
      return id;
    },
    cancel: (id) => { callbacks.delete(id); },
  });
  const tick = () => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach((callback) => callback());
  };
  return { buffer, frames, callbacks, delays, tick };
}

test('token bursts coalesce text and reasoning into one frame per interval', () => {
  const { buffer, frames, callbacks, delays, tick } = harness();
  for (let index = 0; index < 120; index++) buffer.appendContent('字');
  buffer.appendReasoning('正在整理');
  assert.equal(frames.length, 0);
  assert.equal(callbacks.size, 1);
  assert.deepEqual(delays, [STREAM_RENDER_INTERVAL_MS]);
  tick();
  assert.deepEqual(frames, [{ content: '字'.repeat(120), reasoning: '正在整理', tail: '字'.repeat(120) }]);
  buffer.appendContent('。');
  buffer.appendReasoning('完毕');
  tick();
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[1], { content: `${'字'.repeat(120)}。`, reasoning: '正在整理完毕', tail: `${'字'.repeat(120)}。` });
});

test('sealing clears the published tail before a tool while retaining the full answer', () => {
  const { buffer, frames, callbacks } = harness();
  buffer.appendContent('先检查岗位。');
  assert.equal(buffer.sealContent(), '先检查岗位。');
  assert.equal(callbacks.size, 0);
  assert.deepEqual(frames, [{ content: '先检查岗位。', reasoning: '', tail: '' }]);
  assert.equal(buffer.sealContent(), '');
  assert.deepEqual(frames[1], frames[0]);
  buffer.appendContent('检查完毕，');
  buffer.appendContent('这是完整回答。');
  assert.deepEqual(buffer.snapshot(), { content: '先检查岗位。检查完毕，这是完整回答。', reasoning: '', tail: '检查完毕，这是完整回答。' });
  assert.equal(buffer.sealContent(), '检查完毕，这是完整回答。');
  assert.equal(frames.at(-1)?.tail, '');
});

test('sealing an already published frame still clears its stale tail immediately', () => {
  const { buffer, frames, tick } = harness();
  buffer.appendContent('已经显示的旁白。');
  tick();
  assert.equal(frames[0].tail, '已经显示的旁白。');
  assert.equal(buffer.sealContent(), '已经显示的旁白。');
  assert.equal(frames.length, 2);
  assert.equal(frames[1].tail, '');
  assert.equal(frames[1].content, frames[0].content);
});

test('flush publishes a pending frame once and cancellation leaves a readable final snapshot', () => {
  const { buffer, frames, callbacks, tick } = harness();
  buffer.appendContent('最终正文');
  const final = buffer.flush();
  assert.equal(callbacks.size, 0);
  assert.deepEqual(final, { content: '最终正文', reasoning: '', tail: '最终正文' });
  assert.deepEqual(frames, [final]);
  assert.deepEqual(buffer.flush(), final);
  tick();
  assert.equal(frames.length, 1);
  buffer.appendContent('，停止后仍保留');
  buffer.cancel();
  assert.equal(callbacks.size, 0);
  tick();
  assert.equal(frames.length, 1);
  assert.equal(buffer.snapshot().content, '最终正文，停止后仍保留');
  buffer.flush();
  assert.equal(frames.length, 1);
});
