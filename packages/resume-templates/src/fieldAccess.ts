import get from 'lodash.get';

/**
 * 从简历条目里取字段值，以及把用户填的链接变成安全的 href。
 *
 * ## 为什么在这里而不是 `templateLayout/utils.ts`
 *
 * 这三个函数原本只在屏幕渲染器里，PDF 渲染器各自重写了一份。**两份漂了**：
 *
 * | | 屏幕原实现 | PDF 原实现 |
 * |---|---|---|
 * | 取值 | `lodash.get`，支持 `a[0].b` | `path.split('.')`，只支持点号 |
 * | 假值 | `if (value)` —— **跳过 `0`** | 保留 `0` |
 * | 取不到 | `null`（可编辑性的信号） | `''` |
 * | 链接 | 拒绝非 http(s) → 渲染成纯文本 | **无脑加 `https://` 前缀** |
 *
 * 最后一行是个安全洞：`javascript:alert(1)` 在 PDF 里会变成 `https://javascript:alert(1)`
 * 并生成一个活的 `<Link>`。而这些链接是用户填的，还会出现在公开分享页上。
 *
 * 放在两个渲染器都够得到、又不含 React/lucide 的中立位置，让「只有一份」成为结构事实。
 */

interface Item {
  [key: string]: unknown;
}

/**
 * 一个候选值算不算"有值"。
 *
 * **`0` 算，`false` 不算。** 两份旧实现在这里分歧最大：屏幕用 `if (value)` 把 `0`
 * 一并跳过，于是用户填的 `level: 0` 在屏幕上凭空消失、在 PDF 里却打印出来。
 *
 * 简历里的 `0` 是合法内容（一个分数、一个数量），必须保留；而 `false` 印在简历上
 * 从来不是对的，跳过它继续找下一个候选。
 */
const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '' && value !== false;

/**
 * 按候选链取第一个有值的字段。
 *
 * 候选链的顺序是承重的：`['summary', 'description']` 里 `summary` 在前，因为那是编辑器
 * 真正写入的字段；`description` 垫后只为让旧导入的数据还能显示。
 */
export const getFieldValue = (
  item: Item,
  field: string | string[] | undefined,
): string | null => {
  const entry = getFieldEntry(item, field);
  return entry ? entry.value : null;
};

/**
 * 同 {@link getFieldValue}，但同时告诉你**是哪个具体的键**产出了这个值。
 *
 * 就地编辑靠它把改动锚回正确的属性：fieldMap 里的 `description` 只是显示别名，
 * 而真正能写回的键可能是 `summary`。写错就是——改了但页面没变。
 *
 * ⚠️ 返回的 `key` 必须是**顶层可赋值属性名**。写回路径做的是 `item[key] = …`，
 * 不解析深路径；若这里返回 `'meta.summary'`，会凭空创建一个名为 `"meta.summary"`
 * 的属性，编辑静默丢失。今天安全只因所有 fieldMap 都用扁平键。
 */
export const getFieldEntry = (
  item: Item,
  field: string | string[] | undefined,
): { key: string; value: string } | null => {
  if (!field) return null;
  const fields = Array.isArray(field) ? field : [field];
  for (const candidate of fields) {
    const value = get(item, candidate);
    if (hasValue(value)) return { key: candidate, value: String(value) };
  }
  return null;
};

/**
 * 把用户填的链接变成可用的 href，不可信就回 `null`。
 *
 * 只放行 http(s)；看起来像域名的补上 `https://`；其余（`javascript:`、`data:`、
 * `vbscript:`、协议相对的 `//evil.com`）一律拒绝。**调用方拿到 `null` 必须渲染成纯文本**，
 * 而不是渲染一个不能点的链接。
 *
 * 这是公开分享页上用户自填链接的 XSS 闸门——两个渲染器都必须走它。
 */
export const safeHref = (value: string | undefined | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.)?[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/.*)?$/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null;
};
