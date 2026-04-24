import { beforeEach, describe, expect, it } from "vitest";
import { useFeedPreferencesStore } from "./feed-preferences-store";
import { FEED_PREFERENCES_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";

function getPersistedState(): Record<string, unknown> {
  const raw = window.localStorage.getItem(FEED_PREFERENCES_STORAGE_KEY);
  if (!raw) return {};
  return (JSON.parse(raw) as { state: Record<string, unknown> }).state;
}

describe("feedPreferencesStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useFeedPreferencesStore.setState({
      compactTaskCardsEnabled: false,
      completionSoundEnabled: true,
      searchQuery: "",
      kanbanDepthMode: "leaves",
    });
  });

  it("has expected initial state", () => {
    const state = useFeedPreferencesStore.getState();
    expect(state.compactTaskCardsEnabled).toBe(false);
    expect(state.completionSoundEnabled).toBe(true);
    expect(state.searchQuery).toBe("");
    expect(state.kanbanDepthMode).toBe("leaves");
  });

  it("setCompactTaskCardsEnabled updates state and persists to localStorage", () => {
    useFeedPreferencesStore.getState().setCompactTaskCardsEnabled(true);
    expect(useFeedPreferencesStore.getState().compactTaskCardsEnabled).toBe(true);
    expect(getPersistedState().compactTaskCardsEnabled).toBe(true);
  });

  it("toggleCompletionSound flips state and persists to localStorage", () => {
    useFeedPreferencesStore.getState().toggleCompletionSound();
    expect(useFeedPreferencesStore.getState().completionSoundEnabled).toBe(false);
    expect(getPersistedState().completionSoundEnabled).toBe(false);

    useFeedPreferencesStore.getState().toggleCompletionSound();
    expect(useFeedPreferencesStore.getState().completionSoundEnabled).toBe(true);
    expect(getPersistedState().completionSoundEnabled).toBe(true);
  });

  it("setSearchQuery updates searchQuery but does not persist it", () => {
    useFeedPreferencesStore.getState().setSearchQuery("hello");
    expect(useFeedPreferencesStore.getState().searchQuery).toBe("hello");
    expect(getPersistedState().searchQuery).toBeUndefined();
  });

  it("setKanbanDepthMode updates state and persists to localStorage", () => {
    useFeedPreferencesStore.getState().setKanbanDepthMode("all");
    expect(useFeedPreferencesStore.getState().kanbanDepthMode).toBe("all");
    expect(getPersistedState().kanbanDepthMode).toBe("all");
  });
});
