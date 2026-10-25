import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { splitTrajectoryBeats, visibleAssistantText } from './trajectory';
import { createStreamingTextBuffer } from '../lib/streamingBuffer';
import type { ChatMessage, MessageBeat } from '../types';
import Markdown from './Markdown';
import ChatThread from './ChatThread';
import '@/i18n';

const trajectory = {
  startedAt: 1,
  steps: [{ id: 'step', index: 1, status: 'done' as const, startedAt: 1, completedAt: 5 }],
};
// Reads rendered markup as text; repeats until no tag is left so nested markup cannot survive.
const plainText = (html: string) => {
  let previous: string;
  let current = html;
  do {
    previous = current;
    current = current.replace(/<[^>]*>/g, '');
  } while (current !== previous);
  return current;
};
const text = (id: string, value: string): MessageBeat => ({ id, kind: 'text', text: value });
const tool: MessageBeat = { id: 'read', kind: 'tool', call: { toolCallId: 'read', toolName: 'read_resume', done: true } };
const widget: MessageBeat = { id: 'notice', kind: 'widget', widget: { widgetId: 'notice', kind: 'fabrication_notice', props: { items: ['Example Lantern Lab'] }, status: 'pending' } };

test('trajectory keeps cards and the last answer visible while moving process narration and tools into the trace', () => {
  const narration = text('narration', '先读取简历。');
  const answer = text('answer', '最终回答。');
  const message: ChatMessage = { id: 'assistant', role: 'assistant', trajectory, timeline: [narration, widget, tool, answer], content: '先读取简历。最终回答。' };
  assert.deepEqual(splitTrajectoryBeats(message), { trace: [narration, tool], visible: [widget, answer] });
  assert.equal(visibleAssistantText(message), '最终回答。');
  assert.deepEqual(message.timeline, [narration, widget, tool, answer]);
});

test('narration followed by another tool is traced until a final answer arrives', () => {
  const narration = text('narration', '先检查岗位。');
  const message: ChatMessage = { id: 'assistant', role: 'assistant', trajectory, timeline: [narration, tool, widget] };
  assert.deepEqual(splitTrajectoryBeats(message), { trace: [narration, tool], visible: [widget] });
  assert.equal(visibleAssistantText(message), '');
});

test('legacy messages retain all beats, concatenate copy text, and fall back to content without text beats', () => {
  const beats = [text('a', ' 第一段'), widget, text('b', '接续正文 ')];
  const message: ChatMessage = { id: 'legacy', role: 'assistant', timeline: beats, content: '旧的全文' };
  assert.deepEqual(splitTrajectoryBeats(message), { trace: [], visible: beats });
  assert.equal(visibleAssistantText(message), '第一段接续正文');
  assert.deepEqual(splitTrajectoryBeats({ ...message, trajectory: { startedAt: 1, steps: [] } }), { trace: [], visible: beats });
  assert.equal(visibleAssistantText({ ...message, timeline: [widget] }), '旧的全文');
  assert.equal(visibleAssistantText({ id: 'empty', role: 'assistant' }), '');
});

test('a choice continuation renders chunked text as one paragraph in Markdown and ChatThread', () => {
  const chosen: ChatMessage = {
    id: 'choice', role: 'widget',
    widget: {
      widgetId: 'choice', kind: 'ask_choice', status: 'submitted',
      props: { message: '选择优先检查的内容', options: ['项目经历', '技能清单'] },
      submittedValues: { choice: '项目经历' },
    },
  };
  const buffer = createStreamingTextBuffer({ onFrame: () => {} });
  const fragments = ['根据你的选择，', '我会先检查项目经历', '，再整理成一段完整回复。'];
  const expected = fragments.join('');
  for (const fragment of fragments) buffer.appendContent(fragment);
  const snapshot = buffer.flush();
  buffer.cancel();
  assert.equal(snapshot.content, expected);
  assert.equal(snapshot.tail, expected);
  for (const status of ['running', 'done'] as const) {
    const message: ChatMessage = {
      id: 'continued', role: 'assistant', status, streamed: true,
      trajectory, content: snapshot.content, timeline: [text('tail', snapshot.tail)],
    };
    const markdown = renderToStaticMarkup(<Markdown streaming={status === 'running'}>{snapshot.content}</Markdown>);
    const thread = renderToStaticMarkup(<ChatThread messages={[chosen, message]} onToggleCanvas={() => {}} openCanvasSkillId={null} />);
    for (const markup of [markdown, thread]) {
      const paragraphs = markup.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? [];
      const answer = paragraphs.filter((paragraph) => plainText(paragraph).includes('根据你的选择'));
      assert.equal(answer.length, 1);
      assert.equal(plainText(answer[0]).replace(/⁣/g, ''), expected);
      assert.equal(paragraphs.filter((paragraph) => fragments.some((fragment) => plainText(paragraph).includes(fragment))).length, 1);
    }
    assert.equal(visibleAssistantText(message), expected);
    assert.match(thread, /项目经历/);
  }
});
