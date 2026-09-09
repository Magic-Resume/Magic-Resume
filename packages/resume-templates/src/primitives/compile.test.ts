import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TemplateDocument, TemplateNode } from './ast';
import { UNHANDLED_SECTIONS, compile } from './compile';
import type { ResolvedBox, ResolvedNode, ResolvedText } from './ir';

const doc = (root: TemplateNode, styles?: TemplateDocument['styles']): TemplateDocument => ({
  version: 1,
  ...(styles ? { styles } : {}),
  root,
});

const resume = {
  info: { fullName: '张三', website: 'example.com' },
  sections: {
    experience: [
      { id: 'e1', company: '甲公司', summary: '<p>做了 A</p>' },
      { id: 'e2', company: '乙公司', description: '<p>做了 B</p>' },
      { id: 'e3', company: '丙公司', visible: false },
    ],
    awards: [{ id: 'a1', name: '优秀员工' }],
  },
  sectionOrder: [{ key: 'experience' }, { key: 'awards' }, { key: 'custom-x' }],
};

/** 把树压平成节点数组，便于断言。 */
const flatten = (node: ResolvedNode | null): ResolvedNode[] => {
  if (!node) return [];
  return node.type === 'Box'
    ? [node, ...(node as ResolvedBox).children.flatMap(flatten)]
    : [node];
};
const texts = (node: ResolvedNode | null): string[] =>
  flatten(node).filter((n): n is ResolvedText => n.type === 'Text').map((n) => n.text);

// ── each ────────────────────────────────────────────────────────────────

test('each 展开成兄弟节点，而不是嵌一层', () => {
  const { root } = compile(
    doc({
      id: 'row', type: 'Box',
      children: [{ id: 'co', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } }],
    }),
    resume,
  );
  // 关键：三个 Text 是 Box 的**直接子节点**。做成节点的话它们会挤在一个 flex 槽里。
  const box = root as ResolvedBox;
  assert.equal(box.children.length, 2); // e3 visible:false 被过滤
  assert.deepEqual(texts(root), ['甲公司', '乙公司']);
});

test('visible 的三种假值拼写都过滤掉', () => {
  for (const visible of [false, 'false', 0]) {
    const { root } = compile(
      doc({
        id: 'r', type: 'Box',
        children: [{ id: 't', type: 'Text', each: { path: 'sections.x' }, value: { read: 'n' } }],
      }),
      { sections: { x: [{ id: '1', n: 'A', visible }, { id: '2', n: 'B' }] } },
    );
    assert.deepEqual(texts(root), ['B'], `visible=${String(visible)} 应被过滤`);
  }
});

/** 绑到非数组必须当空处理——**永不抛**，否则一个错路径让整份简历渲染不出来。 */
test('each 绑到非数组时当空数组，不抛异常', () => {
  const { root, diagnostics } = compile(
    doc({ id: 'r', type: 'Box', children: [{ id: 't', type: 'Text', each: { path: 'info.fullName' }, value: 'x' }] }),
    resume,
  );
  assert.equal((root as ResolvedBox).children.length, 0);
  assert.equal(diagnostics.some((d) => d.level === 'error'), false);
});

// ── separator ───────────────────────────────────────────────────────────

/** 分隔符插在项**之间**。用「每项后加一个」会多出末尾那个。 */
test('separator 插在项之间，末尾没有多余的', () => {
  const { root } = compile(
    doc({
      id: 'wrap', type: 'Box',
      children: [{
        // separator 属于**被重复的那个节点**
        id: 'row', type: 'Box',
        each: { path: 'sections.experience' },
        separator: { id: 'sep', type: 'Text', value: '·' },
        children: [{ id: 'co', type: 'Text', value: { read: 'company' } }],
      }],
    }),
    resume,
  );
  assert.deepEqual(texts(root), ['甲公司', '·', '乙公司']);
});

// ── when ────────────────────────────────────────────────────────────────

test('when.exists 为假时整块不渲染', () => {
  const { root } = compile(
    doc({
      id: 'r', type: 'Box',
      children: [
        { id: 'a', type: 'Text', when: { exists: 'info.fullName' }, value: '有' },
        { id: 'b', type: 'Text', when: { exists: 'info.nope' }, value: '无' },
      ],
    }),
    resume,
  );
  assert.deepEqual(texts(root), ['有']);
});

/** 时间线的竖线要在「最后一项之外」才画，否则末尾多出一截。 */
test('isLast 能在迭代里判断末项', () => {
  const { root } = compile(
    doc({
      id: 'r', type: 'Box',
      children: [{
        id: 'w', type: 'Box', each: { path: 'sections.experience' },
        children: [{ id: 'rail', type: 'Text', when: { not: { isLast: true } }, value: '│' }],
      }],
    }),
    resume,
  );
  assert.deepEqual(texts(root), ['│']); // 两项，只有第一项画竖线
});

// ── binding 与可编辑锚点 ─────────────────────────────────────────────────

/**
 * 候选链命中哪个键，`edit.fieldKey` 就是哪个——**显示别名不是可写路径**。
 * 写回做的是 `item[fieldKey] = …`，写错就是「改了但页面没变」。
 */
test('候选链命中的键成为可写键，两个条目可以不同', () => {
  const { root } = compile(
    doc({
      id: 'r', type: 'Box',
      children: [{
        id: 'd', type: 'RichText', each: { path: 'sections.experience' },
        value: { read: ['summary', 'description'] },
      }],
    }),
    resume,
  );
  const rich = flatten(root).filter((n) => n.type === 'RichText');
  assert.equal(rich.length, 2);
  assert.equal((rich[0] as { edit?: { fieldKey: string } }).edit?.fieldKey, 'summary');
  assert.equal((rich[1] as { edit?: { fieldKey: string } }).edit?.fieldKey, 'description');
});

test('binding.write 显式给定时优先于推断', () => {
  const { root } = compile(
    doc({
      id: 'r', type: 'Box',
      children: [{
        id: 'd', type: 'Text', each: { path: 'sections.experience' },
        value: { read: ['company'], write: 'company' },
      }],
    }),
    resume,
  );
  const t = flatten(root).find((n) => n.type === 'Text') as ResolvedText;
  assert.equal(t.edit?.fieldKey, 'company');
  assert.equal(t.edit?.sectionKey, 'experience');
  assert.equal(t.edit?.itemId, 'e1');
});

/** 缺 id 就不可编辑——**而且是静默的**，所以必须留下诊断。 */
test('条目缺 id 时退化成只读，并记一条诊断', () => {
  const { root, diagnostics } = compile(
    doc({
      id: 'r', type: 'Box',
      children: [{ id: 't', type: 'Text', each: { path: 'sections.x' }, value: { read: 'n' } }],
    }),
    { sections: { x: [{ n: '没有 id' }] } },
  );
  const t = flatten(root).find((n) => n.type === 'Text') as ResolvedText;
  assert.equal(t.edit, undefined);
  assert.ok(diagnostics.some((d) => d.message.includes('不可编辑')));
});

// ── catch-all ───────────────────────────────────────────────────────────

/**
 * 用户自建分区若不渲染，是**静默丢内容**——比崩了更糟。
 * catch-all 排除「模板已显式声明的」与「内建的」，剩下的就是用户自己加的。
 */
test('catch-all 只展开模板没声明、且非内建的分区', () => {
  const { root } = compile(
    doc({
      id: 'r', type: 'Box',
      children: [
        // 显式声明 experience
        { id: 'exp', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } },
        // 其余交给 catch-all
        { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
      ],
    }),
    {
      ...resume,
      sections: { ...resume.sections, 'custom-x': [{ id: 'c1', name: '获奖' }] },
    },
  );
  const all = texts(root);
  // experience 已声明 → 不进 catch-all；awards 非内建且未声明 → 进；custom-x → 进
  assert.ok(all.includes('awards'), 'awards 应当被 catch-all 接住');
  assert.ok(all.includes('custom-x'), '用户自建分区应当被 catch-all 接住');
  assert.equal(all.filter((t) => t === 'experience').length, 0, 'experience 已声明，不该重复');
});

// ── 安全 ────────────────────────────────────────────────────────────────

test('不安全的 href 在编译期就被剥掉', () => {
  const { root } = compile(
    doc({ id: 'a', type: 'Text', value: '点我', href: 'javascript:alert(1)' }),
    resume,
  );
  assert.equal((root as ResolvedText).href, undefined);
});

test('像域名的 href 补成 https', () => {
  const { root } = compile(
    doc({ id: 'a', type: 'Text', value: '站点', href: { read: 'info.website' } }),
    resume,
  );
  assert.equal((root as ResolvedText).href, 'https://example.com');
});

// ── 样式 ────────────────────────────────────────────────────────────────

test('样式引用与内联覆盖按顺序合并', () => {
  const { root } = compile(
    doc(
      { id: 't', type: 'Text', value: 'x', style: ['heading', { fontSize: 20 }] },
      { heading: { fontSize: 14, color: '#111' } },
    ),
    resume,
  );
  assert.deepEqual((root as ResolvedText).style, { fontSize: 20, color: '#111' });
});

/** 未注册的字重会静默回落 → 两个后端看起来不一样却都不报错。所以只放行 400/700。 */
test('非法字重被丢弃，不会带到渲染器', () => {
  const { root } = compile(doc({ id: 't', type: 'Text', value: 'x', style: [{ fontWeight: 600 }] }), resume);
  assert.equal('fontWeight' in (root as ResolvedText).style, false);
});

test('越界数值被钳制', () => {
  const { root } = compile(doc({ id: 't', type: 'Text', value: 'x', style: [{ fontSize: 400, opacity: 5 }] }), resume);
  assert.equal((root as ResolvedText).style.fontSize, 96);
  assert.equal((root as ResolvedText).style.opacity, 1);
});

test('不认识的样式属性被剔除（grid 在 react-pdf 不存在）', () => {
  const { root } = compile(
    doc({ id: 't', type: 'Text', value: 'x', style: [{ display: 'grid', boxShadow: '0 0 4px #000', color: '#f00' }] }),
    resume,
  );
  assert.deepEqual((root as ResolvedText).style, { color: '#f00' });
});

// ── 健壮性 ──────────────────────────────────────────────────────────────

/** 一棵坏模板只该产出诊断，不该让用户的编辑器白屏。 */
test('自嵌套不会栈溢出，会被截断并记诊断', () => {
  const node: Record<string, unknown> = { id: 'x', type: 'Box', children: [] };
  node.children = [node]; // 自引用
  const { diagnostics } = compile(doc(node as unknown as TemplateNode), resume);
  assert.ok(diagnostics.some((d) => d.message.includes('嵌套超过')));
});

test('未知节点类型走 fallback；没有 fallback 就丢掉并记诊断', () => {
  const { root, diagnostics } = compile(
    doc({
      id: 'r', type: 'Box',
      children: [
        { id: 'u1', type: 'Sparkline', fallback: { id: 'fb', type: 'Text', value: '降级了' } } as unknown as TemplateNode,
        { id: 'u2', type: 'Hologram' } as unknown as TemplateNode,
      ],
    }),
    resume,
  );
  assert.deepEqual(texts(root), ['降级了']);
  assert.equal(diagnostics.filter((d) => d.message.includes('未知节点类型')).length, 2);
});

test('取不到值的文本节点整个不渲染，不留 undefined 字样', () => {
  const { root } = compile(
    doc({ id: 'r', type: 'Box', children: [{ id: 't', type: 'Text', value: { read: 'info.nope' } }] }),
    resume,
  );
  assert.deepEqual(texts(root), []);
});

test('插值取不到时留空，不写出字面的 undefined', () => {
  const { root } = compile(doc({ id: 't', type: 'Text', value: '你好 {{info.nope}}！' }), resume);
  assert.equal((root as ResolvedText).text, '你好 ！');
});

/** 两个 id 缺一不可：设计模式要 templateNodeId，就地编辑要 instanceId。 */
test('每个实例同时带 templateNodeId 与唯一的 instanceId', () => {
  const { root } = compile(
    doc({
      id: 'r', type: 'Box',
      children: [{ id: 'co', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } }],
    }),
    resume,
  );
  const items = flatten(root).filter((n) => n.type === 'Text');
  assert.equal(items[0].templateNodeId, 'co');
  assert.equal(items[1].templateNodeId, 'co');
  assert.notEqual(items[0].instanceId, items[1].instanceId);
});

/**
 * 兜底节点必须接住**内容**，不只是分区名。
 *
 * 这条是补上来的：此前 `each.path` 不插值，`sections.{{item.key}}` 取不到东西，
 * 于是兜底只印得出「获奖经历」四个字、下面空空如也——用户自建分区的正文照样消失。
 * 而「不让它消失」正是兜底存在的全部理由，只挡住一半等于没挡。
 */
test('兜底节点连内容一起接住（each.path 要插值）', () => {
  const doc: TemplateDocument = {
    version: 1,
    root: {
      id: 'r',
      type: 'Box',
      each: { path: UNHANDLED_SECTIONS },
      children: [
        { id: 'h', type: 'Text', value: '{{item.key}}' },
        {
          id: 'i',
          type: 'Box',
          each: { path: 'sections.{{item.key}}' },
          children: [{ id: 'n', type: 'Text', value: { read: ['name', 'title'] } }],
        },
      ],
    },
  };
  const { root } = compile(doc, {
    sections: {
      experience: [{ id: 'e1', company: 'X' }],
      获奖经历: [{ id: 'a1', name: '一等奖学金' }, { id: 'a2', name: '优秀毕业生' }],
    },
    sectionOrder: [{ key: 'experience' }, { key: '获奖经历' }],
  });
  const texts: string[] = [];
  const walk = (n: NonNullable<typeof root>): void => {
    if (n.type === 'Text') texts.push(n.text);
    if (n.type === 'Box') n.children.forEach(walk);
  };
  if (root) walk(root);
  assert.deepEqual(texts, ['获奖经历', '一等奖学金', '优秀毕业生']);
});

/** 不含 `{{}}` 的路径原样处理——哨兵与普通路径都不能被插值改坏。 */
test('普通路径不受插值影响', () => {
  const doc: TemplateDocument = {
    version: 1,
    root: {
      id: 'r',
      type: 'Text',
      each: { path: 'sections.experience' },
      value: { read: 'company' },
    },
  };
  const { root } = compile(doc, {
    sections: { experience: [{ id: 'e1', company: '甲' }] },
    sectionOrder: [{ key: 'experience' }],
  });
  assert.equal(root?.type === 'Text' ? root.text : undefined, '甲');
});

/**
 * 分隔符作用于**静态子节点**之间。
 *
 * 表头的「电话 · 邮箱 · GitHub」是写死的三个节点、不是一次迭代。只支持 `each` 的话，
 * 这种极常见的形态只能靠在每个字段后面拼字符串——而末尾必然多出一个，
 * 那正是 `separator` 要解决的问题。
 */
test('separator 插在静态子节点之间，末尾不多出', () => {
  const doc: TemplateDocument = {
    version: 1,
    root: {
      id: 'row',
      type: 'Box',
      separator: { id: 'sep', type: 'Text', value: '·' },
      children: [
        { id: 'a', type: 'Text', value: { read: 'info.phone' } },
        { id: 'b', type: 'Text', value: { read: 'info.email' } },
        { id: 'c', type: 'Text', value: { read: 'info.github' } },
      ],
    },
  };
  const { root } = compile(doc, {
    info: { phone: '138', email: 'a@b.c', github: 'gh/x' },
  });
  const texts = root?.type === 'Box' ? root.children.map((c) => (c.type === 'Text' ? c.text : '')) : [];
  assert.deepEqual(texts, ['138', '·', 'a@b.c', '·', 'gh/x']);
});

/**
 * **取不到值的字段要先滤掉再插分隔符。**
 * 否则「手机号有、邮箱空、GitHub 有」会渲成「138 · · gh/x」，
 * 或者更糟的「138 ·」——一个没有下家的分隔符。
 */
test('空字段不留下孤立的分隔符', () => {
  const doc: TemplateDocument = {
    version: 1,
    root: {
      id: 'row',
      type: 'Box',
      separator: { id: 'sep', type: 'Text', value: '·' },
      children: [
        { id: 'a', type: 'Text', value: { read: 'info.phone' } },
        { id: 'b', type: 'Text', value: { read: 'info.email' } },
        { id: 'c', type: 'Text', value: { read: 'info.github' } },
      ],
    },
  };
  const only = compile(doc, { info: { phone: '138' } });
  assert.deepEqual(
    only.root?.type === 'Box' ? only.root.children.map((c) => (c.type === 'Text' ? c.text : '')) : [],
    ['138'],
    '只剩一项时不该有分隔符',
  );

  const gap = compile(doc, { info: { phone: '138', github: 'gh/x' } });
  assert.deepEqual(
    gap.root?.type === 'Box' ? gap.root.children.map((c) => (c.type === 'Text' ? c.text : '')) : [],
    ['138', '·', 'gh/x'],
    '中间空一项时分隔符只该有一个',
  );
});

/**
 * 公司 logo 的整条渲染绑定。
 *
 * 上线后用户报「logo 还是没显示」，而这一层此前没有任何测试——排障时无法区分
 * 「渲染器不认」和「数据/模板树里根本没有」。这条把渲染这一半钉死，剩下的问题
 * 就只可能在上游。
 */
test('each 里的 Image 能读到条目上的 companyLogo', () => {
  const { root } = compile(
    doc({
      id: 'root',
      type: 'Box',
      children: [
        {
          id: 'exp',
          type: 'Box',
          each: { path: 'sections.experience' },
          children: [
            { id: 'logo', type: 'Image', src: { read: 'companyLogo' }, width: 14 },
            { id: 'co', type: 'Text', value: { read: 'company' } },
          ],
        },
      ],
    }),
    {
      ...resume,
      sections: {
        ...resume.sections,
        experience: [
          { id: 'e1', company: '腾讯', companyLogo: 'https://cdn.test/tencent.png' },
          { id: 'e2', company: '携程' },
        ],
      },
    },
  );

  const images = flatten(root).filter((n) => n.type === 'Image');
  // 有 logo 的画出来，没有的整节点消失——不留空图占位。
  assert.equal(images.length, 1);
  assert.equal(
    (images[0] as unknown as { src: string }).src,
    'https://cdn.test/tencent.png',
  );
});
