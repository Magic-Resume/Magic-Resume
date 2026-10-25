import { normalizeDocumentLanguage, resolveDocumentLanguage } from '@magic-resume-kit/resume-schema';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import i18next from 'i18next';
import sidebarMenu from '@/lib/constants/sidebarMenu';
import { dbClient, RESUMES_KEY } from '@/lib/api/IndexDBClient';
import { MagicDebugger } from '@/lib/utils/debuggger';
import { toast } from 'sonner';
import debounce from 'lodash/debounce';
import isEqual from 'lodash/isEqual';
import {
  normalizeResumeSectionOrder,
  isCustomSection,
  customSectionKey,
} from '@/lib/utils/resumeSectionOrder';
import { migrateResume } from '@/lib/utils/resumeMigrations';
import {
  Resume,
  InfoType,
  Section,
  SectionItem,
  SectionOrder,
  CustomTemplateConfig,
} from '@/types/frontend/resume';

export type ResumeState = {
  resumes: Resume[];
  activeResume: Resume | null;
  isStoreLoading: boolean;
  isAiGenerating: boolean;
  setIsAiGenerating: (generating: boolean) => void;
  applyFullResume: (resume: Resume) => void;
  applyWorkspaceResolution: (
    document: Pick<Resume, 'info' | 'sections' | 'sectionOrder' | 'documentLanguage' | 'documentLanguageSource'>,
    revision: number,
  ) => void;
  rightCollapsed: boolean;
  leftCollapsed: boolean;
  activeSection: string;
  loadResumes: () => Promise<void>;
  createResume: (name: string) => Promise<string>;
  importResume: (resume: Resume) => Promise<string>;
  addResume: (resume: Resume) => Promise<void>;
  updateResume: (id: string, updates: Partial<Resume>) => void;
  duplicateResume: (id: string) => Promise<void>;
  renameResume: (id: string, newName: string) => Promise<void>;
  deleteResume: (id: string) => Promise<void>;
  loadResumeForEdit: (id: string) => void;
  saveResume: (type?: 'auto' | 'manual', resumeData?: Resume) => Promise<void>;
  updateInfo: (info: Partial<InfoType>) => void;
  setSectionOrder: (sectionOrder: SectionOrder[]) => void;
  updateSectionItems: (key: string, items: SectionItem[]) => void;
  /** Create a section the app does not define. Returns its generated key. */
  addCustomSection: (title: string, icon?: string) => string | null;
  /** Retitle / re-icon a section. Built-ins are refused — see isCustomSection. */
  updateCustomSection: (
    key: string,
    patch: { label?: string; icon?: string },
  ) => void;
  /** Delete a custom section and its items. Built-ins are refused. */
  removeCustomSection: (key: string) => void;
  updateSections: (sections: Section) => void;
  updateTemplate: (template: string) => void;
  updateCustomTemplate: (customTemplate: CustomTemplateConfig) => void;
  updateThemeColor: (themeColor: string) => void;
  updateTypography: (typography: string) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  setActiveSection: (section: string) => void;
};

export const initialResume: Omit<Resume, 'id' | 'updatedAt' | 'name'> = {
  info: {
    fullName: '',
    headline: '',
    email: '',
    phoneNumber: '',
    address: '',
    website: '',
    avatar: '',
    customFields: [],
  },
  sections: Object.fromEntries(sidebarMenu.map((item) => [item.key, []])),
  sectionOrder: [
    { key: 'basics', label: 'Basics' },
    ...sidebarMenu.map((item) => ({ key: item.key, label: item.label })),
  ],
  template: 'classic',
  themeColor: '#f97316',
  typography: 'inter',
  customTemplate: {},
};

export const getSanitizedResume = (
  resume: Resume,
): Omit<Resume, 'id' | 'updatedAt' | 'versions'> => {
  const r = resume || {};
  const sections = r.sections || initialResume.sections;
  const sanitized: Omit<Resume, 'id' | 'updatedAt' | 'versions'> = {
    info: r.info || initialResume.info,
    sections,
    sectionOrder: normalizeResumeSectionOrder(r.sectionOrder, sections),
    template: r.template || initialResume.template,
    themeColor: r.themeColor || initialResume.themeColor,
    typography: r.typography || initialResume.typography,
    customTemplate: (r.customTemplate ||
      initialResume.customTemplate) as CustomTemplateConfig,
    name: (r.name as string) || '',
  };

  if (r.documentLanguage !== undefined) sanitized.documentLanguage = normalizeDocumentLanguage(r.documentLanguage);
  if (r.documentLanguageSource !== undefined) sanitized.documentLanguageSource = r.documentLanguageSource;
  if (r.isPublic !== undefined) sanitized.isPublic = r.isPublic;
  if (r.shareId !== undefined) sanitized.shareId = r.shareId;
  if (r.shareRole !== undefined) sanitized.shareRole = r.shareRole;
  // The replica card writes a serialized template tree here. Keep it in the
  // normal local/cloud document, otherwise a successful visual apply vanishes
  // as soon as the resume is reloaded.
  if (r.templateOverride !== undefined)
    sanitized.templateOverride = r.templateOverride;

  return sanitized;
};

export const getSanitizedResumeForLocal = (resume: Resume) => {
  if (!resume) return null;
  return {
    id: resume.id,
    updatedAt: resume.updatedAt,
    ...getSanitizedResume(resume),
  };
};

const useResumeStore = create<ResumeState>()(
  immer((set, get) => ({
    resumes: [],
    activeResume: null,
    isStoreLoading: true,
    isAiGenerating: false,
    setIsAiGenerating: (isAiGenerating) => set({ isAiGenerating }),
    applyFullResume: (resume) => {
      const active = get().activeResume;
      if (!active) return;
      get().updateResume(active.id, {
        info: resume.info,
        sections: resume.sections,
        sectionOrder: normalizeResumeSectionOrder(resume.sectionOrder, resume.sections),
        documentLanguage: resume.documentLanguage ?? active.documentLanguage ?? resolveDocumentLanguage(resume),
        documentLanguageSource: resume.documentLanguageSource ?? active.documentLanguageSource,
      });
    },
    // Approved agent changes become ordinary local edits and persist to IndexedDB.
    applyWorkspaceResolution: (document) => {
      const active = get().activeResume;
      if (!active) return;
      get().applyFullResume({ ...active, ...document });
    },
    rightCollapsed: false,
    leftCollapsed: false,
    activeSection: 'basics',
    loadResumes: async () => {
      if (!get().isStoreLoading) {
        set({ isStoreLoading: true });
      }
      try {
        let localResumes =
          (await dbClient.getItem<Resume[]>(RESUMES_KEY)) || [];

        localResumes = localResumes.map((r) => {
          if ('content' in (r as object)) {
            const rest = { ...r };
            delete (rest as Record<string, unknown>).content;
            return rest as Resume;
          }
          return r;
        });

        const mergedMap = new Map<string, Resume>();
        localResumes.forEach((r) => mergedMap.set(r.id, r));

        const finalResumes = Array.from(mergedMap.values()).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        );
        set({ resumes: finalResumes, isStoreLoading: false });
      } catch (error) {
        MagicDebugger.error('Failed to load resumes:', error);
        set({ isStoreLoading: false });
      }
    },

    createResume: async (name) => {
      const { addResume } = get();

      const newId = Date.now().toString();
      const newResume: Resume = {
        ...initialResume,
        documentLanguage: normalizeDocumentLanguage(i18next.resolvedLanguage || i18next.language) ?? 'zh',
        documentLanguageSource: 'explicit',
        id: newId,
        name,
        updatedAt: Date.now(),
      };

      await addResume(newResume);
      return newId;
    },

    importResume: async (resume) => {
      const { addResume } = get();

      await addResume(resume);
      return resume.id;
    },

    addResume: async (resume) => {
      // Import/new routes can be opened before the dashboard hydrates the store.
      // Read storage before writing the list, and propagate read/write failures.
      const saved = await dbClient.getItem<Resume[]>(RESUMES_KEY) ?? [];
      const byId = new Map(saved.map((item) => [item.id, item]));
      for (const item of get().resumes) byId.set(item.id, item);
      const newResumes = byId.has(resume.id)
        ? Array.from(byId.values())
        : [resume, ...byId.values()];
      await dbClient.setItem(
        RESUMES_KEY,
        newResumes.map((item) => getSanitizedResumeForLocal(item)),
      );
      set({ resumes: newResumes, isStoreLoading: false });
    },

    updateResume: (id, updates) => {
      const now = Date.now();

      set((state) => {
        const newResumes = state.resumes.map((r) =>
          r.id === id ? { ...r, ...updates, updatedAt: now } : r,
        );

        const isUpdatingActive =
          state.activeResume && state.activeResume.id === id;

        return {
          resumes: newResumes,
          ...(isUpdatingActive && {
            activeResume: {
              ...state.activeResume!,
              ...updates,
              updatedAt: now,
            },
          }),
        };
      });
    },

    duplicateResume: async (id) => {
      const resumeToDuplicate = get().resumes.find((r) => r.id === id);
      if (!resumeToDuplicate) {
        toast.error(i18next.t('store.notifications.resumeNotFound'));
        return;
      }

      const newResume: Resume = {
        ...resumeToDuplicate,
        id: Date.now().toString(),
        name: `${resumeToDuplicate.name} (Copy)`,
        updatedAt: Date.now(),
        isPublic: false,
        shareId: undefined,
        shareRole: undefined,
        versions: undefined,
      };
      await get().addResume(newResume);
      toast.success(
        i18next.t('store.notifications.resumeDuplicatedLocally', {
          name: resumeToDuplicate.name,
        }),
      );
    },

    renameResume: async (id, newName) => {
      const now = Date.now();
      const { resumes } = get();
      const targetResume = resumes.find((r) => r.id === id);

      if (!targetResume) return;

      const updatedResume = { ...targetResume, name: newName, updatedAt: now };

      set((state) => {
        const newResumes = state.resumes.map((r) =>
          r.id === id ? updatedResume : r,
        );
        const isUpdatingActive =
          state.activeResume && state.activeResume.id === id;

        return {
          resumes: newResumes,
          ...(isUpdatingActive && {
            activeResume: updatedResume,
          }),
        };
      });

      const currentResumes = get().resumes; // Retrieve updated list
      dbClient.setItem(
        RESUMES_KEY,
        currentResumes.map((r) => getSanitizedResumeForLocal(r)),
      );
    },

    deleteResume: async (id) => {
      const resumeToDelete = get().resumes.find((r) => r.id === id);

      const newResumes = get().resumes.filter((r) => r.id !== id);
      set({ resumes: newResumes });
      dbClient.setItem(
        RESUMES_KEY,
        newResumes.map((r) => getSanitizedResumeForLocal(r)),
      );
      toast.success(
        i18next.t('store.notifications.resumeDeleted', {
          name: resumeToDelete?.name || '',
        }),
      );
    },

    loadResumeForEdit: (id) => {
      const { resumes, isStoreLoading, loadResumes } = get();

      if (isStoreLoading) {
        loadResumes().then(() => {
          const updatedResumes = get().resumes;
          const resume = updatedResumes.find((r) => r.id === id);
          if (resume) {
            // Repairs for resumes written by an older build — see migrateResume.
            const migrated = migrateResume(resume);
            set((state) => {
              if (!state.activeResume || state.activeResume.id !== id) {
                state.activeResume = { ...migrated };
              }
            });
          }
        });
        return;
      }

      const resume = resumes.find((r) => r.id === id);
      if (resume) {
        const migrated = migrateResume(resume);
        set((state) => {
          if (state.activeResume?.id !== id) {
            state.activeResume = { ...migrated };
          }
        });
      } else {
        MagicDebugger.warn(`Resume with id ${id} not found in local list.`);
      }
    },

    saveResume: async (type = 'auto', resumeData) => {
      const now = Date.now();

      const targetResume = resumeData || get().activeResume;
      if (!targetResume) return;

      // Bumping updatedAt changes `resumes`, which the subscriber below persists to IndexedDB.
      set((state) => {
        const newResumes = state.resumes.map((r) =>
          r.id === targetResume.id ? { ...r, updatedAt: now } : r,
        );

        const isUpdatingActive =
          state.activeResume && state.activeResume.id === targetResume.id;

        return {
          resumes: newResumes,
          ...(isUpdatingActive && {
            activeResume: { ...state.activeResume!, updatedAt: now },
          }),
        };
      });

      if (type === 'manual')
        toast.success(i18next.t('store.notifications.resumeSavedLocally'));
    },

    updateInfo: (info) => {
      const { activeResume } = get();
      if (!activeResume) return;

      const currentInfo = activeResume.info;
      const newInfo = { ...currentInfo, ...info };

      if (isEqual(currentInfo, newInfo)) {
        return;
      }

      set((state) => {
        if (!state.activeResume) return;
        state.activeResume.info = newInfo;
        state.activeResume.updatedAt = Date.now();
        const resumeIndex = state.resumes.findIndex(
          (r) => r.id === state.activeResume?.id,
        );
        if (resumeIndex !== -1) {
          state.resumes[resumeIndex].info = newInfo;
          state.resumes[resumeIndex].updatedAt = state.activeResume.updatedAt;
        }
      });
    },

    setSectionOrder: (sectionOrder) => {
      const { activeResume } = get();
      if (!activeResume) return;

      const normalizedSectionOrder = normalizeResumeSectionOrder(
        sectionOrder,
        activeResume.sections,
      );

      if (isEqual(activeResume.sectionOrder, normalizedSectionOrder)) {
        return;
      }

      set((state) => {
        if (!state.activeResume) return;
        state.activeResume.sectionOrder = normalizedSectionOrder;
        state.activeResume.updatedAt = Date.now();

        const resumeIndex = state.resumes.findIndex(
          (r) => r.id === state.activeResume?.id,
        );
        if (resumeIndex !== -1) {
          state.resumes[resumeIndex].sectionOrder = normalizedSectionOrder;
          state.resumes[resumeIndex].updatedAt = state.activeResume.updatedAt;
        }
      });
    },

    updateSectionItems: (key, items) => {
      const { activeResume } = get();
      if (!activeResume) return;

      if (isEqual(activeResume.sections[key], items)) {
        return;
      }

      set((state) => {
        if (!state.activeResume) return;
        state.activeResume.sections[key] = items;
        state.activeResume.updatedAt = Date.now();

        const resumeIndex = state.resumes.findIndex(
          (r) => r.id === state.activeResume?.id,
        );
        if (resumeIndex !== -1) {
          state.resumes[resumeIndex].sections[key] = items;
          state.resumes[resumeIndex].updatedAt = state.activeResume.updatedAt;
        }
      });
    },

    /**
     * 自定义 section 归用户增删改,内置六个不行:内置的 label 是 i18n key,改名会把翻译
     * 换成字面量、废掉其它语言;删掉则会拿走编辑器预期存在的表单。下面的守卫就是这条规则。
     */
    addCustomSection: (title, icon) => {
      const { activeResume } = get();
      if (!activeResume) return null;

      const label = title.trim();
      if (!label) return null;

      const key = customSectionKey(
        label,
        Object.keys(activeResume.sections ?? {}),
      );

      set((state) => {
        if (!state.activeResume) return;
        state.activeResume.sections[key] = [];
        state.activeResume.sectionOrder.push({
          key,
          label,
          ...(icon ? { icon } : {}),
        });
        state.activeResume.updatedAt = Date.now();

        const resumeIndex = state.resumes.findIndex(
          (r) => r.id === state.activeResume?.id,
        );
        if (resumeIndex !== -1) {
          state.resumes[resumeIndex].sections[key] = [];
          state.resumes[resumeIndex].sectionOrder =
            state.activeResume.sectionOrder;
          state.resumes[resumeIndex].updatedAt = state.activeResume.updatedAt;
        }
      });

      return key;
    },

    updateCustomSection: (key, patch) => {
      const { activeResume } = get();
      if (!activeResume || !isCustomSection(key)) return;

      const label = patch.label?.trim();
      const current = activeResume.sectionOrder.find((s) => s.key === key);
      if (!current) return;

      // `icon: undefined` is how the dialog says "clear it", so the intent lives in
      // the key's presence. `??` read that as "unchanged", which made clearing a
      // no-op and swallowed any rename submitted alongside it.
      const iconGiven = 'icon' in patch;
      const nextIcon = patch.icon?.trim() || undefined;
      const labelUnchanged = (label ?? current.label) === current.label;
      const iconUnchanged = !iconGiven || nextIcon === current.icon;
      if (labelUnchanged && iconUnchanged && !current.title) return;

      set((state) => {
        if (!state.activeResume) return;
        const target = state.activeResume.sectionOrder.find(
          (s) => s.key === key,
        );
        if (!target) return;
        if (label) { target.label = label; delete target.title; }
        if (iconGiven) {
          if (nextIcon) target.icon = nextIcon;
          else delete target.icon;
        }
        state.activeResume.updatedAt = Date.now();

        const resumeIndex = state.resumes.findIndex(
          (r) => r.id === state.activeResume?.id,
        );
        if (resumeIndex !== -1) {
          state.resumes[resumeIndex].sectionOrder =
            state.activeResume.sectionOrder;
          state.resumes[resumeIndex].updatedAt = state.activeResume.updatedAt;
        }
      });
    },

    removeCustomSection: (key) => {
      const { activeResume } = get();
      if (!activeResume || !isCustomSection(key)) return;
      if (!activeResume.sectionOrder.some((s) => s.key === key)) return;

      set((state) => {
        if (!state.activeResume) return;
        delete state.activeResume.sections[key];
        state.activeResume.sectionOrder =
          state.activeResume.sectionOrder.filter((s) => s.key !== key);
        state.activeResume.updatedAt = Date.now();

        const resumeIndex = state.resumes.findIndex(
          (r) => r.id === state.activeResume?.id,
        );
        if (resumeIndex !== -1) {
          delete state.resumes[resumeIndex].sections[key];
          state.resumes[resumeIndex].sectionOrder =
            state.activeResume.sectionOrder;
          state.resumes[resumeIndex].updatedAt = state.activeResume.updatedAt;
        }
      });
    },

    updateSections: (sections) => {
      const { activeResume } = get();
      if (!activeResume) return;

      if (isEqual(activeResume.sections, sections)) {
        return;
      }

      set((state) => {
        if (!state.activeResume) return;
        state.activeResume.sections = sections;
        state.activeResume.updatedAt = Date.now();

        const resumeIndex = state.resumes.findIndex(
          (r) => r.id === state.activeResume?.id,
        );
        if (resumeIndex !== -1) {
          state.resumes[resumeIndex].sections = sections;
          state.resumes[resumeIndex].updatedAt = state.activeResume.updatedAt;
        }
      });
    },

    updateTemplate: (template) => {
      const { activeResume } = get();
      if (
        !activeResume ||
        (activeResume.template === template &&
          activeResume.templateOverride === undefined)
      )
        return;

      set((state) => {
        if (!state.activeResume) return;
        state.activeResume.template = template;
        // An explicitly selected stock template supersedes an AI replica. Without
        // clearing this, the renderer correctly keeps prioritising the override
        // and the template picker appears to do nothing.
        state.activeResume.templateOverride = undefined;
        state.activeResume.updatedAt = Date.now();

        const resumeIndex = state.resumes.findIndex(
          (r) => r.id === state.activeResume?.id,
        );
        if (resumeIndex !== -1) {
          state.resumes[resumeIndex].template = template;
          state.resumes[resumeIndex].templateOverride = undefined;
          state.resumes[resumeIndex].updatedAt = state.activeResume.updatedAt;
        }
      });
    },

    updateCustomTemplate: (customTemplate) => {
      const { activeResume } = get();
      if (!activeResume) return;
      if (isEqual(activeResume.customTemplate, customTemplate)) return;

      set((state) => {
        if (!state.activeResume) return;
        state.activeResume.customTemplate = customTemplate;
        state.activeResume.updatedAt = Date.now();

        const resumeIndex = state.resumes.findIndex(
          (r) => r.id === state.activeResume?.id,
        );
        if (resumeIndex !== -1) {
          state.resumes[resumeIndex].customTemplate = customTemplate;
          state.resumes[resumeIndex].updatedAt = state.activeResume.updatedAt;
        }
      });
    },

    updateThemeColor: (themeColor) => {
      const { activeResume } = get();
      if (!activeResume || activeResume.themeColor === themeColor) return;

      set((state) => {
        if (!state.activeResume) return;
        state.activeResume.themeColor = themeColor;
        state.activeResume.updatedAt = Date.now();

        const resumeIndex = state.resumes.findIndex(
          (r) => r.id === state.activeResume?.id,
        );
        if (resumeIndex !== -1) {
          state.resumes[resumeIndex].themeColor = themeColor;
          state.resumes[resumeIndex].updatedAt = state.activeResume.updatedAt;
        }
      });
    },

    updateTypography: (typography) => {
      const { activeResume } = get();
      if (!activeResume || activeResume.typography === typography) return;

      set((state) => {
        if (!state.activeResume) return;
        state.activeResume.typography = typography;
        state.activeResume.updatedAt = Date.now();

        const resumeIndex = state.resumes.findIndex(
          (r) => r.id === state.activeResume?.id,
        );
        if (resumeIndex !== -1) {
          state.resumes[resumeIndex].typography = typography;
          state.resumes[resumeIndex].updatedAt = state.activeResume.updatedAt;
        }
      });
    },

    setRightCollapsed: (collapsed) => set({ rightCollapsed: collapsed }),

    setLeftCollapsed: (collapsed) => set({ leftCollapsed: collapsed }),

    setActiveSection: (section) => set({ activeSection: section }),
  })),
);

// Debounced IndexedDB persistence to prevent data loss on page refresh
const debouncedLocalPersist = debounce((resumes: Resume[]) => {
  const sanitized = resumes.map((r) => getSanitizedResumeForLocal(r));
  dbClient.setItem(RESUMES_KEY, sanitized);
  console.log('[Store] Persisted resumes to IndexedDB (Sanitized)');
}, 2000);

// Subscribe to store changes to trigger local persistence
useResumeStore.subscribe((state, prevState) => {
  if (state.resumes !== prevState.resumes) {
    debouncedLocalPersist(state.resumes);
  }
});

// Flush the debounced persist on tab hide / unload so an edit made within the 2s
// debounce window isn't lost on refresh or close.
if (typeof window !== 'undefined') {
  const flushLocalPersist = () => debouncedLocalPersist.flush();
  window.addEventListener('pagehide', flushLocalPersist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushLocalPersist();
  });
}

// 移除立即加载，改为按需加载
// useResumeStore.getState().loadResumes();

export { useResumeStore };
