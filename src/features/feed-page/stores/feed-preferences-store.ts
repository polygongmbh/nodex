import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FeedKanbanDepthMode } from "@/features/feed-page/interactions/feed-interaction-intent";
import { FEED_PREFERENCES_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";

interface PersistedFeedPreferences {
  compactTaskCardsEnabled: boolean;
  completionSoundEnabled: boolean;
  kanbanDepthMode: FeedKanbanDepthMode;
}

interface FeedPreferencesState extends PersistedFeedPreferences {
  searchQuery: string;

  setCompactTaskCardsEnabled: (enabled: boolean) => void;
  toggleCompletionSound: () => void;
  setSearchQuery: (query: string) => void;
  setKanbanDepthMode: (mode: FeedKanbanDepthMode) => void;
}

export const useFeedPreferencesStore = create<FeedPreferencesState>()(
  persist(
    (set) => ({
      compactTaskCardsEnabled: false,
      completionSoundEnabled: true,
      searchQuery: "",
      kanbanDepthMode: "leaves" as FeedKanbanDepthMode,

      setCompactTaskCardsEnabled: (enabled) => set({ compactTaskCardsEnabled: enabled }),
      toggleCompletionSound: () =>
        set((state) => ({ completionSoundEnabled: !state.completionSoundEnabled })),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setKanbanDepthMode: (mode) => set({ kanbanDepthMode: mode }),
    }),
    {
      name: FEED_PREFERENCES_STORAGE_KEY,
      partialize: (state): PersistedFeedPreferences => ({
        compactTaskCardsEnabled: state.compactTaskCardsEnabled,
        completionSoundEnabled: state.completionSoundEnabled,
        kanbanDepthMode: state.kanbanDepthMode,
      }),
    }
  )
);
