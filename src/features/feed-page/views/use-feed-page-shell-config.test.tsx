import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFeedPageShellConfig } from "./use-feed-page-shell-config";
import { makeChannel, makePerson, makeRelay } from "@/test/fixtures";

describe("useFeedPageShellConfig", () => {
  it("builds mobile and desktop shell state from feed-page inputs", () => {
    const { result } = renderHook(() =>
      useFeedPageShellConfig({
        canCreateContent: true,
        profileCompletionPromptSignal: {
          shouldPrompt: true,
          missingFields: ["name"],
        },
        currentView: "kanban",
        isOnboardingOpen: true,
        isAuthModalOpen: true,
        activeOnboardingStepId: "compose",
        isManageRouteActive: false,
        failedPublishDrafts: [],
        visibleFailedPublishDrafts: [],
        selectedPublishableRelayIds: ["relay-one"],
        relaysWithActiveState: [makeRelay({ id: "relay-one", url: "wss://relay.one", isActive: true })],
        channelsWithState: [makeChannel({ id: "general", name: "general" })],
        collapsedPreviewChannels: [makeChannel({ id: "ops", name: "ops" })],
        channelMatchMode: "or",
        peopleWithState: [makePerson({ id: "alice", name: "alice" })],
        collapsedPreviewPeople: [makePerson({ id: "bob", name: "bob" })],
        nostrRelays: [{ url: "wss://relay.one", status: "connected" }],
        isSidebarFocused: true,
        quickFilters: {
          recentEnabled: false,
          recentDays: 3,
          priorityEnabled: false,
          minPriority: 3,
        },
        savedFilterConfigurations: [],
        activeSavedFilterConfigurationId: "config-1",
        pinnedChannelIds: ["general"],
        pinnedPersonIds: ["alice"],
        desktopSwipeHandlers: { onTouchStart: () => {} },
        kanbanDepthMode: "leaves",
        searchQuery: "deploy",
        t: ((key: string) => key) as never,
      })
    );

    expect(result.current.mobileController.viewState.isOnboardingOpen).toBe(false);
    expect(result.current.mobileController.publishState?.selectedPublishableRelayIds).toEqual(["relay-one"]);
    expect(result.current.desktopHeader.currentView).toBe("kanban");
    expect(result.current.desktopContent.searchDockState.showKanbanLevels).toBe(true);
    expect(result.current.desktopSidebarController.channelMatchMode).toBe("or");
    expect(result.current.desktopSidebarController.pinnedChannelIds).toEqual(["general"]);
    expect(result.current.desktopSidebarController.pinnedPersonIds).toEqual(["alice"]);
  });
});
