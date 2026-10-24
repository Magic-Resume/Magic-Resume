'use client';

import React, { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RiSettings6Line } from '@remixicon/react';
import { useTranslation } from 'react-i18next';
import {
  SettingsModalShell,
  type SettingsModalNavItem,
} from '@/components/application/settings/settings-modal';
import { Select, SelectItem } from '@/components/ui/product-select';
import {
  SettingsCard as SettingsCard,
  SettingsRow as SettingsRow,
} from '@/components/application/settings/settings-rows';
import { setPreferredLanguage } from '@/i18n';
import {
  useTheme,
  type ThemePreference,
} from '@/components/providers/ThemeProvider';
import { useSettingsUiStore } from '@/store/useSettingsUiStore';

type SettingsSection = 'general';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Settings hosted in the canonical settings modal shell. Appearance and
 * language apply as soon as they change, so there is nothing to save.
 */
export function SettingsModal() {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const { theme, setTheme } = useTheme();
  const { settingsOpen, closeSettings } = useSettingsUiStore();
  const currentLang = i18n.language.startsWith('en') ? 'en' : 'zh';

  const modalItems = useMemo<SettingsModalNavItem<SettingsSection>[]>(
    () => [
      {
        page: 'general',
        label: t('account.settings.nav.general'),
        icon: RiSettings6Line,
      },
    ],
    [t],
  );

  return (
    <SettingsModalShell
      isOpen={settingsOpen}
      onClose={closeSettings}
      activePage="general"
      onPageChange={() => {}}
      title={t('account.settings.nav.general')}
      closeLabel={t('common.close')}
      navigationLabel={t('account.settings.title')}
      items={modalItems}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key="general"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          <Pane
            title={t('account.settings.nav.general')}
            description={t('account.settings.general.description')}
          >
            <SettingsCard className="mt-5">
              <SettingsRow
                label={t('account.settings.general.appearance')}
                description={t('account.settings.general.appearanceDescription')}
              >
                <Select
                  aria-label={t('account.settings.general.appearance')}
                  selectedKey={theme}
                  onSelectionChange={(key) =>
                    setTheme(String(key) as ThemePreference)
                  }
                  triggerClassName="h-8 min-w-[104px] gap-1 rounded-lg px-2 py-1.5"
                  popoverClassName="w-[180px]"
                >
                  <SelectItem id="dark">
                    {t('account.settings.general.appearanceDark')}
                  </SelectItem>
                  <SelectItem id="light">
                    {t('account.settings.general.appearanceLight')}
                  </SelectItem>
                  <SelectItem id="system">
                    {t('account.settings.general.appearanceSystem')}
                  </SelectItem>
                </Select>
              </SettingsRow>
              <SettingsRow
                label={t('account.settings.general.language')}
                description={t('account.settings.general.languageDescription')}
              >
                <Select
                  aria-label={t('account.settings.general.language')}
                  selectedKey={currentLang}
                  onSelectionChange={(key) =>
                    setPreferredLanguage(String(key) as 'en' | 'zh')
                  }
                  triggerClassName="h-8 min-w-[104px] gap-1 rounded-lg px-2 py-1.5"
                  popoverClassName="w-[180px]"
                >
                  <SelectItem id="en">
                    {t('account.settings.general.languageEnglish')}
                  </SelectItem>
                  <SelectItem id="zh">
                    {t('account.settings.general.languageChinese')}
                  </SelectItem>
                </Select>
              </SettingsRow>
            </SettingsCard>
          </Pane>
        </motion.div>
      </AnimatePresence>
    </SettingsModalShell>
  );
}

function Pane({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full max-w-[640px] flex-col">
      <h3 className="sr-only">{title}</h3>
      {description && (
        <p className="text-body-2-regular text-text-secondary max-w-[58ch]">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
