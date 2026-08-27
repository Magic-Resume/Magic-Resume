'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
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
    <div className="mt-6 divide-y divide-white/[0.06]">
      {CATEGORIES.map((category) => (
        <div key={category} className="flex items-center justify-between gap-5 py-4 first:pt-0">
          <div>
            <p className="text-sm font-medium text-neutral-100">{t(`settings.notificationPreferences.${category}.label`)}</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">{t(`settings.notificationPreferences.${category}.description`)}</p>
          </div>
          <Switch
            checked={isEnabled(category)}
            disabled={saving !== null}
            onCheckedChange={(checked) => void update(category, checked)}
            aria-label={t(`settings.notificationPreferences.${category}.label`)}
          />
        </div>
      ))}
      <p className="pt-4 text-xs leading-relaxed text-neutral-500">
        {t('settings.notificationPreferences.requiredNote')}
      </p>
    </div>
  );
}
