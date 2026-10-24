import { create } from 'zustand';
import { dbClient } from '@/lib/api/IndexDBClient';
import {
  isProtectedApiKey,
  protectApiKey,
  revealApiKey,
} from '@/lib/security/byokVault';
import {
  CUSTOM_PROVIDER_ID,
  DEFAULT_MAX_TOKENS,
  deriveProviderId,
  getProvider,
} from '@/lib/constants/modals';

// 移除立即初始化，改为懒加载
let dbInitialized = false;
const ensureDbInitialized = async () => {
  if (!dbInitialized && typeof window !== 'undefined') {
    try {
      await dbClient.init();
      dbInitialized = true;
    } catch (err) {
      console.error('Failed to init db for settings', err);
    }
  }
};

/** Reasoning strength ("强度") picked in the AI Lab composer. */
export type Strength = 'low' | 'medium' | 'high';

/**
 * The user's own model (bring-your-own-key). The key is encrypted before it
 * reaches IndexedDB (`byokVault`) and is only ever sent to this app's own AI
 * route handlers, which forward it to the configured AI backend.
 */
interface SettingsData {
  /** selected provider id (see MODEL_PROVIDERS); '' until the user picks one. */
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  /** Composer-picked reasoning strength → reasoning_effort. */
  strength: Strength;
}

interface SettingsState extends SettingsData {
  initialSettings: SettingsData;
  isDirty: boolean;
  /** Pick a provider; preset providers auto-fill baseUrl/model/maxTokens. */
  setProvider: (provider: string) => void;
  setApiKey: (apiKey: string) => void;
  setBaseUrl: (baseUrl: string) => void;
  setModel: (model: string) => void;
  setMaxTokens: (maxTokens: number) => void;
  /** Composer pref — persisted immediately (not part of the Save-form dirty flow). */
  setStrength: (strength: Strength) => void;
  /** True when provider + key + baseUrl + model + maxTokens are all set — AI is usable. */
  hasLlmConfig: () => boolean;
  saveSettings: () => Promise<void>;
  resetSettings: () => void;
  loadSettings: () => Promise<void>;
}

const defaultSettings: SettingsData = {
  // No preset provider/url/model: the user picks a provider first, which fills the rest.
  provider: '',
  apiKey: '',
  baseUrl: '',
  model: '',
  // 16k is the normal generation budget; the 64k hard ceiling stays in the
  // provider field and backend safety cap for exceptional full-document runs.
  maxTokens: DEFAULT_MAX_TOKENS,
  strength: 'medium',
};

const isNonEmpty = (value: unknown) => String(value ?? '').trim().length > 0;

/** Only the fields this store owns; older versions saved more (cloud sync etc.). */
const pickSettings = (source: Partial<SettingsData>): SettingsData => ({
  provider: source.provider ?? defaultSettings.provider,
  apiKey: source.apiKey ?? defaultSettings.apiKey,
  baseUrl: source.baseUrl ?? defaultSettings.baseUrl,
  model: source.model ?? defaultSettings.model,
  maxTokens: source.maxTokens ?? defaultSettings.maxTokens,
  strength: source.strength ?? defaultSettings.strength,
});

const toStoredSettings = async (settings: SettingsData) => ({
  ...settings,
  apiKey: await protectApiKey(settings.apiKey),
});

/**
 * Immediately persist the composer's strength, merged onto the last-saved
 * settings so a mid-edit form (an unsaved key, say) is never clobbered.
 */
const persistStrength = async (strength: Strength) => {
  await ensureDbInitialized();
  const saved = (await dbClient.getItem('settings')) as Partial<SettingsData> | null;
  const storedApiKey = isProtectedApiKey(saved?.apiKey)
    ? saved?.apiKey
    : saved?.apiKey
      ? await protectApiKey(String(saved.apiKey))
      : '';
  await dbClient.setItem('settings', {
    ...pickSettings(saved ?? {}),
    strength,
    apiKey: storedApiKey,
  });
};

export const useSettingStore = create<SettingsState>((set, get) => {
  /** Apply a form edit and recompute whether the form differs from what is saved. */
  const edit = (patch: Partial<SettingsData>) => {
    const next = pickSettings({ ...get(), ...patch });
    set({
      ...patch,
      isDirty: JSON.stringify(next) !== JSON.stringify(get().initialSettings),
    });
  };

  return {
    ...defaultSettings,
    initialSettings: { ...defaultSettings },
    isDirty: false,

    setProvider: (provider) => {
      const meta = getProvider(provider);
      // Preset providers fill in base URL / model / max tokens so the user only
      // needs a key. Custom keeps the user's existing fields (don't wipe them).
      const patch: Partial<SettingsData> = { provider };
      if (meta && provider !== CUSTOM_PROVIDER_ID) {
        patch.baseUrl = meta.baseUrl;
        patch.model = meta.defaultModel;
        patch.maxTokens = meta.defaultMaxTokens;
      }
      edit(patch);
    },
    setApiKey: (apiKey) => edit({ apiKey }),
    setBaseUrl: (baseUrl) => edit({ baseUrl }),
    setModel: (model) => edit({ model }),
    setMaxTokens: (maxTokens) => edit({ maxTokens }),

    // Saved on the spot, so it moves the saved baseline too: changing it never
    // leaves the settings form looking unsaved.
    setStrength: (strength) => {
      set((state) => ({
        strength,
        initialSettings: { ...state.initialSettings, strength },
      }));
      void persistStrength(strength);
    },

    hasLlmConfig: () => {
      const { provider, apiKey, baseUrl, model, maxTokens } = get();
      const tokens = Number(maxTokens);
      return (
        isNonEmpty(provider) &&
        isNonEmpty(apiKey) &&
        isNonEmpty(baseUrl) &&
        isNonEmpty(model) &&
        Number.isFinite(tokens) &&
        tokens > 0
      );
    },

    saveSettings: async () => {
      await ensureDbInitialized();
      const settings = pickSettings(get());
      await dbClient.setItem('settings', await toStoredSettings(settings));
      set({ initialSettings: settings, isDirty: false });
    },

    resetSettings: () => {
      set((state) => ({
        ...state.initialSettings,
        isDirty: false,
      }));
    },

    loadSettings: async () => {
      await ensureDbInitialized();
      const savedSettings = (await dbClient.getItem(
        'settings',
      )) as Partial<SettingsData> | null;
      if (!savedSettings) return;

      // Migrate legacy settings (pre-`provider`): reverse-derive the provider from
      // the saved base URL so old users keep working without re-configuring.
      const provider = isNonEmpty(savedSettings.provider)
        ? (savedSettings.provider as string)
        : savedSettings.baseUrl
          ? deriveProviderId(savedSettings.baseUrl)
          : '';
      const { apiKey, legacyPlaintext } = await revealApiKey(savedSettings.apiKey);
      const merged = pickSettings({ ...savedSettings, apiKey, provider });
      set({ ...merged, initialSettings: { ...merged }, isDirty: false });
      // Migrate legacy plaintext values as soon as they are read. If no key is
      // configured, this is a no-op and does not create a vault entry.
      if (legacyPlaintext && apiKey) {
        await dbClient.setItem('settings', await toStoredSettings(merged));
      }
    },
  };
});

// 恢复为了确保全局可用性的自动加载，但仅在客户端执行
if (typeof window !== 'undefined') {
  useSettingStore.getState().loadSettings();
}
