import { NODE_TYPES, PAGE_MODES, PAGE_SIZES } from './ast';
import { ALLOWED_FONT_WEIGHTS, ALLOWED_STYLE_KEYS, CLAMPS } from './style';

/**
 * 模板文档的 JSON Schema。**给第 4 期的 AI 复刻用**——受约束解码要吃它。
 *
 * ## 它保证什么，不保证什么
 *
 * 只保证**结构**。业界实测：**结构化输出保证 schema，不保证质量**——某管线
 * schema 合法率 99.4%，但约 11% 的结果语义上是错的，因为受约束解码屏蔽掉模型
 * 偏好的 token 之后，它会塌陷到「能满足语法的安全默认值」。**加严 schema 有时
 * 反而制造问题。**
 *
 * 所以分工是清楚的：
 *
 * | 层 | 管什么 | 在哪 |
 * |---|---|---|
 * | JSON Schema | 形状：字段名、类型、枚举 | 本文件 |
 * | `validateTemplate` | 语义：有没有绑定、有没有 catch-all、是不是把用户内容写死了 | `validate.ts` |
 * | `compile` | 运行期降级：取不到值、路径写错、嵌套过深 | `compile.ts` |
 * | 溢出自检 | 画出来之后放不放得下 | `overflow.ts` |
 *
 * 少了任何一层都会漏掉一整类问题。只上 schema 是最常见的错误做法。
 *
 * ## 递归怎么表达
 *
 * 节点是递归的（Box 套 Box），用 `$ref: '#/$defs/node'`。**不要展开成有限层数**——
 * 展开会让 schema 体积爆炸，而且给模型一个「最多能嵌几层」的错误暗示。
 */

/** 数值属性的取值范围，直接来自编译期的钳制表——两处若不一致，schema 就在撒谎。 */
const numericBounds = (): Record<string, { type: 'number'; minimum: number; maximum: number }> =>
  Object.fromEntries(
    Object.entries(CLAMPS).map(([key, [min, max]]) => [
      key,
      { type: 'number' as const, minimum: min, maximum: max },
    ]),
  );

const styleObject = () => ({
  type: 'object' as const,
  // 白名单之外的属性在编译期会被静默丢掉。写进 schema 是为了让模型**一开始就别生成**——
  // 生成了再丢，模型不会知道自己错了，下一轮还会再生成一次。
  additionalProperties: false,
  properties: {
    ...Object.fromEntries(ALLOWED_STYLE_KEYS.map((k) => [k, {}])),
    ...numericBounds(),
    fontWeight: {
      // 未注册的字重不会抛，它**静默回落**——于是浏览器与 PDF 长得不一样却都不报错。
      // 这条枚举挡的是那种漂移，不是审美偏好。理由详见 `style.ts`。
      type: 'number' as const,
      enum: [...ALLOWED_FONT_WEIGHTS].sort((a, b) => a - b),
    },
  },
});

const condition = () => ({
  $ref: '#/$defs/condition',
});

export const templateJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://magic-resume.dev/schemas/template-document.json',
  title: 'Magic Resume 模板文档',
  type: 'object',
  required: ['version', 'root'],
  additionalProperties: false,
  properties: {
    version: { const: 1 },
    styles: {
      description: '样式字典。节点用名字引用，避免同样几个属性在几十个节点上重复。',
      type: 'object',
      additionalProperties: { $ref: '#/$defs/style' },
    },
    page: { $ref: '#/$defs/page' },
    root: { $ref: '#/$defs/node' },
  },

  $defs: {
    style: styleObject(),

    styleRef: {
      description: '样式字典里的名字，或一个内联样式对象。',
      anyOf: [{ type: 'string' }, { $ref: '#/$defs/style' }],
    },

    binding: {
      type: 'object',
      required: ['read'],
      additionalProperties: false,
      properties: {
        read: {
          description: '取值路径，或候选链（按顺序取第一个有值的）。',
          anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, minItems: 1 }],
        },
        write: {
          description:
            '可写键。必须是顶层可赋值属性名——写回做的是 item[fieldKey] = …，不解析深路径。',
          type: 'string',
          pattern: '^[^.\\[\\]]+$',
        },
        fallback: { type: 'string' },
      },
    },

    value: {
      description: '字面量（支持 {{path}} 插值）或绑定。',
      anyOf: [{ type: 'string' }, { $ref: '#/$defs/binding' }],
    },

    condition: {
      anyOf: [
        { type: 'object', required: ['exists'], additionalProperties: false, properties: { exists: { type: 'string' } } },
        {
          type: 'object',
          required: ['equals'],
          additionalProperties: false,
          properties: {
            equals: {
              type: 'array',
              minItems: 2,
              maxItems: 2,
              prefixItems: [{ type: 'string' }, { type: ['string', 'number', 'boolean'] }],
            },
          },
        },
        { type: 'object', required: ['not'], additionalProperties: false, properties: { not: condition() } },
        { type: 'object', required: ['and'], additionalProperties: false, properties: { and: { type: 'array', items: condition() } } },
        { type: 'object', required: ['or'], additionalProperties: false, properties: { or: { type: 'array', items: condition() } } },
        { type: 'object', required: ['isFirst'], additionalProperties: false, properties: { isFirst: { const: true } } },
        { type: 'object', required: ['isLast'], additionalProperties: false, properties: { isLast: { const: true } } },
      ],
    },

    page: {
      description: '分页设置。省略即单页随内容长高（既有 19 个模板的行为）。',
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: { enum: [...PAGE_MODES] },
        size: { enum: [...PAGE_SIZES] },
        margin: { type: 'number', minimum: 0, maximum: 120 },
      },
    },

    listItem: {
      type: 'object',
      required: ['value'],
      additionalProperties: false,
      properties: {
        value: { $ref: '#/$defs/value' },
        level: { type: 'integer', minimum: 0, maximum: 3 },
      },
    },

    node: {
      type: 'object',
      required: ['id', 'type'],
      properties: {
        id: {
          description: '模板内稳定且唯一。设计模式与就地编辑都靠它定位。',
          type: 'string',
          minLength: 1,
        },
        type: { enum: [...NODE_TYPES] },

        // ── 属性（挂在任意节点上） ──
        each: {
          description:
            '迭代。**是属性不是节点**——做成节点会让父容器只收到一个 flex 子元素而不是 N 个。',
          type: 'object',
          required: ['path'],
          additionalProperties: false,
          properties: {
            path: { type: 'string', minLength: 1 },
            as: { type: 'string', minLength: 1 },
          },
        },
        when: condition(),
        style: { type: 'array', items: { $ref: '#/$defs/styleRef' } },
        href: { $ref: '#/$defs/value' },
        spacing: { enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl'] },
        keepTogether: { type: 'boolean' },
        fallback: {
          description: "未知类型或校验失败时的降级。'drop' 表示整块丢掉且不向上冒泡。",
          anyOf: [{ const: 'drop' }, { $ref: '#/$defs/node' }],
        },
        section: {
          description: '声明这个 Box 是某个分区的外壳，于是它获得手柄与插入槽。',
          type: 'object',
          required: ['sectionKey'],
          additionalProperties: false,
          properties: {
            sectionKey: { type: 'string', minLength: 1 },
            title: { type: 'string' },
            handle: { type: 'boolean' },
            insertSlot: { type: 'boolean' },
          },
        },

        // ── 各类型自己的字段 ──
        children: { type: 'array', items: { $ref: '#/$defs/node' } },
        separator: { $ref: '#/$defs/node' },
        value: { $ref: '#/$defs/value' },
        role: { enum: ['title', 'sectionHeading', 'body', 'caption'] },
        ordered: { type: 'boolean' },
        items: { type: 'array', items: { $ref: '#/$defs/listItem' } },
        src: { $ref: '#/$defs/value' },
        width: { type: 'number', minimum: 0 },
        height: { type: 'number', minimum: 0 },
        fit: { enum: ['cover', 'contain'] },
        // 自定义分区可从 `$unhandledSections` 的当前条目读取 `icon`。
        name: { $ref: '#/$defs/value' },
        size: { type: 'number', minimum: 1 },
      },

      // 各类型的必填字段。用 if/then 而不是 oneOf：oneOf 在校验失败时给出的是
      // 「N 个分支全都不匹配」，指不到具体哪一条错了，对模型的修正毫无帮助。
      allOf: [
        {
          if: { properties: { type: { enum: ['Text', 'RichText'] } }, required: ['type'] },
          then: { required: ['value'] },
        },
        { if: { properties: { type: { const: 'List' } }, required: ['type'] }, then: { required: ['items'] } },
        { if: { properties: { type: { const: 'Image' } }, required: ['type'] }, then: { required: ['src'] } },
        { if: { properties: { type: { const: 'Icon' } }, required: ['type'] }, then: { required: ['name'] } },
      ],
    },
  },
} as const;
