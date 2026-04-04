import { useMemo, type HTMLAttributes } from "react";
import type { TFunction } from "i18next";
import type { FeedSidebarState } from "@/features/feed-page/controllers/feed-sidebar-controller-context";
import { FeedPageViewPane } from "./FeedPageViewPane";
import type { FeedPageDesktopContentConfig, FeedPageDesktopHeaderConfig } from "./FeedPageDesktopShell";
import type { FeedPageMobileController } from "./FeedPageMobileShell";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import type { KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import type { Channel, QuickFilterState, Relay, FailedPublishDraft } from "@/types";
import type { Person } from "@/types/person";
import type { NDKRelayStatus } from "@/infrastructure/nostr/ndk-context";
import type { ProfileCompletionPromptSignal } from "@/features/auth/controllers/use-profile-completion-prompt-signal";
import type { SavedFilterConfiguration } from "@/types";

interface UseFeedPageShellConfigOptions {
  canCreateContent: boolean;
  profileCompletionPromptSignal: ProfileCompletionPromptSignal;
  currentView: ViewType;
  isOnboardingOpen: boolean;
  isAuthModalOpen: boolean;
  activeOnboardingStepId: string | null;
  isManageRouteActive: boolean;
  failedPublishDrafts: FailedPublishDraft[];
  visibleFailedPublishDrafts: FailedPublishDraft[];
  selectedPublishableRelayIds: string[];
  relaysWithActiveState: Relay[];
  channelsWithState: Channel[];
  collapsedPreviewChannels: Channel[];
  channelMatchMode: FeedSidebarState["channelMatchMode"];
  peopleWithState: Person[];
  collapsedPreviewPeople: Person[];
  nostrRelays: NDKRelayStatus[];
  isSidebarFocused: boolean;
  quickFilters: QuickFilterState;
  savedFilterConfigurations: SavedFilterConfiguration[];
  activeSavedFilterConfigurationId: string | null;
  pinnedChannelIds: string[];
  pinnedPersonIds: string[];
  desktopSwipeHandlers: HTMLAttributes<HTMLDivElement>;
  kanbanDepthMode: KanbanDepthMode;
  searchQuery: string;
  t: TFunction;
}

interface UseFeedPageShellConfigResult {
  mobileController: FeedPageMobileController;
  desktopHeader: FeedPageDesktopHeaderConfig;
  desktopContent: FeedPageDesktopContentConfig;
  desktopSidebarController: FeedSidebarState;
}

export function useFeedPageShellConfig({
  canCreateContent,
  profileCompletionPromptSignal,
  currentView,
  isOnboardingOpen,
  isAuthModalOpen,
  activeOnboardingStepId,
  isManageRouteActive,
  failedPublishDrafts,
  visibleFailedPublishDrafts,
  selectedPublishableRelayIds,
  relaysWithActiveState,
  channelsWithState,
  collapsedPreviewChannels,
  channelMatchMode,
  peopleWithState,
  collapsedPreviewPeople,
  nostrRelays,
  isSidebarFocused,
  quickFilters,
  savedFilterConfigurations,
  activeSavedFilterConfigurationId,
  pinnedChannelIds,
  pinnedPersonIds,
  desktopSwipeHandlers,
  kanbanDepthMode,
  searchQuery,
  t,
}: UseFeedPageShellConfigOptions): UseFeedPageShellConfigResult {
  const mobileController = useMemo(
    () => ({
      viewState: {
        canCreateContent,
        profileCompletionPromptSignal,
        currentView,
        isOnboardingOpen: isOnboardingOpen && !isAuthModalOpen,
        activeOnboardingStepId,
        isManageRouteActive,
      },
      publishState: {
        failedPublishDrafts,
        visibleFailedPublishDrafts,
        selectedPublishableRelayIds,
      },
    }),
    [
      activeOnboardingStepId,
      canCreateContent,
      currentView,
      failedPublishDrafts,
      isAuthModalOpen,
      isManageRouteActive,
      isOnboardingOpen,
      profileCompletionPromptSignal,
      selectedPublishableRelayIds,
      visibleFailedPublishDrafts,
    ]
  );

  const desktopHeader = useMemo(
    () => ({
      currentView,
    }),
    [currentView]
  );

  const desktopSidebarController = useMemo(
    () => ({
      relays: relaysWithActiveState,
      channels: channelsWithState,
      collapsedPreviewChannels,
      channelMatchMode,
      people: peopleWithState,
      collapsedPreviewPeople,
      nostrRelays,
      isFocused: isSidebarFocused,
      quickFilters,
      savedFilterConfigurations,
      activeSavedFilterConfigurationId,
      pinnedChannelIds,
      pinnedPersonIds,
    }),
    [
      activeSavedFilterConfigurationId,
      channelMatchMode,
      channelsWithState,
      collapsedPreviewChannels,
      collapsedPreviewPeople,
      isSidebarFocused,
      nostrRelays,
      peopleWithState,
      pinnedChannelIds,
      pinnedPersonIds,
      quickFilters,
      relaysWithActiveState,
      savedFilterConfigurations,
    ]
  );

  const desktopContent = useMemo(
    () => ({
      failedPublishQueueBannerState: {
        drafts: failedPublishDrafts,
        selectedFeedDrafts: visibleFailedPublishDrafts,
        selectedRelayIds: selectedPublishableRelayIds,
      },
      desktopSwipeHandlers,
      viewPane: (
        <FeedPageViewPane
          currentView={currentView}
          kanbanDepthMode={kanbanDepthMode}
          loadingLabel={t("app.loadingView")}
        />
      ),
      searchDockState: {
        searchQuery,
        showKanbanLevels: currentView === "kanban" || currentView === "list",
        kanbanDepthMode,
      },
    }),
    [
      currentView,
      desktopSwipeHandlers,
      failedPublishDrafts,
      kanbanDepthMode,
      searchQuery,
      selectedPublishableRelayIds,
      t,
      visibleFailedPublishDrafts,
    ]
  );

  return {
    mobileController,
    desktopHeader,
    desktopContent,
    desktopSidebarController,
  };
}
