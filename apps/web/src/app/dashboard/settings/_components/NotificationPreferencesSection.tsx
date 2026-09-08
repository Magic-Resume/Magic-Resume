'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/product-switch';
import {
  SettingsCard,
  SettingsRow,
} from '@/components/application/settings/settings-rows';
import { notificationsApi, type NotificationPreference } from '@/lib/api/notifications';

const CATEGORIES: NotificationPreference['category'][] = [
  'COLLABORATION',
  'SUPPORT',
  'TIMELINE',
  'ANNOUNCEMENT',
];

export function NotificationPreferencesSection() {
  const { t } = useTranslation();
  const [items, setItems] = useState<NotificationPreference[]>([]);
  const [saving, setSaving] = useState<NotificationPreference['category'] | null>(null);

  useEffect(() => {
    let active = true;
    void notificationsApi.getPreferences()
      .then((next) => active && setItems(next))
      .catch(() => active && toast.error(t('settings.notificationPreferences.loadFailed')));
    return () => { active = false; };
  }, [t]);

  const isEnabled = (category: NotificationPreference['category']) =>
    items.find((item) => item.category === category)?.emailEnabled ?? true;

  const update = async (category: NotificationPreference['category'], emailEnabled: boolean) => {
    const previous = items;
    const next = CATEGORIES.map((nextCategory) => ({
      category: nextCategory,
      emailEnabled: nextCategory === category ? emailEnabled : isEnabled(nextCategory),
    }));
    setItems(next);
    setSaving(category);
    try {
      setItems(await notificationsApi.updatePreferences(next));
    } catch {
      setItems(previous);
      toast.error(t('settings.notificationPreferences.saveFailed'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mt-5 flex flex-col gap-3">
      <SettingsCard>
        {CATEGORIES.map((category) => (
          <SettingsRow
            key={category}
            label={t(`settings.notificationPreferences.${category}.label`)}
            description={t(`settings.notificationPreferences.${category}.description`)}
          >
          <Switch
            aria-label={t(`settings.notificationPreferences.${category}.label`)}
            isSelected={isEnabled(category)}
            isDisabled={saving !== null}
            onChange={(checked) => void update(category, checked)}
          />
          </SettingsRow>
        ))}
      </SettingsCard>
      <p className="px-3 text-body-2-regular text-text-tertiary">
        {t('settings.notificationPreferences.requiredNote')}
      </p>
    </div>
  );
}
