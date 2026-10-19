import type { Resume } from '@/types/frontend/resume';

/**
 * 管理后台「简历库」看用户简历时用的嵌入协议。
 *
 * 后台把某个版本的内容 postMessage 进 `/embed/resume-preview`，这一页只用编辑器同一条
 * PDF 管线把它渲染出来：自己不取数据、不需要登录，能看到什么完全取决于父页面传了什么。
 * 所以唯一要守的是「谁传的」——只收白名单里的后台来源。
 */
export const PREVIEW_READY = 'magic-resume:preview-ready';
export const PREVIEW_RESUME = 'magic-resume:preview';
export const PREVIEW_INVALID = 'magic-resume:preview-invalid';
export const PREVIEW_REFUSED = 'magic-resume:preview-refused';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** `ADMIN_PUBLIC_URL` 可以用逗号列出多个后台地址（如正式与 beta）；解析不了的直接丢弃。 */
export function adminOrigins(value: string | undefined): string[] {
  return (value ?? '').split(',').flatMap((raw) => {
    try {
      const url = new URL(raw.trim());
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? [url.origin]
        : [];
    } catch {
      return [];
    }
  });
}

/** 本地开发放行任意 localhost 端口，省掉一项本地配置；生产只认白名单。 */
export function isAllowedParent(
  origin: string,
  allowed: readonly string[],
  development: boolean,
): boolean {
  if (allowed.includes(origin)) return true;
  if (!development) return false;
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** 与分享页的读法一致：先铺版本内容，再补渲染器必需的字段。旧版本存的是 JSON 字符串。 */
export function previewResume(content: unknown): Resume | null {
  let data = content;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const resume = data as Partial<Resume>;
  return {
    ...resume,
    id: typeof resume.id === 'string' ? resume.id : 'preview',
    updatedAt: typeof resume.updatedAt === 'number' ? resume.updatedAt : 0,
    sections:
      resume.sections && typeof resume.sections === 'object'
        ? resume.sections
        : {},
    sectionOrder: Array.isArray(resume.sectionOrder) ? resume.sectionOrder : [],
  } as Resume;
}
