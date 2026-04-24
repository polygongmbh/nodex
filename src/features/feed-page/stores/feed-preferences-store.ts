import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FeedKanbanDepthMode } from "@/features/feed-page/interactions/feed-interaction-intent";
import { FEED_PREFERENCES_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";

export type ReducedDataMode = "auto" | "on" | "off";

interface PersistedFeedPreferences {
  compactTaskCardsEnabled: boolean;
  completionSoundEnabled: boolean;
  kanbanDepthMode: FeedKanbanDepthMode;
  presencePublishingEnabled: boolean;
  autoCaptionEnabled: boolean;
  publishDelayEnabled: boolean;
  reducedDataMode: ReducedDataMode;
}

interface FeedPreferencesState extends PersistedFeedPreferences {
  searchQuery: string;

  setCompactTaskCardsEnabled: (enabled: boolean) => void;
  toggleCompletionSound: () => void;
  setSearchQuery: (query: string) => void;
  setKanbanDepthMode: (mode: FeedKanbanDepthMode) => void;
  setPresencePublishingEnabled: (enabled: boolean) => void;
  setAutoCaptionEnabled: (enabled: boolean) => void;
  setPublishDelayEnabled: (enabled: boolean) => void;
  setReducedDataMode: (mode: ReducedDataMode) => void;
}

export const useFeedPreferencesStore = create<FeedPreferencesState>()(
  persist(
    (set) => ({
      compactTaskCardsEnabled: false,
      completionSoundEnabled: true,
      searchQuery: "",
      kanbanDepthMode: "leaves" as FeedKanbanDepthMode,
      presencePublishingEnabled: true,
      autoCaptionEnabled: false,
      publishDelayEnabled: false,
      reducedDataMode: "auto" as ReducedDataMode,

      setCompactTaskCardsEnabled: (enabled) => set({ compactTaskCardsEnabled: enabled }),
      toggleCompletionSound: () =>
        set((state) => ({ completionSoundEnabled: !state.completionSoundEnabled })),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setKanbanDepthMode: (mode) => set({ kanbanDepthMode: mode }),
      setPresencePublishingEnabled: (enabled) => set({ presencePublishingEnabled: enabled }),
      setAutoCaptionEnabled: (enabled) => set({ autoCaptionEnabled: enabled }),
      setPublishDelayEnabled: (enabled) => set({ publishDelayEnabled: enabled }),
      setReducedDataMode: (mode) => set({ reducedDataMode: mode }),
    }),
    {
      name: FEED_PREFERENCES_STORAGE_KEY,
      partialize: (state): PersistedFeedPreferences => ({
        compactTaskCardsEnabled: state.compactTaskCardsEnabled,
        completionSoundEnabled: state.completionSoundEnabled,
        kanbanDepthMode: state.kanbanDepthMode,
        presencePublishingEnabled: state.presencePublishingEnabled,
        autoCaptionEnabled: state.autoCaptionEnabled,
        publishDelayEnabled: state.publishDelayEnabled,
        reducedDataMode: state.reducedDataMode,
      }),
    }
  )
);
