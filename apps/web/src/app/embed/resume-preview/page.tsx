import type { Metadata } from 'next';
import { adminOrigins } from '@/lib/embed/resumePreview';
import { ResumePreviewEmbed } from './ResumePreviewEmbed';

// 和 APP_PUBLIC_URL 一样在请求时读取：同一个镜像换环境不用重新构建。
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Resume preview',
  robots: { index: false, follow: false },
};

/** 只给管理后台嵌入用；直接打开是一张空桌面。协议见 `@/lib/embed/resumePreview`。 */
export default function ResumePreviewEmbedPage() {
  return (
    <ResumePreviewEmbed
      allowedOrigins={adminOrigins(process.env.ADMIN_PUBLIC_URL)}
      development={process.env.NODE_ENV !== 'production'}
    />
  );
}
