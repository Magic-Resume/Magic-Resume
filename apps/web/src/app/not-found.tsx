'use client';

import { useTranslation } from 'react-i18next';
import ErrorSurface from '@/components/shared/ErrorSurface';

/**
 * 404 不是故障：没有东西坏掉，也没有数据风险。所以它和错误页共用排版但换一套信号——
 * 小宠的天线照常亮着，不承诺「你的简历没事」（这里根本没出事），也不自动重试。
 */
export default function NotFound() {
  const { t } = useTranslation();

  return (
    <ErrorSurface
      variant="missing"
      fill="screen"
      eyebrow="404"
      title={t('notFoundPage.title')}
      note={t('notFoundPage.description')}
      primary={{ label: t('notFoundPage.buttons.backHome'), href: '/' }}
      secondary={{
        label: t('notFoundPage.buttons.goBack'),
        onClick: () => window.history.back(),
      }}
    />
  );
}
