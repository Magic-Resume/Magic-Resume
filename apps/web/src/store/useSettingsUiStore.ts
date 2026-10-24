import { create } from 'zustand';

/** Open state of the settings dialog. Hosted once in the dashboard layout (SettingsHost). */
interface SettingsUiState {
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useSettingsUiStore = create<SettingsUiState>((set) => ({
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
