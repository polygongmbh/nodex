import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SavedFilterConfiguration } from "@/types";
import { SAVED_FILTER_CONFIGS_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";

interface SavedFilterStoreState {
  activeConfigurationId: string | null;
  configurations: SavedFilterConfiguration[];

  addConfiguration: (configuration: SavedFilterConfiguration) => void;
  setActiveConfigurationId: (id: string | null) => void;
  renameConfiguration: (id: string, name: string) => void;
  deleteConfiguration: (id: string) => void;
}

export const useSavedFilterStore = create<SavedFilterStoreState>()(
  persist(
    (set) => ({
      activeConfigurationId: null,
      configurations: [],

      addConfiguration: (configuration) =>
        set((state) => ({
          activeConfigurationId: configuration.id,
          configurations: [...state.configurations, configuration],
        })),

      setActiveConfigurationId: (id) =>
        set({ activeConfigurationId: id }),

      renameConfiguration: (id, name) =>
        set((state) => ({
          configurations: state.configurations.map((c) =>
            c.id === id
              ? { ...c, name, updatedAt: new Date().toISOString() }
              : c
          ),
        })),

      deleteConfiguration: (id) =>
        set((state) => ({
          activeConfigurationId:
            state.activeConfigurationId === id ? null : state.activeConfigurationId,
          configurations: state.configurations.filter((c) => c.id !== id),
        })),
    }),
    {
      name: SAVED_FILTER_CONFIGS_STORAGE_KEY,
      partialize: (state) => ({
        activeConfigurationId: state.activeConfigurationId,
        configurations: state.configurations,
      }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<SavedFilterStoreState> | undefined;
        if (!stored?.configurations) return current;
        const ids = new Set(stored.configurations.map((c) => c.id));
        return {
          ...current,
          configurations: stored.configurations,
          activeConfigurationId:
            stored.activeConfigurationId && ids.has(stored.activeConfigurationId)
              ? stored.activeConfigurationId
              : null,
        };
      },
    }
  )
);
