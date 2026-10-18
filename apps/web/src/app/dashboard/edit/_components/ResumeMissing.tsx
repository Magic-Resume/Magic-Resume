'use client';

import { useTranslation } from 'react-i18next';
import ErrorSurface from '@/components/shared/ErrorSurface';
import { useResumeDocumentStore } from '@/store/resume/document';

/**
 * 列表加载完、里面没有这个 ID，就是不存在。
 *
 * `isStoreLoading` 初始为 true，只有 `loadResumes` 走完才落 false，所以落 false 之后的列表
 * 就是权威的——列表为空也照判，否则最后一份简历被删的人打开旧链接会一直卡在骨架屏。
 */
export function useResumeMissing(id: string) {
  const { resumes, isStoreLoading } = useResumeDocumentStore();
  return !isStoreLoading && !resumes.some((r) => r.id === id);
}

/**
 * 编辑页和它的直达子路由（历史、JSON、分享、AI）共用这一屏。
 * 和 404 同一套：东西不在，系统没坏。ID 已经在地址栏里，正文不再念一遍。
 */
export default function ResumeMissing() {
  const { t } = useTranslation();
  return (
    <ErrorSurface
      variant="missing"
      fill="screen"
      title={t('editPage.errors.resumeNotFound')}
      note={t('editPage.errors.resumeNotFoundDescription')}
      primary={{ label: t('errorPage.actions.backToResumes'), href: '/dashboard' }}
      secondary={{
        label: t('editPage.errors.goBack'),
        onClick: () => window.history.back(),
      }}
    />
  );
}
