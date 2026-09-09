/**
 * R2 的 public-dev 域名能直接给 `<img>` 展示，但 bucket 没有 CORS 时浏览器 `fetch`
 * 会被拦。PDF 管线必须读到字节再转 data URL，因此只把我们自己的、版本化的 Logo
 * 对象改走 Web 的同源只读代理；头像和用户手填的任意 URL 仍保持原有路径。
 */
export const pdfImageFetchSource = (src: string): string => {
  try {
    const url = new URL(src);
    if (
      url.protocol === 'https:' &&
      /^pub-[a-f0-9]{32}\.r2\.dev$/i.test(url.hostname) &&
      /^\/logos\/brandfetch-v(?:3|4)\//.test(url.pathname)
    ) {
      return `/api/pdf/logo-image?src=${encodeURIComponent(url.toString())}`;
    }
  } catch {
    // 非 URL（例如相对路径）继续交给原来的 fetch 处理。
  }
  return src;
};
