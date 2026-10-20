import { useTranslation } from 'react-i18next';
import type { WhatsNewLabels } from './whats-new';

export function useWhatsNewLabels(): WhatsNewLabels {
  const { t } = useTranslation();
  return {
    open: t('whatsNew.open'), dismiss: t('whatsNew.dismiss'), close: t('whatsNew.close'),
    back: t('whatsNew.back'), next: t('whatsNew.next'), done: t('whatsNew.done'),
    feature: t('whatsNew.feature'), improvement: t('whatsNew.improvement'),
    highlights: t('whatsNew.highlights'), slides: t('whatsNew.slides'),
    goTo: (index, title) => t('whatsNew.goTo', { index, title }),
    position: (index, total) => t('whatsNew.position', { index, total }),
  };
}
