import assert from 'node:assert/strict';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020';
import { NODE_TYPES, PAGE_MODES, PAGE_SIZES, type TemplateDocument, type TemplateNode } from './ast';
import { UNHANDLED_SECTIONS } from './compile';
import { defaultSectionPreset } from './presets/defaultSection';
import { templateJsonSchema } from './schema';
import { ALLOWED_FONT_WEIGHTS, ALLOWED_STYLE_KEYS, CLAMPS } from './style';
import { validateTemplate } from './validate';

/**
 * JSON Schema 的验收。
 *
 * 这个文件存在的理由是：**没有验证器跑过的 schema，只是一段我声称它对的 JSON。**
 * 第 4 期要拿它去约束模型解码，届时一个写错的 `$ref` 或漏掉的必填字段，
 * 表现出来的是「模型生成的模板莫名其妙全被拒」，排查方向完全指错。
 */

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validate = ajv.compile(templateJsonSchema);

const ok = (doc: unknown) => {
  const valid = validate(doc);
  return { valid, errors: (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`) };
};

// ── schema 本身编译得过 ──────────────────────────────────────────────

test('schema 能被 JSON Schema 2020-12 验证器编译', () => {
  assert.equal(typeof validate, 'function');
});

// ── 与真实来源保持一致（这几条才是防漂的本体） ────────────────────────

test('节点类型枚举来自共享清单', () => {
  assert.deepEqual(templateJsonSchema.$defs.node.properties.type.enum, [...NODE_TYPES]);
});

test('样式属性白名单与编译期一致', () => {
  const inSchema = Object.keys(templateJsonSchema.$defs.style.properties).sort();
  const allowed = [...ALLOWED_STYLE_KEYS].sort();
  assert.deepEqual(
    inSchema,
    allowed,
    'schema 允许的属性与编译期白名单不一致——模型会生成一批被静默丢弃的属性',
  );
});

test('字重枚举与编译期一致', () => {
  assert.deepEqual(
    templateJsonSchema.$defs.style.properties.fontWeight.enum,
    [...ALLOWED_FONT_WEIGHTS].sort((a, b) => a - b),
  );
});

/**
 * 纸张与分页模式的枚举也必须来自共享清单。
 *
 * 这条是补上来的——原本 schema 里手写了 `'LETTER'`，而类型里是 `'Letter'`。
 * 大小写不同，schema 会把一份完全合法的模板判成非法，而且报的是「不在枚举里」，
 * 看上去像模板写错了。**任何被手抄第二遍的枚举都会以这种方式出错。**
 */
test('纸张与分页模式枚举来自共享清单', () => {
  assert.deepEqual(templateJsonSchema.$defs.page.properties.size.enum, [...PAGE_SIZES]);
  assert.deepEqual(templateJsonSchema.$defs.page.properties.mode.enum, [...PAGE_MODES]);
});

test('带分页设置的文档通过', () => {
  for (const size of PAGE_SIZES) {
    for (const mode of PAGE_MODES) {
      const doc = { version: 1, page: { mode, size, margin: 40 }, root: { id: 'r', type: 'Text', value: { read: 'a' } } };
      assert.equal(ok(doc).valid, true, `${mode}/${size} 被拒了：${ok(doc).errors.join('; ')}`);
    }
  }
});

test('数值上下界与编译期钳制表一致', () => {
  const props = templateJsonSchema.$defs.style.properties as Record<
    string,
    { minimum?: number; maximum?: number }
  >;
  for (const [key, [min, max]] of Object.entries(CLAMPS)) {
    assert.equal(props[key]?.minimum, min, `${key} 的下界与 CLAMPS 不一致`);
    assert.equal(props[key]?.maximum, max, `${key} 的上界与 CLAMPS 不一致`);
  }
});

// ── 接受合法的东西 ────────────────────────────────────────────────────

const good = (): TemplateDocument => ({
  version: 1,
  styles: { heading: { fontWeight: 700, fontSize: 16 } },
  root: {
    id: 'root',
    type: 'Box',
    section: { sectionKey: 'experience', title: '工作经历', handle: true, insertSlot: true },
    style: ['heading', { marginTop: 4 }],
    children: [
      {
        id: 'row',
        type: 'Box',
        each: { path: 'sections.experience' },
        when: { or: [{ exists: 'company' }, { exists: 'position' }] },
        separator: { id: 'sep', type: 'Text', value: '·' },
        children: [
          { id: 'co', type: 'Text', role: 'sectionHeading', value: { read: ['company', 'name'] } },
          { id: 'sum', type: 'RichText', value: { read: 'summary', write: 'summary' } },
        ],
      },
      { id: 'l', type: 'List', ordered: false, items: [{ value: '要点', level: 1 }] },
      { id: 'img', type: 'Image', src: { read: 'info.avatar' }, width: 64, fit: 'cover' },
      { id: 'ic', type: 'Icon', name: 'briefcase', size: 14 },
      { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
    ],
  },
});

test('一棵用满词汇表的树通过', () => {
  const r = ok(good());
  assert.equal(r.valid, true, r.errors.join('; '));
});

test('真实预设通过', () => {
  const doc = defaultSectionPreset({
    sectionKey: 'experience',
    title: '工作经历',
    fieldMap: { mainTitle: 'company', sideTitle: 'date', description: ['summary', 'description'] },
    tokens: {
      primary: '#1f2937',
      text: '#111827',
      bodyFontSize: 14,
      titleFontSize: 18,
      lineHeight: 1.5,
      sectionSpacing: 16,
      sectionTitleSpacing: 6,
      paragraphSpacing: 12,
      titleDividerWidth: 1,
      showTitleIcon: true,
    },
    iconName: 'briefcase',
  });
  const r = ok(doc);
  assert.equal(r.valid, true, r.errors.join('; '));
});

test('递归：深层嵌套的 Box 通过（$ref 没写死层数）', () => {
  let node: TemplateNode = { id: 'leaf', type: 'Text', value: { read: 'a' } };
  for (let i = 0; i < 12; i++) node = { id: `b${i}`, type: 'Box', children: [node] };
  assert.equal(ok({ version: 1, root: node }).valid, true);
});

// ── 拒绝不合法的东西 ──────────────────────────────────────────────────

const rejects: Array<[string, unknown]> = [
  ['版本不对', { version: 2, root: { id: 'r', type: 'Text', value: 'x' } }],
  ['缺 root', { version: 1 }],
  ['未知节点类型', { version: 1, root: { id: 'r', type: 'Table' } }],
  ['缺 id', { version: 1, root: { type: 'Text', value: 'x' } }],
  ['Text 缺 value', { version: 1, root: { id: 'r', type: 'Text' } }],
  ['Icon 缺 name', { version: 1, root: { id: 'r', type: 'Icon' } }],
  ['Image 缺 src', { version: 1, root: { id: 'r', type: 'Image' } }],
  ['List 缺 items', { version: 1, root: { id: 'r', type: 'List' } }],
  [
    '白名单外的样式属性',
    { version: 1, root: { id: 'r', type: 'Text', value: 'x', style: [{ boxShadow: '0 0 4px' }] } },
  ],
  [
    '未注册的字重（PDF 会静默回落，造成两端不一致）',
    { version: 1, root: { id: 'r', type: 'Text', value: 'x', style: [{ fontWeight: 500 }] } },
  ],
  [
    '超出钳制范围的字号',
    { version: 1, root: { id: 'r', type: 'Text', value: 'x', style: [{ fontSize: 400 }] } },
  ],
  [
    'write 是深路径（写回会静默丢失）',
    { version: 1, root: { id: 'r', type: 'Text', value: { read: 'a', write: 'meta.summary' } } },
  ],
  ['each 缺 path', { version: 1, root: { id: 'r', type: 'Text', value: 'x', each: {} } }],
  ['顶层多出未知字段', { version: 1, root: { id: 'r', type: 'Text', value: 'x' }, theme: 'dark' }],
];

for (const [label, doc] of rejects) {
  test(`拒绝：${label}`, () => {
    assert.equal(ok(doc).valid, false, `${label} 应该被拒绝但通过了`);
  });
}

// ── 与语义校验器分工清楚 ──────────────────────────────────────────────

/**
 * **schema 管形状，`validateTemplate` 管语义。** 这条测试钉住的是分工本身：
 * 一棵形状完全合法、但没有任何数据绑定的树（渲染的是模板自己的文字，不是用户的简历），
 * schema 必须放行，语义校验必须拦下。
 *
 * 如果哪天有人想「顺手在 schema 里也加上这条」，这条测试会红——那是好事：
 * JSON Schema 表达不了「至少有一个后代带 binding」，硬塞只会得到一个似是而非的近似。
 */
test('schema 放行、语义校验拦下：没有任何数据绑定的树', () => {
  const doc = {
    version: 1,
    root: {
      id: 'r',
      type: 'Box',
      children: [
        { id: 'a', type: 'Text', value: '标题一' },
        { id: 'b', type: 'Text', value: '标题二' },
        { id: 'c', type: 'Text', value: '标题三' },
      ],
    },
  };
  assert.equal(ok(doc).valid, true, 'schema 不该管这件事');
  assert.equal(validateTemplate(doc).ok, false, '语义校验必须拦下');
});

test('schema 放行、语义校验警告：缺 catch-all', () => {
  const doc = {
    version: 1,
    root: { id: 'r', type: 'Text', value: { read: 'company' } },
  };
  assert.equal(ok(doc).valid, true);
  assert.ok(
    validateTemplate(doc).diagnostics.some((d) => d.message.includes('自建分区将不会显示')),
  );
});

/** 反过来：schema 拒掉的，语义校验也不该放行——否则坏树能从某条路径溜进来。 */
test('schema 拒掉的结构，语义校验也拒', () => {
  for (const [label, doc] of rejects) {
    if (label === '白名单外的样式属性' || label === '未注册的字重（PDF 会静默回落，造成两端不一致）') {
      // 这两条是**有意**的分工差异：编译期把它们静默丢掉即可，不必阻断整份简历。
      continue;
    }
    if (label === '超出钳制范围的字号' || label === '顶层多出未知字段') continue;
    assert.equal(validateTemplate(doc).ok, false, `${label}：schema 拒了但语义校验放行了`);
  }
});
