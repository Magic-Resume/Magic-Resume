import type { Resume } from '../types/resume';

/**
 * 导出前把简历里每个图片来源换成 react-pdf 一定画得出来的形式。
 *
 * ## 为什么这一层非有不可
 *
 * react-pdf 有三条硬约束，而**三条的失败都是静默的**：只认 jpg/png/svg（ico、webp、
 * gif 一概不认）；浏览器里用 `fetch` 拉远程图，所以需要 CORS；失败只落一条
 * `console.warn`，render 端 `if (!node.image?.data) return`。合起来的表现是
 * 「屏幕上有、导出的 PDF 里没有，且不报错」。
 *
 * ## 为什么遍历和转码分开
 *
 * 转码要 canvas 与 `window.Image`，只能在浏览器里跑；而**遍历才是容易写错的那部分**
 * （漏一条路径就等于漏一类图）。把 `convert` 作为参数注入，遍历就能在 node 里测。
 */
export type ImageConverter = (src: string, mime: string) => Promise<string>;

/**
 * 简历数据里那些**会被模板当图片绑定**的字段。
 *
 * 白名单而不是「看着像 URL 就转」：后者会把用户写在正文里的链接一并抓下来。
 */
export const BOUND_IMAGE_FIELDS = ['companyLogo'] as const;

/** logo 转 PNG 而非 JPEG：JPEG 无 alpha，白底会让透明 logo 在深色版式上变成白斑。 */
const LOGO_MIME = 'image/png';

/**
 * 递归改写模板树里每个 `Image` 节点的字面量 `src`。
 *
 * 只覆盖字面量：`{ read: 'companyLogo' }` 这类绑定要到编译期（渲染器内部）才知道值，
 * 这一层够不着。绑定出来的值由 {@link prepareBoundImageFields} 在简历数据侧处理——
 * 两边都要做，漏了任一边都是「屏幕上有、PDF 里没有」。
 */
export async function prepareTemplateImages(
  node: unknown,
  convert: ImageConverter,
): Promise<unknown> {
  if (Array.isArray(node)) {
    return Promise.all(node.map((child) => prepareTemplateImages(child, convert)));
  }
  if (!node || typeof node !== 'object') return node;

  const record = node as Record<string, unknown>;
  const entries = await Promise.all(
    Object.entries(record).map(async ([key, value]): Promise<[string, unknown]> => {
      const isImageSrc =
        key === 'src' && typeof value === 'string' && record.type === 'Image';
      if (!isImageSrc) return [key, await prepareTemplateImages(value, convert)];
      // 单张图失败只丢这一张 —— 空 `src` 的 Image 节点会被编译期整个丢弃，版面自动
      // 收拢，而不是让整份简历导不出来。
      const src = await convert(value as string, LOGO_MIME).catch(() => '');
      return [key, src];
    }),
  );
  return Object.fromEntries(entries);
}

/** 把 `sections[*][i].companyLogo` 这类绑定用的图片字段一并转成 PDF 画得出来的形式。 */
export async function prepareBoundImageFields(
  sections: Resume['sections'],
  convert: ImageConverter,
): Promise<Resume['sections']> {
  const entries = await Promise.all(
    Object.entries(sections ?? {}).map(async ([key, items]) => {
      if (!Array.isArray(items)) return [key, items] as const;
      const prepared = await Promise.all(
        items.map(async (item) => {
          if (!item || typeof item !== 'object') return item;
          let next = item;
          for (const field of BOUND_IMAGE_FIELDS) {
            const value = (next as Record<string, unknown>)[field];
            if (typeof value !== 'string' || !value) continue;
            const src = await convert(value, LOGO_MIME).catch(() => '');
            next = { ...next, [field]: src };
          }
          return next;
        }),
      );
      return [key, prepared] as const;
    }),
  );
  return Object.fromEntries(entries) as Resume['sections'];
}
