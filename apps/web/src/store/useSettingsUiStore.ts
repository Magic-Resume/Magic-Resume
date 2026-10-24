import { create } from 'zustand';

/** Open state of the settings dialog. Hosted once in the dashboard layout (SettingsHost). */
export type SettingsSection = 'general' | 'model';

interface SettingsUiState {
  section: SettingsSection;
  settingsOpen: boolean;
  openSettings: (section?: SettingsSection) => void;
  setSection: (section: SettingsSection) => void;
  closeSettings: () => void;
}

export const useSettingsUiStore = create<SettingsUiState>((set) => ({
  settingsOpen: false,
  section: 'general',
  setSection: (section) => set({ section }),
  openSettings: (section = 'general') => set({ settingsOpen: true, section }),
  closeSettings: () => set({ settingsOpen: false }),
}));
