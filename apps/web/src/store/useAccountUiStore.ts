import { create } from 'zustand';

/** Categories in the GPT-style settings modal. Cloud-only ones are filtered at render. */
export type SettingsSection = 'general' | 'model' | 'cloudSync' | 'mcp';

/** Tabs in the account (个人资料) modal. Billing lives here, with the rest of
 *  what is true about the account rather than about the app. */
export type AccountTab = 'profile' | 'security' | 'activity' | 'billing';

interface AccountUiState {
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  accountOpen: boolean;
  accountTab: AccountTab;
  pricingOpen: boolean;
  /** Open the settings modal, optionally jumping to a section. */
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  /** Open the account modal (cloud only), optionally on a given tab. */
  openAccount: (tab?: AccountTab) => void;
  /** Switch tab without reopening — the modal's own rail uses this. */
  setAccountTab: (tab: AccountTab) => void;
  closeAccount: () => void;
  /** Open the upgrade / pricing modal (cloud only). */
  openPricing: () => void;
  closePricing: () => void;
}

/**
 * Drives the two global overlays (settings + account) from anywhere — the avatar
 * menu, the sidebar, the editor rail — without prop-drilling. The modals are
 * mounted once in `AccountUiHost` and read this store.
 */
export const useAccountUiStore = create<AccountUiState>((set) => ({
  settingsOpen: false,
  settingsSection: 'general',
  accountOpen: false,
  accountTab: 'profile',
  pricingOpen: false,
  openSettings: (section) =>
    set((state) => ({ settingsOpen: true, settingsSection: section ?? state.settingsSection })),
  closeSettings: () => set({ settingsOpen: false }),
  openAccount: (tab) =>
    set((state) => ({ accountOpen: true, accountTab: tab ?? state.accountTab })),
  setAccountTab: (tab) => set({ accountTab: tab }),
  closeAccount: () => set({ accountOpen: false }),
  openPricing: () => set({ pricingOpen: true }),
  closePricing: () => set({ pricingOpen: false }),
}));
