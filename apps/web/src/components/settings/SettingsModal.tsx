'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  RiBellLine,
  RiBrainLine,
  RiCloudLine,
  RiPlugLine,
  RiRobot2Line,
  RiSettings6Line,
  type RemixiconComponentType,
} from '@remixicon/react';
import { Cloud } from '@magic-resume/icons';
import { Badge as DesignBadge } from '@magic-resume/design-system/react';
import { cx } from '@magic-resume/design-system/cx';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  SettingsModalShell,
  type SettingsModalNavItem,
} from '@/components/application/settings/settings-modal';
import { Button } from '@/components/ui/product-button';
import { Select, SelectItem } from '@/components/ui/product-select';
import { Switch } from '@/components/ui/product-switch';
import {
  SettingsCard as SettingsCard,
  SettingsRow as SettingsRow,
} from '@/components/application/settings/settings-rows';
import { ModelConfigFields } from '@/components/llm/ModelConfigFields';
import { McpAccessSection } from '@/app/dashboard/settings/_components/McpAccessSection';
import { MemorySection } from '@/app/dashboard/settings/_components/MemorySection';
import { JobProfileSection } from '@/app/dashboard/settings/_components/JobProfileSection';
import { NotificationPreferencesSection } from '@/app/dashboard/settings/_components/NotificationPreferencesSection';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSettingStore } from '@/store/useSettingStore';
import { setPreferredLanguage } from '@/i18n';
import {
  useTheme,
  type ThemePreference,
} from '@/components/providers/ThemeProvider';
import {
  useAccountUiStore,
  type SettingsSection,
} from '@/store/useAccountUiStore';
import { isCloudMode } from '@/lib/config/app';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

type Category = {
  key: SettingsSection;
  labelKey: string;
  icon: RemixiconComponentType;
  cloudOnly?: boolean;
};

const CATEGORIES: Category[] = [
  {
    key: 'general',
    labelKey: 'account.settings.nav.general',
    icon: RiSettings6Line,
  },
  { key: 'model', labelKey: 'account.settings.nav.model', icon: RiRobot2Line },
  {
    key: 'cloudSync',
    labelKey: 'account.settings.nav.cloudSync',
    icon: RiCloudLine,
    cloudOnly: true,
  },
  {
    key: 'memory',
    labelKey: 'account.settings.nav.memory',
    icon: RiBrainLine,
    cloudOnly: true,
  },
  {
    key: 'mcp',
    labelKey: 'account.settings.nav.mcp',
    icon: RiPlugLine,
    cloudOnly: true,
  },
  {
    key: 'notifications',
    labelKey: 'account.settings.nav.notifications',
    icon: RiBellLine,
    cloudOnly: true,
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Product settings hosted in the canonical settings modal shell. The installed
 * cards, rows, selects, switches and buttons provide the visual system; the
 * existing stores and feature sections remain the sole owners of behavior.
 * Cloud-only categories are still filtered in self-hosted mode.
 */
export function SettingsModal() {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const { theme, setTheme } = useTheme();
  const { settingsOpen, settingsSection, closeSettings, openSettings } =
    useAccountUiStore();
  const {
    cloudSync,
    syncDisclaimerAgreed,
    setCloudSync,
    setSyncDisclaimerAgreed,
    hasLlmConfig,
    provider,
    isDirty,
    saveSettings,
    resetSettings,
    loadSettings,
  } = useSettingStore();

  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Refresh the saved baseline each time the modal opens.
  useEffect(() => {
    if (settingsOpen) loadSettings();
  }, [settingsOpen, loadSettings]);

  const categories = useMemo(
    () => CATEGORIES.filter((c) => !c.cloudOnly || isCloudMode),
    [],
  );
  const active = categories.some((c) => c.key === settingsSection)
    ? settingsSection
    : 'general';
  const currentLang = i18n.language.startsWith('en') ? 'en' : 'zh';

  const handleSave = () => {
    saveSettings();
    toast.success(t('settings.notifications.settingsSaved'));
    appLifecycle.settingsSaved({ section: active });
    // Which provider was picked — never the key, the base URL, or the model.
    if (hasLlmConfig()) appLifecycle.settingsApiKeyConfigured({ provider });
  };
  const handleReset = () => {
    resetSettings();
    toast.info(t('settings.notifications.changesReset'));
  };
  const handleCloudSyncToggle = (checked: boolean) => {
    // Turning it on may stop at the disclaimer, so the event belongs where the
    // setting actually changes — here for the paths that apply it directly,
    // and in the disclaimer confirm below for the one that does not.
    if (checked && !syncDisclaimerAgreed) setShowDisclaimer(true);
    else {
      setCloudSync(checked);
      appLifecycle.settingsCloudSyncToggled({ enabled: checked });
    }
  };
  const handleConfirmDisclaimer = () => {
    setSyncDisclaimerAgreed(true);
    setCloudSync(true);
    setShowDisclaimer(false);
    appLifecycle.settingsCloudSyncToggled({ enabled: true });
  };

  const modalItems = useMemo<SettingsModalNavItem<SettingsSection>[]>(
    () =>
      categories.map(({ key, labelKey, icon }) => ({
        page: key,
        label: t(labelKey),
        icon,
      })),
    [categories, t],
  );
  const activeTitle =
    modalItems.find((item) => item.page === active)?.label ??
    t('account.settings.title');

  return (
    <>
      <SettingsModalShell
        isOpen={settingsOpen}
        onClose={closeSettings}
        activePage={active}
        onPageChange={openSettings}
        title={activeTitle}
        closeLabel={t('common.close')}
        navigationLabel={t('account.settings.title')}
        items={modalItems}
        headerAccessory={
          active === 'model' ? (
            hasLlmConfig() ? (
              <StatusBadge tone="ready">
                {t('settings.llm.statusReady')}
              </StatusBadge>
            ) : (
              <StatusBadge tone="pending">
                {t('settings.llm.statusNotConfigured')}
              </StatusBadge>
            )
          ) : undefined
        }
        footer={
          <AnimatePresence>
            {isDirty && (
              <motion.div
                initial={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
                animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="border-separator-border bg-background-full flex shrink-0 items-center gap-3 border-t px-5 py-3 sm:px-8"
              >
                <span className="bg-accent-500 h-1.5 w-1.5 rounded-full" />
                <p className="text-body-2-regular text-text-secondary mr-auto">
                  {t('settings.notifications.unsavedChanges')}
                </p>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={handleReset}
                >
                  {t('settings.buttons.reset')}
                </Button>
                <Button
                  variant="primary"
                  size="small"
                  onClick={handleSave}
                >
                  {t('settings.buttons.save')}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            {active === 'general' && (
              <Pane
                title={t('account.settings.nav.general')}
                description={t('account.settings.general.description')}
              >
                <SettingsCard className="mt-5">
                  <SettingsRow
                    label={t('account.settings.general.appearance')}
                    description={t(
                      'account.settings.general.appearanceDescription',
                    )}
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
                    description={t(
                      'account.settings.general.languageDescription',
                    )}
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
            )}

            {active === 'model' && (
              <Pane
                title={t('account.settings.nav.model')}
                description={t('settings.llm.description')}
              >
                <div className="mt-6">
                  <ModelConfigFields />
                </div>
              </Pane>
            )}

            {active === 'cloudSync' && isCloudMode && (
              <Pane
                title={t('account.settings.nav.cloudSync')}
                description={t('settings.cloudSync.description')}
              >
                <SettingsCard className="mt-5">
                  <SettingsRow
                    label={t('settings.cloudSync.toggleLabel')}
                    description={
                      cloudSync
                        ? t('settings.cloudSync.statusOn')
                        : t('settings.cloudSync.statusOff')
                    }
                  >
                    <Switch
                      aria-label={t('settings.cloudSync.toggleLabel')}
                      isSelected={cloudSync}
                      onChange={handleCloudSyncToggle}
                    />
                  </SettingsRow>
                </SettingsCard>
              </Pane>
            )}

            {active === 'memory' && isCloudMode && (
              <Pane
                title={t('account.settings.nav.memory')}
                description={t('settings.memory.description')}
              >
                {/* 两层：上面是用户亲口说的那份画像，下面是 AI 推断出来的条目。
                        相邻而分栏本身就说清了差别，分成两页反而要用文案再解释一遍
                        （brief §11a）。 */}
                <JobProfileSection />
                <MemorySection />
              </Pane>
            )}

            {active === 'mcp' && isCloudMode && (
              <Pane
                title={t('account.settings.nav.mcp')}
                description={t('settings.mcp.description')}
              >
                <div className="mt-6 [&_section]:mx-0 [&_section]:max-w-none">
                  <McpAccessSection showHeader={false} />
                </div>
              </Pane>
            )}

            {active === 'notifications' && isCloudMode && (
              <Pane
                title={t('account.settings.nav.notifications')}
                description={t('settings.notificationPreferences.description')}
              >
                <NotificationPreferencesSection />
              </Pane>
            )}
          </motion.div>
        </AnimatePresence>
      </SettingsModalShell>

      {/* Cloud Sync disclaimer — nested dialog, same flow as the settings page */}
      <Dialog open={showDisclaimer} onOpenChange={setShowDisclaimer}>
        <DialogContent
          overlayClassName="z-[120]"
          className="z-[121] max-w-md rounded-2xl border-neutral-800 bg-neutral-900 text-white"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Cloud className="h-6 w-6 text-sky-400" />
              {t('settings.cloudSync.disclaimer.title')}
            </DialogTitle>
            <DialogDescription className="pt-2 text-neutral-400">
              {t('settings.cloudSync.disclaimer.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 text-sm leading-relaxed text-neutral-300">
            {t('settings.cloudSync.disclaimer.content')}
          </div>
          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <Button
              variant="secondary"
              size="small"
              onClick={() => setShowDisclaimer(false)}
              className="text-text-secondary"
            >
              {t('settings.cloudSync.disclaimer.cancel')}
            </Button>
            <Button
              variant="primary"
              size="small"
              onClick={handleConfirmDisclaimer}
            >
              {t('settings.cloudSync.disclaimer.agree')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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

/** Small status pill — reserves emerald/amber only for genuine readiness semantics. */
function StatusBadge({
  tone,
  children,
}: {
  tone: 'ready' | 'pending';
  children: React.ReactNode;
}) {
  const badgeTone = tone === 'ready' ? 'success' : 'warning';
  const indicatorTone = tone === 'ready' ? 'bg-mr-success' : 'bg-mr-warning';
  return (
    <DesignBadge
      tone={badgeTone}
      shape="pill"
      className="text-mr-label h-auto gap-1.5 px-2.5 py-1"
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', indicatorTone)} />
      {children}
    </DesignBadge>
  );
}
