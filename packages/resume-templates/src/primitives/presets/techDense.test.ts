import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from '../compile';
import { techDensePreset } from './techDense';
import type { ResolvedNode } from '../types';
import type { TemplateDocument } from '../ast';

const nodesOf = (node: ResolvedNode | null): ResolvedNode[] => {
  if (!node) return [];
  if (node.type !== 'Box') return [node];
  return [node, ...node.children.flatMap(nodesOf)];
};

const compileHeader = (info: Record<string, string>) => {
  const { root, diagnostics } = compile(techDensePreset(), {
    info,
    sections: {},
    sectionOrder: [],
  });
  assert.ok(root, diagnostics.map((item) => item.message).join('; '));
  return nodesOf(root);
};

test('密集型模板读取产品实际的顶部字段', () => {
  const nodes = compileHeader({
    fullName: 'Kairo',
    phoneNumber: '138-0000-0000',
    email: 'linmo@qq.com',
    headline: '前端开发实习生',
    address: '北京',
    website: 'linmoe.cn',
  });
  const text = nodes.filter((node) => node.type === 'Text').map((node) => node.text);

  for (const expected of ['138-0000-0000', 'linmo@qq.com', '前端开发实习生', '北京', 'linmoe.cn']) {
    assert.ok(text.includes(expected), `顶部缺少 ${expected}: ${JSON.stringify(text)}`);
  }
  assert.deepEqual(
    nodes.filter((node) => node.type === 'Icon').map((node) => node.name),
    ['phone', 'user', 'globe'],
  );
});

test('密集型模板不会为缺失的顶部信息留下空图标或分隔符', () => {
  const nodes = compileHeader({ fullName: 'Kairo', email: 'linmo@qq.com' });
  const text = nodes.filter((node) => node.type === 'Text').map((node) => node.text);

  assert.deepEqual(
    nodes.filter((node) => node.type === 'Icon').map((node) => node.name),
    ['phone'],
  );
  assert.equal(text.includes('·'), false, `不应留下无主分隔符: ${JSON.stringify(text)}`);
});

test('已保存的旧版联系方式字段仍能显示，并隐藏空行', () => {
  const legacy: TemplateDocument = {
    version: 1,
    root: {
      id: 'root',
      type: 'Box',
      children: [
        {
          id: 'c-phone',
          type: 'Box',
          children: [
            { id: 'c-phone-icon', type: 'Icon', name: 'phone' },
            { id: 'c-phone-value', type: 'Text', value: { read: 'info.phone' } },
            { id: 'c-email-value', type: 'Text', value: { read: 'info.email' } },
          ],
        },
        {
          id: 'c-who',
          type: 'Box',
          children: [
            { id: 'c-who-icon', type: 'Icon', name: 'user' },
            { id: 'c-title-value', type: 'Text', value: { read: 'info.title' } },
          ],
        },
        {
          id: 'c-link',
          type: 'Box',
          children: [
            { id: 'c-link-icon', type: 'Icon', name: 'github' },
            { id: 'c-link-value', type: 'Text', value: { read: 'info.github' } },
          ],
        },
      ],
    },
  };
  const { root, diagnostics } = compile(legacy, {
    info: { fullName: 'Kairo', email: 'linmo@qq.com', website: 'linmoe.cn' },
    sections: {},
    sectionOrder: [],
  });
  assert.ok(root, diagnostics.map((item) => item.message).join('; '));
  const nodes = nodesOf(root);
  const text = nodes.filter((node) => node.type === 'Text').map((node) => node.text);

  assert.deepEqual(text, ['linmo@qq.com', 'linmoe.cn']);
  assert.deepEqual(
    nodes.filter((node) => node.type === 'Icon').map((node) => node.name),
    ['phone', 'github'],
  );
});

test('自定义分区会读取 sectionOrder 中选中的图标', () => {
  const { root, diagnostics } = compile(techDensePreset(), {
    info: { fullName: 'Kairo' },
    sections: { custom: [{ id: 'c1', name: '内容' }] },
    sectionOrder: [{ key: 'custom', label: '测试', icon: 'target' }],
  });
  assert.ok(root, diagnostics.map((item) => item.message).join('; '));
  const nodes = nodesOf(root);
  assert.ok(
    nodes.some((node) => node.type === 'Icon' && node.name === 'target'),
    '自定义分区标题应包含用户选择的 target 图标',
  );
});

test('基本信息自定义字段会显示，旧版 tech-dense 树也会自动兼容', () => {
  const current = techDensePreset();
  assert.equal(current.root.type, 'Box');
  const templateRoot = current.root;
  const legacy: TemplateDocument = {
    ...current,
    root: {
      ...templateRoot,
      children: templateRoot.children?.map((node) =>
        node.id === 'contact' && node.type === 'Box'
          ? { ...node, children: node.children?.filter((child) => child.id !== 'c-custom') }
          : node,
      ),
    },
  };
  const { root, diagnostics } = compile(legacy, {
    info: {
      fullName: 'Kairo',
      customFields: [{ id: 'github', name: 'GitHub', value: 'github.com/kairo', icon: 'github' }],
    },
    sections: {},
    sectionOrder: [],
  });
  assert.ok(root, diagnostics.map((item) => item.message).join('; '));
  const text = nodesOf(root).filter((node) => node.type === 'Text').map((node) => node.text);
  assert.ok(text.includes('GitHub：'));
  assert.ok(text.includes('github.com/kairo'));
  assert.ok(nodesOf(root).some((node) => node.type === 'Icon' && node.name === 'github'));
});
