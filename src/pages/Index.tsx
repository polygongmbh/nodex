import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFeedNavigation } from "@/features/feed-page/controllers/use-feed-navigation";
import { useFocusedTaskCollapsedSidebarPreview } from "@/features/feed-page/controllers/use-focused-task-collapsed-sidebar-preview";
import { useTaskScopeSpecificFilters } from "@/features/feed-page/controllers/use-task-scope-specific-filters";
import { useNostrEventCache } from "@/infrastructure/nostr/use-nostr-event-cache";
import { useKeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { OnboardingController } from "@/components/onboarding/OnboardingController";
import { NostrEventKind } from "@/lib/nostr/types";
import { filterTasksByRelayAndPeople } from "@/domain/content/task-filtering";
import { buildFilterSnapshot, type FilterSnapshot } from "@/domain/content/filter-snapshot";
import { useIndexFilters } from "@/features/feed-page/controllers/use-index-filters";
import { useOnboarding } from "@/components/onboarding/use-onboarding";
import { useSavedFilterConfigs } from "@/features/feed-page/controllers/use-saved-filter-configs";
import { useTaskPublishFlow } from "@/features/feed-page/controllers/use-task-publish-flow";
import { useTaskPublishControls } from "@/features/feed-page/controllers/use-task-publish-controls";
import { useTaskStatusController } from "@/features/feed-page/controllers/use-task-status-controller";
import { useKind0People } from "@/infrastructure/nostr/use-kind0-people";
import { useIndexDerivedData } from "@/features/feed-page/controllers/use-index-derived-data";
import { useFeedSidebarCommandsController } from "@/features/feed-page/controllers/use-feed-sidebar-commands-controller";
import type { FeedViewCommands } from "@/features/feed-page/controllers/feed-view-commands-context";
import type { FeedTaskCommands } from "@/features/feed-page/controllers/feed-task-commands-context";
import { useFeedInteractionFrecency } from "@/features/feed-page/controllers/use-feed-interaction-frecency";
import { useIndexRelayShell } from "@/features/feed-page/controllers/use-index-relay-shell";
import { useAuthModalRoute } from "@/features/feed-page/controllers/use-auth-modal-route";
import { useListingStatusPublish } from "@/features/feed-page/controllers/use-listing-status-publish";
import { useFeedAuthPolicy } from "@/features/feed-page/controllers/use-feed-auth-policy";
import { useRelayScopedPresence } from "@/features/feed-page/controllers/use-relay-scoped-presence";
import { type FeedPageCoreHandlers } from "@/features/feed-page/views/FeedPageProviders";
import { applyTaskSortOverlays } from "@/domain/content/task-collections";
import { buildTaskViewFilterIndex, filterTasksForView } from "@/domain/content/task-view-filtering";
import { resolveChannelRelayScopeIds } from "@/domain/relays/relay-scope";
import { DEMO_RELAY_ID } from "@/lib/demo-feed-config";
import { initializeDemoFeedData } from "@/data/demo-feed";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import {
  DesktopAppShell,
} from "@/features/feed-page/views/DesktopAppShell";
import {
  FeedPageMobileShell,
} from "@/features/feed-page/views/FeedPageMobileShell";
import {
  type FeedTaskViewModel,
} from "@/features/feed-page/views/feed-task-view-model-context";
import { FeedPageProviders } from "@/features/feed-page/views/FeedPageProviders";
import { FeedRelayProvider, useFeedRelayState } from "@/features/feed-page/views/FeedRelayProvider";
import { MotdBanner } from "@/components/MotdBanner";
import { featureDebugLog } from "@/lib/feature-debug";

function FeedIndexContent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { publishEvent, setPresenceRelayUrls, user, defaultNoasHostUrl } = useNDK();

  const {
    isAuthModalOpen,
    authModalInitialStep,
    handleOpenAuthModal,
    handleCloseAuthModal,
  } = useAuthModalRoute();

  const {
    relays,
    ndkRelays,
    demoFeedActive,
    demoTasks,
    setDemoTasks,
    isConnected,
    subscribe,
    activeRelayIds,
    setActiveRelayIds,
    effectiveActiveRelayIds,
    selectedRelayUrls,
    nostrRelayIdSet,
    allRelayIds,
    handleRelayToggle,
    handleRelayExclusive,
    handleRelaySelectIntent,
    handleToggleAllRelays,
    reconnectRelay,
    reorderRelays,
    addRelay,
    removeRelay,
  } = useFeedRelayState();

  const subscribedKinds = useMemo<NostrEventKind[]>(
    () => [
      NostrEventKind.TextNote,
      NostrEventKind.Task,
      NostrEventKind.Metadata,
      NostrEventKind.GitStatusOpen,
      NostrEventKind.GitStatusApplied,
      NostrEventKind.GitStatusClosed,
      NostrEventKind.GitStatusDraft,
      NostrEventKind.Procedure,
      NostrEventKind.ClassifiedListing,
      NostrEventKind.CalendarDateBased,
      NostrEventKind.CalendarTimeBased,
      NostrEventKind.UserStatus,
    ],
    []
  );

  const isMobile = useIsMobile();
  const {
    events: nostrEvents,
    hasLiveHydratedScope: hasLiveHydratedRelayScope,
    isHydrating,
  } = useNostrEventCache({
    isConnected,
    subscribedKinds,
    activeRelayIds: nostrRelayIdSet,
    availableRelayIds: allRelayIds,
    subscribe,
  });

  const {
    people,
    setPeople,
    cachedKind0Events,
    latestPresenceByAuthor,
    removeCachedRelayProfile,
  } = useKind0People(
    nostrEvents,
    selectedRelayUrls,
    user,
  );

  const {
    nostrRelays,
    relaysWithActiveState,
    handleAddRelay,
    handleRemoveRelay,
  } = useIndexRelayShell({
    ndkRelays,
    relays,
    effectiveActiveRelayIds,
    addRelay,
    removeRelay,
    setActiveRelayIds,
    removeCachedRelayProfile,
  });

  const searchQuery = usePreferencesStore((s) => s.searchQuery);
  const setSearchQuery = usePreferencesStore((s) => s.setSearchQuery);
  const [isSidebarFocused, setIsSidebarFocused] = useState(false);
  const {
    channelFrecencyState,
    personFrecencyState,
    dispatchFrecencyIntent,
    interactionEffects: frecencyInteractionEffects,
  } = useFeedInteractionFrecency();

  const {
    allTasks: baseAllTasks,
    channels,
    composeChannels,
    mentionAutocompletePeople,
    sidebarPeople,
    currentUser,
    hasCurrentUserProfileMetadata,
  } = useIndexDerivedData({
    nostrEvents,
    demoTasks,
    people,
    latestPresenceByAuthor,
    cachedKind0Events,
    user,
    effectiveActiveRelayIds,
    relays,
    channelFrecencyState,
    personFrecencyState,
    isHydrating,
  });

  const sidebarPeopleWithSelected = useMemo(() => {
    const sidebarIds = new Set(sidebarPeople.map((person) => person.id));
    const selectedMissing = people.filter((person) => person.isSelected && !sidebarIds.has(person.id));
    return [...selectedMissing, ...sidebarPeople];
  }, [people, sidebarPeople]);

  const {
    mentionRequest,
    setMentionRequest,
    channelFilterStates,
    setChannelFilterStates,
    channelMatchMode,
    setChannelMatchMode,
    composeChannelsWithState,
    quickFilters,
    setQuickFilters,
    handlers: filterHandlers,
    resetFiltersToDefault,
    toggleChannel,
    showOnlyChannel,
    toggleAllChannels,
    togglePerson,
    showOnlyPerson,
    toggleAllPeople,
  } = useIndexFilters({
    relays,
    activeRelayIds,
    setActiveRelayIds,
    channels,
    composeChannels,
    people,
    setPeople,
    sidebarPeople: sidebarPeopleWithSelected,
    hasLiveHydratedScope: hasLiveHydratedRelayScope,
    isHydrating,
  });

  const {
    authPolicy,
    profileCompletionPromptSignal,
  } = useFeedAuthPolicy({
    hasCurrentUserProfileMetadata,
  });

  const shortcutsHelp = useKeyboardShortcutsHelp();
  const displayDepthMode = usePreferencesStore((s) => s.displayDepthMode);
  const setDisplayDepthMode = usePreferencesStore((s) => s.setDisplayDepthMode);
  const compactTaskCardsEnabled = usePreferencesStore((s) => s.compactTaskCardsEnabled);
  const setCompactTaskCardsEnabled = usePreferencesStore((s) => s.setCompactTaskCardsEnabled);

  const handleToggleChannelMatchModeShortcut = useCallback(() => {
    setChannelMatchMode((previous) => {
      const next = previous === "and" ? "or" : "and";
      featureDebugLog("keyboard-shortcuts", "Toggled channel match mode via keyboard shortcut", {
        previousMode: previous,
        nextMode: next,
      });
      return next;
    });
  }, [setChannelMatchMode]);

  const handleToggleRecentFilterShortcut = useCallback(() => {
    setQuickFilters((previous) => {
      const next = { ...previous, recentEnabled: !previous.recentEnabled };
      featureDebugLog("keyboard-shortcuts", "Toggled recent quick filter via keyboard shortcut", {
        enabled: next.recentEnabled,
        recentDays: next.recentDays,
      });
      return next;
    });
  }, [setQuickFilters]);

  const handleTogglePriorityFilterShortcut = useCallback(() => {
    setQuickFilters((previous) => {
      const next = { ...previous, priorityEnabled: !previous.priorityEnabled };
      featureDebugLog("keyboard-shortcuts", "Toggled priority quick filter via keyboard shortcut", {
        enabled: next.priorityEnabled,
        minPriority: next.minPriority,
      });
      return next;
    });
  }, [setQuickFilters]);

  const handleToggleCompactTaskCards = useCallback(() => {
    const next = !compactTaskCardsEnabled;
    featureDebugLog("compact-cards", "Toggled compact task cards", { enabled: next });
    setCompactTaskCardsEnabled(next);
  }, [compactTaskCardsEnabled, setCompactTaskCardsEnabled]);

  const {
    hasDisconnectedSelectedRelays,
    isInteractionBlocked,
    guardInteraction,
    handleBlockedInteractionAttempt,
    resolveRelayUrlsFromIds,
    resolveTaskOriginRelay,
    publishTaskStateUpdate,
    publishTaskDueUpdate,
    publishTaskPriorityUpdate,
    publishTaskCreateFollowUps,
  } = useTaskPublishControls({
    allTasks: baseAllTasks,
    relays,
    effectiveActiveRelayIds,
    demoFeedActive,
    canModifyContent: authPolicy.canModifyContent,
    handleOpenAuthModal,
    publishEvent,
  });

  const {
    handleToggleComplete,
    handleStatusChange,
    sortStatusHoldByTaskId,
    sortModifiedAtHoldByTaskId,
  } = useTaskStatusController({
    allTasks: baseAllTasks,
    currentUser,
    guardInteraction,
    publishTaskStateUpdate,
  });

  const allTasks = useMemo(
    () =>
      applyTaskSortOverlays(
        baseAllTasks,
        sortStatusHoldByTaskId,
        sortModifiedAtHoldByTaskId
      ),
    [baseAllTasks, sortModifiedAtHoldByTaskId, sortStatusHoldByTaskId]
  );

  const {
    currentView,
    focusedTaskId,
    focusedTask,
    isManageRouteActive,
    setCurrentView,
    setFocusedTaskId,
    setManageRouteActive,
    desktopSwipeHandlers,
    openedWithFocusedTaskRef,
  } = useFeedNavigation({
    allTasks,
    isMobile,
    effectiveActiveRelayIds,
    relays,
    onToggleChannelMatchMode: handleToggleChannelMatchModeShortcut,
    onToggleRecentFilter: handleToggleRecentFilterShortcut,
    onTogglePriorityFilter: handleTogglePriorityFilterShortcut,
    onToggleCompactView: handleToggleCompactTaskCards,
  });

  const currentFilterSnapshot = useMemo<FilterSnapshot>(
    () =>
      buildFilterSnapshot({
        activeRelayIds: effectiveActiveRelayIds,
        channelFilterStates,
        people,
        channelMatchMode,
        quickFilters,
      }),
    [effectiveActiveRelayIds, channelFilterStates, people, channelMatchMode, quickFilters]
  );

  const { savedFilterController } = useSavedFilterConfigs({
    currentFilterSnapshot,
    relays,
    setActiveRelayIds,
    setChannelFilterStates,
    setChannelMatchMode,
    setPeople,
    setQuickFilters,
    resetFiltersToDefault,
  });

  const sidebarChannels = useMemo(() => {
    const activeChannelIds = new Set(
      Array.from(channelFilterStates.entries())
        .filter(([, state]) => state !== "neutral")
        .map(([id]) => id)
    );
    if (activeChannelIds.size === 0) return channels;

    const existingIds = new Set(channels.map((channel) => channel.id));
    const selectedComposeChannels = composeChannels.filter(
      (channel) =>
        channel.usageCount !== 0 &&
        activeChannelIds.has(channel.id) &&
        !existingIds.has(channel.id)
    );
    return [...selectedComposeChannels, ...channels];
  }, [channelFilterStates, channels, composeChannels]);

  const {
    commands: sidebarCommands,
    channelsWithState,
    peopleWithState,
  } = useFeedSidebarCommandsController({
    userPubkey: user?.pubkey,
    effectiveActiveRelayIds,
    sidebarChannels,
    channelFilterStates,
    sidebarPeople: sidebarPeopleWithSelected,
    allTasks,
    onToggleChannel: toggleChannel,
    onShowOnlyChannel: showOnlyChannel,
    onToggleAllChannels: toggleAllChannels,
    onSetChannelMatchMode: setChannelMatchMode,
    onTogglePerson: togglePerson,
    onShowOnlyPerson: showOnlyPerson,
    onToggleAllPeople: toggleAllPeople,
    onRelaySelect: handleRelaySelectIntent,
    onRelayToggle: handleRelayToggle,
    onRelayExclusive: handleRelayExclusive,
    onToggleAllRelays: handleToggleAllRelays,
    onAddRelay: handleAddRelay,
    onReorderRelays: reorderRelays,
    onRemoveRelay: handleRemoveRelay,
    onReconnectRelay: reconnectRelay,
    onApplySavedFilter: savedFilterController.onApplyConfiguration,
    onSaveCurrentFilter: savedFilterController.onSaveCurrentConfiguration,
    onRenameSavedFilter: savedFilterController.onRenameConfiguration,
    onDeleteSavedFilter: savedFilterController.onDeleteConfiguration,
  });

  const focusedTaskCollapsedSidebarPreview = useFocusedTaskCollapsedSidebarPreview({
    allTasks,
    focusedTaskId,
    activeRelayIds: effectiveActiveRelayIds,
    channels: channelsWithState,
    people: peopleWithState,
    allowUnknownRelayMetadata: !hasLiveHydratedRelayScope,
  });

  const relayScopedTasks = useMemo(
    () =>
      filterTasksByRelayAndPeople({
        tasks: allTasks,
        activeRelayIds: effectiveActiveRelayIds,
        people: [],
        allowUnknownRelayMetadata: !hasLiveHydratedRelayScope,
      }),
    [allTasks, effectiveActiveRelayIds, hasLiveHydratedRelayScope]
  );

  const shouldRestoreTaskScopeFilters = useCallback((snapshot: FilterSnapshot) => {
    const selectedPeopleIds = new Set(snapshot.selectedPeopleIds);
    const snapshotPeople = people.map((person) => ({
      ...person,
      isSelected: selectedPeopleIds.has(person.id),
    }));
    const snapshotFilterIndex = buildTaskViewFilterIndex(allTasks, snapshotPeople);
    const prefilteredTaskIds = new Set(relayScopedTasks.map((task) => task.id));
    const includedChannels = Object.entries(snapshot.channelStates)
      .filter(([, filterState]) => filterState === "included")
      .map(([channelId]) => channelId.trim().toLowerCase())
      .filter(Boolean);
    const excludedChannels = Object.entries(snapshot.channelStates)
      .filter(([, filterState]) => filterState === "excluded")
      .map(([channelId]) => channelId.trim().toLowerCase())
      .filter(Boolean);

    return filterTasksForView({
      source: {
        allTasks,
        filterIndex: snapshotFilterIndex,
        prefilteredTaskIds,
        people: snapshotPeople,
      },
      criteria: {
        searchQuery,
        quickFilters: snapshot.quickFilters,
        channels: {
          included: includedChannels,
          excluded: excludedChannels,
          matchMode: snapshot.channelMatchMode,
        },
      },
    }).length > 0;
  }, [allTasks, people, relayScopedTasks, searchQuery]);

  const { discardTaskScopeFilterRestore } = useTaskScopeSpecificFilters({
    focusedTaskId,
    currentFilterSnapshot,
    shouldRestoreSnapshot: shouldRestoreTaskScopeFilters,
    setChannelFilterStates,
    setChannelMatchMode,
    setPeople,
  });

  const {
    isOnboardingOpen,
    onboardingInitialSection,
    onboardingManualStart,
    activeOnboardingStepId,
    onboardingSections,
    onboardingStepsBySection,
    forceShowComposeForGuide,
    composeGuideActivationSignal,
    openGuideAsStartup,
    handleOpenGuide,
    handleCloseGuide,
    handleOnboardingStepChange,
    handleOnboardingActiveSectionChange,
  } = useOnboarding({
    user,
    isMobile,
    currentView,
    onBeforeResetFocusedTaskScope: discardTaskScopeFilterRestore,
    setCurrentView,
    setFocusedTaskId,
    setPeople,
  });

  const { handleListingStatusChange } = useListingStatusPublish({
    allTasks,
    currentUser,
    guardInteraction,
    publishEvent,
    resolveTaskOriginRelay,
  });

  const {
    composeRestoreRequest,
    isPendingPublishTask,
    handleUndoPendingPublish,
    handleNewTask,
    handleRetryFailedPublish,
    handleRepostFailedPublish,
    handleDismissFailedPublish,
    handleDismissAllFailedPublish,
    handleDueDateChange,
    handlePriorityChange,
  } = useTaskPublishFlow({
    allTasks,
    relays,
    people,
    currentUser,
    user,
    canCreateContent: authPolicy.canCreateContent,
    effectiveActiveRelayIds,
    demoFeedActive,
    demoRelayId: DEMO_RELAY_ID,
    queryClient,
    dispatchFrecencyIntent,
    guardInteraction,
    hasDisconnectedSelectedRelays,
    resolveRelayUrlsFromIds,
    publishEvent,
    publishTaskDueUpdate,
    publishTaskPriorityUpdate,
    publishTaskCreateFollowUps,
  });

  const { publishOfflinePresenceNow } = useRelayScopedPresence({
    userPubkey: user?.pubkey,
    currentView,
    focusedTask,
    relayScopeIds: resolveChannelRelayScopeIds(
      effectiveActiveRelayIds,
      relays.map((relay) => relay.id)
    ),
    relays,
    publishEvent,
    setPresenceRelayUrls,
  });

  useEffect(() => {
    if (!user?.pubkey) return;

    const publishOfflinePresence = () => {
      void publishOfflinePresenceNow();
    };

    window.addEventListener("pagehide", publishOfflinePresence);
    window.addEventListener("beforeunload", publishOfflinePresence);
    return () => {
      window.removeEventListener("pagehide", publishOfflinePresence);
      window.removeEventListener("beforeunload", publishOfflinePresence);
    };
  }, [publishOfflinePresenceNow, user?.pubkey]);

  const handleBeforeOnboardingTour = useCallback(() => {
    if (!demoFeedActive && allTasks.length === 0) {
      setDemoTasks(initializeDemoFeedData());
      setActiveRelayIds((previous) => {
        const next = new Set(previous);
        next.add(DEMO_RELAY_ID);
        return next;
      });
      navigate("/feed");
    }
  }, [demoFeedActive, allTasks.length, setDemoTasks, setActiveRelayIds, navigate]);

  const viewCommands = useMemo<FeedViewCommands>(
    () => ({
      focusSidebar: () => setIsSidebarFocused(true),
      focusTasks: () => setIsSidebarFocused(false),
      setCurrentView,
      setSearchQuery,
      setDisplayDepthMode,
      setManageRouteActive,
    }),
    [setCurrentView, setSearchQuery, setDisplayDepthMode, setManageRouteActive, setIsSidebarFocused]
  );

  const taskCommands = useMemo<FeedTaskCommands>(
    () => ({
      focusTask: setFocusedTaskId,
      createTask: handleNewTask,
      toggleComplete: handleToggleComplete,
      changeStatus: handleStatusChange,
      updateDueDate: handleDueDateChange,
      updatePriority: handlePriorityChange,
      changeListingStatus: handleListingStatusChange,
      undoPendingPublish: handleUndoPendingPublish,
      retryFailedPublish: handleRetryFailedPublish,
      repostFailedPublish: handleRepostFailedPublish,
      dismissFailedPublish: handleDismissFailedPublish,
      dismissAllFailedPublish: handleDismissAllFailedPublish,
    }),
    [
      setFocusedTaskId, handleNewTask, handleToggleComplete, handleStatusChange,
      handleDueDateChange, handlePriorityChange, handleListingStatusChange,
      handleUndoPendingPublish, handleRetryFailedPublish, handleRepostFailedPublish,
      handleDismissFailedPublish, handleDismissAllFailedPublish,
    ]
  );

  const coreHandlers = useMemo<FeedPageCoreHandlers>(
    () => ({
      onOpenAuthModal: handleOpenAuthModal,
      onOpenShortcutsHelp: shortcutsHelp.open,
      onOpenGuide: handleOpenGuide,
      onGuardInteraction: (mode) => guardInteraction(mode === "create" ? "post" : mode),
      filterHandlers,
      interactionEffects: frecencyInteractionEffects,
    }),
    [handleOpenAuthModal, shortcutsHelp.open, handleOpenGuide, guardInteraction, filterHandlers, frecencyInteractionEffects]
  );
  const feedTaskViewModel: FeedTaskViewModel = useMemo(
    () => ({
      tasks: relayScopedTasks,
      allTasks,
      currentUser,
      focusedTaskId,
      isPendingPublishTask,
      composeRestoreRequest,
      mentionRequest,
      onMentionRequestConsumed: (requestId: number) => {
        setMentionRequest((current) => (current?.id === requestId ? null : current));
      },
      forceShowComposer: forceShowComposeForGuide,
      composeGuideActivationSignal,
      isInteractionBlocked,
      onBlockedInteractionAttempt: handleBlockedInteractionAttempt,
      isHydrating,
    }),
    [
      relayScopedTasks,
      allTasks,
      currentUser,
      focusedTaskId,
      isPendingPublishTask,
      composeRestoreRequest,
      mentionRequest,
      setMentionRequest,
      forceShowComposeForGuide,
      composeGuideActivationSignal,
      isInteractionBlocked,
      handleBlockedInteractionAttempt,
      isHydrating,
    ]
  );

  const feedSurfaceState = useMemo(
    () => ({
      relays: relaysWithActiveState.map((relay) => ({
        id: relay.id,
        name: relay.name,
        isActive: relay.isActive,
        connectionStatus: relay.connectionStatus,
        url: relay.url,
      })),
      channels: channelsWithState,
      visibleChannels: channelsWithState,
      composeChannels: composeChannelsWithState,
      people,
      visiblePeople: peopleWithState,
      mentionablePeople: mentionAutocompletePeople,
      searchQuery,
      quickFilters,
      channelMatchMode,
    }),
    [
      relaysWithActiveState,
      channelsWithState,
      composeChannelsWithState,
      people,
      peopleWithState,
      mentionAutocompletePeople,
      searchQuery,
      quickFilters,
      channelMatchMode,
    ]
  );

  const desktopSidebarController = useMemo(
    () => ({
      relays: relaysWithActiveState,
      channels: channelsWithState,
      collapsedPreviewChannels: focusedTaskCollapsedSidebarPreview.channels,
      channelMatchMode,
      people: peopleWithState,
      collapsedPreviewPeople: focusedTaskCollapsedSidebarPreview.people,
      nostrRelays,
      isFocused: isSidebarFocused,
      quickFilters,
      savedFilterConfigurations: savedFilterController.configurations,
      activeSavedFilterConfigurationId: savedFilterController.activeConfigurationId,
    }),
    [
      channelMatchMode,
      channelsWithState,
      focusedTaskCollapsedSidebarPreview.channels,
      focusedTaskCollapsedSidebarPreview.people,
      isSidebarFocused,
      nostrRelays,
      peopleWithState,
      quickFilters,
      relaysWithActiveState,
      savedFilterController,
    ]
  );

  const feedViewState = useMemo(
    () => ({
      currentView,
      displayDepthMode,
      isSidebarFocused,
      isOnboardingOpen: isOnboardingOpen && !isAuthModalOpen,
      activeOnboardingStepId,
      isManageRouteActive,
      canCreateContent: authPolicy.canCreateContent,
      profileCompletionPromptSignal,
      desktopSwipeHandlers,
    }),
    [
      activeOnboardingStepId,
      authPolicy.canCreateContent,
      currentView,
      desktopSwipeHandlers,
      isAuthModalOpen,
      isManageRouteActive,
      isOnboardingOpen,
      isSidebarFocused,
      displayDepthMode,
      profileCompletionPromptSignal,
    ]
  );

  const onboardingController = (
    <OnboardingController
      isOnboardingOpen={isOnboardingOpen}
      onboardingManualStart={onboardingManualStart}
      onboardingInitialSection={onboardingInitialSection}
      onboardingSections={onboardingSections}
      onboardingStepsBySection={onboardingStepsBySection}
      currentView={currentView}
      focusedTaskId={focusedTaskId}
      openedWithFocusedTaskRef={openedWithFocusedTaskRef}
      openGuideAsStartup={openGuideAsStartup}
      handleCloseGuide={handleCloseGuide}
      handleOnboardingStepChange={handleOnboardingStepChange}
      handleOnboardingActiveSectionChange={handleOnboardingActiveSectionChange}
      onBeforeStartTour={handleBeforeOnboardingTour}
      onOpenAuthModal={handleOpenAuthModal}
    />
  );

  return (
    <FeedPageProviders
      coreHandlers={coreHandlers}
      surfaceState={feedSurfaceState}
      taskViewModel={feedTaskViewModel}
      viewState={feedViewState}
      sidebarCommands={sidebarCommands}
      viewCommands={viewCommands}
      taskCommands={taskCommands}
      sidebarController={isMobile ? undefined : desktopSidebarController}
    >
      <MotdBanner />
      {isMobile ? (
        <FeedPageMobileShell
          authModalProps={{
            isOpen: isAuthModalOpen,
            onClose: handleCloseAuthModal,
            initialStep: authModalInitialStep,
          }}
        />
      ) : (
        <DesktopAppShell
          shortcutsHelpProps={{ isOpen: shortcutsHelp.isOpen, onClose: shortcutsHelp.close }}
          authModalProps={{
            isOpen: isAuthModalOpen,
            onClose: handleCloseAuthModal,
            initialStep: authModalInitialStep,
          }}
        />
      )}
      {onboardingController}
    </FeedPageProviders>
  );
}

const Index = () => (
  <FeedRelayProvider>
    <FeedIndexContent />
  </FeedRelayProvider>
);

export default Index;
