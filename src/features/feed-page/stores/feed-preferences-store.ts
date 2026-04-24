import { create } from "zustand";
import type { KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import {
  loadCompactTaskCardsEnabled,
  saveCompactTaskCardsEnabled,
  loadCompletionSoundEnabled,
  saveCompletionSoundEnabled,
} from "@/infrastructure/preferences/user-preferences-storage";

interface FeedPreferencesState {
  compactTaskCardsEnabled: boolean;
  completionSoundEnabled: boolean;
  searchQuery: string;
  isSidebarFocused: boolean;
  kanbanDepthMode: KanbanDepthMode;

  setCompactTaskCardsEnabled: (enabled: boolean) => void;
  toggleCompletionSound: () => void;
  setSearchQuery: (query: string) => void;
  setIsSidebarFocused: (focused: boolean) => void;
  setKanbanDepthMode: (mode: KanbanDepthMode) => void;
}

export const useFeedPreferencesStore = create<FeedPreferencesState>((set) => ({
  compactTaskCardsEnabled: loadCompactTaskCardsEnabled(),
  completionSoundEnabled: loadCompletionSoundEnabled(),
  searchQuery: "",
  isSidebarFocused: false,
  kanbanDepthMode: "leaves",

  setCompactTaskCardsEnabled: (enabled) => {
    saveCompactTaskCardsEnabled(enabled);
    set({ compactTaskCardsEnabled: enabled });
  },

  toggleCompletionSound: () =>
    set((state) => {
      const next = !state.completionSoundEnabled;
      saveCompletionSoundEnabled(next);
      return { completionSoundEnabled: next };
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsSidebarFocused: (focused) => set({ isSidebarFocused: focused }),
  setKanbanDepthMode: (mode) => set({ kanbanDepthMode: mode }),
}));
