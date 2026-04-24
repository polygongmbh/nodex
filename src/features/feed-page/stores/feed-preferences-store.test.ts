import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFeedPreferencesStore } from "./feed-preferences-store";
import * as userPrefsStorage from "@/infrastructure/preferences/user-preferences-storage";

describe("feedPreferencesStore", () => {
  beforeEach(() => {
    vi.spyOn(userPrefsStorage, "loadCompactTaskCardsEnabled").mockReturnValue(false);
    vi.spyOn(userPrefsStorage, "loadCompletionSoundEnabled").mockReturnValue(true);
    vi.spyOn(userPrefsStorage, "saveCompactTaskCardsEnabled").mockImplementation(() => {});
    vi.spyOn(userPrefsStorage, "saveCompletionSoundEnabled").mockImplementation(() => {});

    useFeedPreferencesStore.setState({
      compactTaskCardsEnabled: false,
      completionSoundEnabled: true,
      searchQuery: "",
      isSidebarFocused: false,
      kanbanDepthMode: "leaves",
    });
  });

  it("has expected initial state", () => {
    const state = useFeedPreferencesStore.getState();
    expect(state.compactTaskCardsEnabled).toBe(false);
    expect(state.completionSoundEnabled).toBe(true);
    expect(state.searchQuery).toBe("");
    expect(state.isSidebarFocused).toBe(false);
    expect(state.kanbanDepthMode).toBe("leaves");
  });

  it("setCompactTaskCardsEnabled updates state and persists", () => {
    const saveSpy = vi.spyOn(userPrefsStorage, "saveCompactTaskCardsEnabled");
    useFeedPreferencesStore.getState().setCompactTaskCardsEnabled(true);
    expect(useFeedPreferencesStore.getState().compactTaskCardsEnabled).toBe(true);
    expect(saveSpy).toHaveBeenCalledWith(true);
  });

  it("toggleCompletionSound flips state and persists", () => {
    const saveSpy = vi.spyOn(userPrefsStorage, "saveCompletionSoundEnabled");
    useFeedPreferencesStore.getState().toggleCompletionSound();
    expect(useFeedPreferencesStore.getState().completionSoundEnabled).toBe(false);
    expect(saveSpy).toHaveBeenCalledWith(false);

    useFeedPreferencesStore.getState().toggleCompletionSound();
    expect(useFeedPreferencesStore.getState().completionSoundEnabled).toBe(true);
    expect(saveSpy).toHaveBeenCalledWith(true);
  });

  it("setSearchQuery updates searchQuery", () => {
    useFeedPreferencesStore.getState().setSearchQuery("hello");
    expect(useFeedPreferencesStore.getState().searchQuery).toBe("hello");

    useFeedPreferencesStore.getState().setSearchQuery("");
    expect(useFeedPreferencesStore.getState().searchQuery).toBe("");
  });

  it("setIsSidebarFocused updates isSidebarFocused", () => {
    useFeedPreferencesStore.getState().setIsSidebarFocused(true);
    expect(useFeedPreferencesStore.getState().isSidebarFocused).toBe(true);

    useFeedPreferencesStore.getState().setIsSidebarFocused(false);
    expect(useFeedPreferencesStore.getState().isSidebarFocused).toBe(false);
  });

  it("setKanbanDepthMode updates kanbanDepthMode", () => {
    useFeedPreferencesStore.getState().setKanbanDepthMode("all");
    expect(useFeedPreferencesStore.getState().kanbanDepthMode).toBe("all");

    useFeedPreferencesStore.getState().setKanbanDepthMode("projects");
    expect(useFeedPreferencesStore.getState().kanbanDepthMode).toBe("projects");
  });
});
