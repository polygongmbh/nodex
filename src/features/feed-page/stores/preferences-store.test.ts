import { beforeEach, describe, expect, it } from "vitest";
import { usePreferencesStore } from "./preferences-store";
import { FEED_PREFERENCES_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";

function getPersistedState(): Record<string, unknown> {
  const raw = window.localStorage.getItem(FEED_PREFERENCES_STORAGE_KEY);
  if (!raw) return {};
  return (JSON.parse(raw) as { state: Record<string, unknown> }).state;
}

describe("preferencesStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePreferencesStore.setState({
      compactTaskCardsEnabled: false,
      completionSoundEnabled: true,
      searchQuery: "",
      displayDepthMode: "1",
    });
  });

  it("has expected initial state", () => {
    const state = usePreferencesStore.getState();
    expect(state.compactTaskCardsEnabled).toBe(false);
    expect(state.completionSoundEnabled).toBe(true);
    expect(state.searchQuery).toBe("");
    expect(state.displayDepthMode).toBe("1");
  });

  it("setCompactTaskCardsEnabled updates state and persists to localStorage", () => {
    usePreferencesStore.getState().setCompactTaskCardsEnabled(true);
    expect(usePreferencesStore.getState().compactTaskCardsEnabled).toBe(true);
    expect(getPersistedState().compactTaskCardsEnabled).toBe(true);
  });

  it("toggleCompletionSound flips state and persists to localStorage", () => {
    usePreferencesStore.getState().toggleCompletionSound();
    expect(usePreferencesStore.getState().completionSoundEnabled).toBe(false);
    expect(getPersistedState().completionSoundEnabled).toBe(false);

    usePreferencesStore.getState().toggleCompletionSound();
    expect(usePreferencesStore.getState().completionSoundEnabled).toBe(true);
    expect(getPersistedState().completionSoundEnabled).toBe(true);
  });

  it("setSearchQuery updates searchQuery but does not persist it", () => {
    usePreferencesStore.getState().setSearchQuery("hello");
    expect(usePreferencesStore.getState().searchQuery).toBe("hello");
    expect(getPersistedState().searchQuery).toBeUndefined();
  });

  it("setDisplayDepthMode updates state and persists to localStorage", () => {
    usePreferencesStore.getState().setDisplayDepthMode("all");
    expect(usePreferencesStore.getState().displayDepthMode).toBe("all");
    expect(getPersistedState().displayDepthMode).toBe("all");
  });
});
