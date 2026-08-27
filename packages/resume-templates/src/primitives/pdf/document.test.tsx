import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderTreeDocument } from './document';
import type { ResolvedNode } from '../types';

const root = {
  instanceId: 'plain-text',
  templateNodeId: 'plain-text',
  type: 'Text',
  text: '实习经历',
  style: {},
} as unknown as ResolvedNode;

const pageStyleOf = (mode: 'single' | 'paged') => {
  const document = renderTreeDocument(
    root,
    { mode, size: 'A4', marginPoints: 0 },
    { fontFamily: 'Source Han Sans SC' },
  );
  const page = (document.props as { children?: React.ReactNode }).children;
  assert.ok(React.isValidElement(page), 'document should contain one PDF Page');
  return (page.props as { style?: Record<string, unknown> }).style ?? {};
};

test('整份原语 PDF 从 Page 继承 CJK 字体（普通 Text 也覆盖）', () => {
  for (const mode of ['single', 'paged'] as const) {
    assert.equal(
      pageStyleOf(mode).fontFamily,
      'Source Han Sans SC',
      `${mode} 模式的普通 Text 不应回落到 PDF 默认 Helvetica`,
    );
  }
});
