import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { type KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFeedNavigation } from "@/features/feed-page/controllers/use-feed-navigation";
import { useFocusedTaskCollapsedSidebarPreview } from "@/features/feed-page/controllers/use-focused-task-collapsed-sidebar-preview";
import { useTaskScopeSpecificFilters } from "@/features/feed-page/controllers/use-task-scope-specific-filters";
import { useNostrEventCache } from "@/infrastructure/nostr/use-nostr-event-cache";
import { useKeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import { OnboardingIntroPopover } from "@/components/onboarding/OnboardingIntroPopover";
import { getRelayIdFromUrl, getRelayNameFromUrl } from "@/infrastructure/nostr/relay-identity";
import { NostrEventKind } from "@/lib/nostr/types";
import { shouldPromptSignInAfterOnboarding } from "@/lib/onboarding-auth-prompt";
import { filterTasksByRelayAndPeople } from "@/domain/content/task-filtering";
import { loadPresencePublishingEnabled } from "@/infrastructure/preferences/user-preferences-storage";
import {
  loadCompactTaskCardsEnabled,
  saveCompactTaskCardsEnabled,
} from "@/infrastructure/preferences/user-preferences-storage";
import { buildFilterSnapshot, type FilterSnapshot } from "@/domain/content/filter-snapshot";
import type { Nip99ListingStatus } from "@/types";
import { useIndexFilters } from "@/features/feed-page/controllers/use-index-filters";
import { useIndexOnboarding } from "@/features/feed-page/controllers/use-index-onboarding";
import { useSavedFilterConfigs } from "@/features/feed-page/controllers/use-saved-filter-configs";
import { useTaskPublishFlow } from "@/features/feed-page/controllers/use-task-publish-flow";
import { useTaskPublishControls } from "@/features/feed-page/controllers/use-task-publish-controls";
import { useTaskStatusController } from "@/features/feed-page/controllers/use-task-status-controller";
import { useKind0People } from "@/infrastructure/nostr/use-kind0-people";
import { useIndexDerivedData } from "@/features/feed-page/controllers/use-index-derived-data";
import { usePinnedSidebarChannels } from "@/features/feed-page/controllers/use-pinned-sidebar-channels";
import { usePinnedSidebarPeople } from "@/features/feed-page/controllers/use-pinned-sidebar-people";
import { useFeedInteractionFrecency } from "@/features/feed-page/controllers/use-feed-interaction-frecency";
import { deriveSelectedRelayUrls, useIndexRelayShell } from "@/features/feed-page/controllers/use-index-relay-shell";
import { useAuthModalRoute } from "@/features/feed-page/controllers/use-auth-modal-route";
import { useListingStatusPublish } from "@/features/feed-page/controllers/use-listing-status-publish";
import { useRelayAutoReconnect } from "@/features/feed-page/controllers/use-relay-auto-reconnect";
import { useFeedAuthPolicy } from "@/features/feed-page/controllers/use-feed-auth-policy";
import { useRelayScopedPresence } from "@/features/feed-page/controllers/use-relay-scoped-presence";
import { useRelaySelectionController } from "@/features/feed-page/controllers/use-relay-selection-controller";
import { useIndexFeedInteractionBus } from "@/features/feed-page/controllers/use-index-feed-interaction-bus";
import { applyTaskSortOverlays } from "@/domain/content/task-collections";
import { buildTaskViewFilterIndex, filterTasksForView } from "@/domain/content/task-view-filtering";
import { resolveChannelRelayScopeIds } from "@/domain/relays/relay-scope";
import { isDemoFeedEnabled } from "@/lib/demo-feed-config";
import { initializeDemoFeedData } from "@/data/demo-feed";
import { mockRelays as demoRelays } from "@/data/mockData";
import {
  Relay,
  PostedTag,
  Task,
  TaskStatus,
} from "@/types";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  FeedPageDesktopShell,
} from "@/features/feed-page/views/FeedPageDesktopShell";
import {
  FeedPageMobileShell,
} from "@/features/feed-page/views/FeedPageMobileShell";
import { useFeedPageShellConfig } from "@/features/feed-page/views/use-feed-page-shell-config";
import {
  type FeedPageUiConfig,
} from "@/features/feed-page/views/feed-page-ui-config";
import {
  type FeedTaskViewModel,
} from "@/features/feed-page/views/feed-task-view-model-context";
import { FeedPageProviders } from "@/features/feed-page/views/FeedPageProviders";
import { MotdBanner } from "@/components/MotdBanner";
import { featureDebugLog } from "@/lib/feature-debug";

// Demo relay constant
const DEMO_RELAY_ID = "demo";
const DEMO_FEED_ENABLED = isDemoFeedEnabled(import.meta.env.VITE_ENABLE_DEMO_FEED);
const Index = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // NDK Nostr integration
  const {
    relays: ndkRelays,
    isConnected: isNostrConnected,
    addRelay,
    reorderRelays,
    removeRelay,
    reconnectRelay,
    subscribe,
    publishEvent,
    setPresenceRelayUrls,
    user,
  } = useNDK();

  const {
    isAuthModalOpen,
    authModalInitialStep,
    setIsAuthModalOpen,
    handleOpenAuthModal,
    handleCloseAuthModal,
  } = useAuthModalRoute();
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [demoTasks, setDemoTasks] = useState<Task[]>(() => (
    DEMO_FEED_ENABLED ? initializeDemoFeedData() : []
  ));
  const demoFeedActive = demoTasks.some((task) => task.relays.includes(DEMO_RELAY_ID));

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

  // Convert relay statuses to app Relay format - combine demo relay with nostr relays
  const relays: Relay[] = useMemo(() => {
    const nostrRelayItems: Relay[] = ndkRelays.map((r): Relay => ({
      id: getRelayIdFromUrl(r.url),
      name: getRelayNameFromUrl(r.url),
      icon: "radio",
      isActive: r.status === "connected" || r.status === "read-only",
      connectionStatus: r.status,
      url: r.url,
    }));

    if (!demoFeedActive) return nostrRelayItems;

    // Include demo relay
    return [...demoRelays, ...nostrRelayItems];
  }, [demoFeedActive, ndkRelays]);

  const isMobile = useIsMobile();
  const {
    activeRelayIds,
    setActiveRelayIds,
    effectiveActiveRelayIds,
    handleRelayToggle,
    handleRelayExclusive,
    handleRelaySelectIntent,
    handleToggleAllRelays,
  } = useRelaySelectionController({
    relays,
    t,
  });
  useRelayAutoReconnect({
    relays,
    activeRelayIds,
    reconnectRelay,
  });

  const {
    events: nostrEvents,
    hasLiveHydratedScope: hasLiveHydratedRelayScope,
    isHydrating,
  } = useNostrEventCache({
    isConnected: isNostrConnected,
    subscribedKinds,
    activeRelayIds: new Set(
      relays
        .map((relay) => relay.id)
        .filter((relayId) => relayId !== DEMO_RELAY_ID)
    ),
    availableRelayIds: relays.map((relay) => relay.id),
    subscribe,
  });
  const selectedRelayUrls = useMemo(
    () => deriveSelectedRelayUrls(relays, effectiveActiveRelayIds),
    [effectiveActiveRelayIds, relays]
  );

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

  const [postedTags, setPostedTags] = useState<PostedTag[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarFocused, setIsSidebarFocused] = useState(false);
  const [suppressedNostrEventIds, setSuppressedNostrEventIds] = useState<Set<string>>(new Set());
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
    hasCachedCurrentUserProfileMetadata,
  } = useIndexDerivedData({
    nostrEvents,
    demoTasks,
    localTasks,
    postedTags,
    suppressedNostrEventIds,
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
  } = useIndexFilters({
    relays,
    setActiveRelayIds,
    channels,
    composeChannels,
    setPostedTags,
    people,
    setPeople,
    sidebarPeople: sidebarPeopleWithSelected,
    hasLiveHydratedScope: hasLiveHydratedRelayScope,
    isHydrating,
    t,
  });

  const {
    authPolicy,
    profileCompletionPromptSignal,
  } = useFeedAuthPolicy({
    hasCachedCurrentUserProfileMetadata,
  });

  const shortcutsHelp = useKeyboardShortcutsHelp();
  const [kanbanDepthMode, setKanbanDepthMode] = useState<KanbanDepthMode>("leaves");
  const [compactTaskCardsEnabled, setCompactTaskCardsEnabled] = useState<boolean>(() =>
    loadCompactTaskCardsEnabled()
  );

  useEffect(() => {
    saveCompactTaskCardsEnabled(compactTaskCardsEnabled);
  }, [compactTaskCardsEnabled]);

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
    setCompactTaskCardsEnabled((previous) => {
      const next = !previous;
      featureDebugLog("compact-cards", "Toggled compact task cards", { enabled: next });
      return next;
    });
  }, []);

  const {
    hasDisconnectedSelectedRelays,
    isInteractionBlocked,
    guardInteraction,
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
    t,
  });

  const {
    completionSoundEnabled,
    handleToggleCompletionSound,
    handleToggleComplete,
    handleStatusChange,
    sortStatusHoldByTaskId,
    sortModifiedAtHoldByTaskId,
  } = useTaskStatusController({
    allTasks: baseAllTasks,
    currentUser,
    guardInteraction,
    publishTaskStateUpdate,
    setLocalTasks,
    t,
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
    pinnedChannelsState,
    activeRelayIdList,
    pinnedChannelIds,
    channelsWithState,
    handleChannelPin,
    handleChannelUnpin,
  } = usePinnedSidebarChannels({
    userPubkey: user?.pubkey,
    effectiveActiveRelayIds,
    channels: sidebarChannels,
    channelFilterStates,
    allTasks,
  });

  const {
    pinnedPeopleState,
    pinnedPersonIds,
    peopleWithState,
    handlePersonPin,
    handlePersonUnpin,
  } = usePinnedSidebarPeople({
    userPubkey: user?.pubkey,
    effectiveActiveRelayIds,
    people: sidebarPeopleWithSelected,
    allTasks,
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
      allTasks,
      filterIndex: snapshotFilterIndex,
      prefilteredTaskIds,
      searchQuery,
      people: snapshotPeople,
      quickFilters: snapshot.quickFilters,
      includedChannels,
      excludedChannels,
      channelMatchMode: snapshot.channelMatchMode,
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
    isOnboardingIntroOpen,
    onboardingInitialSection,
    onboardingManualStart,
    activeOnboardingStepId,
    onboardingSections,
    onboardingStepsBySection,
    forceShowComposeForGuide,
    composeGuideActivationSignal,
    handleStartOnboardingTour,
    handleOpenGuide,
    handleCloseGuide,
    handleCompleteGuide,
    handleOnboardingStepChange,
    handleOnboardingActiveSectionChange,
  } = useIndexOnboarding({
    user,
    isMobile,
    currentView,
    channels,
    openedWithFocusedTaskRef,
    shouldForceAuthAfterOnboarding: shouldPromptSignInAfterOnboarding({
      isSignedIn: Boolean(user),
      relays: ndkRelays,
    }),
    onBeforeResetFocusedTaskScope: discardTaskScopeFilterRestore,
    setCurrentView,
    setFocusedTaskId,
    setSearchQuery,
    setActiveRelayIds,
    setChannelFilterStates,
    setPeople,
    setIsAuthModalOpen,
    t,
  });

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

  const { handleListingStatusChange } = useListingStatusPublish({
    allTasks,
    currentUser,
    guardInteraction,
    publishEvent,
    resolveTaskOriginRelay,
    setLocalTasks,
    t,
  });

  const {
    composeRestoreRequest,
    failedPublishDrafts,
    visibleFailedPublishDrafts,
    selectedPublishableRelayIds,
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
    t,
    setLocalTasks,
    setPostedTags,
    suppressedNostrEventIds,
    setSuppressedNostrEventIds,
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
    presenceEnabled: loadPresencePublishingEnabled(),
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

  const onboardingOverlays = (
    <>
      <OnboardingIntroPopover
        isOpen={isOnboardingIntroOpen && !isAuthModalOpen}
        showCreateAccount={Boolean(import.meta.env.VITE_NOAS_HOST_URL)}
        onStartTour={() => {
          if (!demoFeedActive && allTasks.length === 0) {
            setDemoTasks(initializeDemoFeedData());
            setActiveRelayIds((previous) => {
              const next = new Set(previous);
              next.add(DEMO_RELAY_ID);
              return next;
            });
            navigate("/feed");
          }
          handleStartOnboardingTour();
        }}
        onCreateAccount={() => handleOpenAuthModal("noasSignUp")}
        onSignIn={() => handleOpenAuthModal("noas")}
      />
      <OnboardingGuide
        isOpen={isOnboardingOpen && !isAuthModalOpen}
        isMobile={isMobile}
        manualStart={onboardingManualStart}
        currentView={currentView}
        uiContextKey={`${currentView}:${focusedTaskId || ""}`}
        initialSection={onboardingInitialSection}
        sections={onboardingSections}
        stepsBySection={onboardingStepsBySection}
        onClose={handleCloseGuide}
        onComplete={handleCompleteGuide}
        onActiveSectionChange={handleOnboardingActiveSectionChange}
        onStepChange={handleOnboardingStepChange}
      />
    </>
  );

  const uiConfig: FeedPageUiConfig = useMemo(
    () => ({
      completionSoundEnabled,
      onToggleCompletionSound: handleToggleCompletionSound,
    }),
    [completionSoundEnabled, handleToggleCompletionSound]
  );
  const feedInteractionBus = useIndexFeedInteractionBus({
    handleOpenAuthModal,
    openShortcutsHelp: shortcutsHelp.open,
    handleOpenGuide,
    handleFocusSidebar: () => setIsSidebarFocused(true),
    handleFocusTasks: () => setIsSidebarFocused(false),
    guardInteraction,
    setCurrentView,
    setSearchQuery,
    setKanbanDepthMode,
    setManageRouteActive,
    filterHandlers,
    handleRelaySelectIntent,
    handleRelayToggle,
    handleRelayExclusive,
    handleToggleAllRelays,
    handleAddRelay,
    reorderRelays,
    handleRemoveRelay,
    reconnectRelay,
    handleChannelPin,
    handleChannelUnpin,
    handlePersonPin,
    handlePersonUnpin,
    savedFilterController,
    setFocusedTaskId,
    handleNewTask,
    handleToggleComplete,
    handleStatusChange,
    handleDueDateChange,
    handlePriorityChange,
    handleListingStatusChange,
    handleUndoPendingPublish,
    handleRetryFailedPublish,
    handleRepostFailedPublish,
    handleDismissFailedPublish,
    handleDismissAllFailedPublish,
    interactionEffects: frecencyInteractionEffects,
  });
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
      compactTaskCardsEnabled,
      isInteractionBlocked,
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
      compactTaskCardsEnabled,
      isInteractionBlocked,
      isHydrating,
    ]
  );

  const feedSurfaceState = useMemo(
    () => ({
      relays: relaysWithActiveState.map((relay) => ({
        id: relay.id,
        name: relay.name,
        icon: relay.icon,
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

  const {
    mobileController,
    desktopHeader,
    desktopContent,
    desktopSidebarController,
  } = useFeedPageShellConfig({
    canCreateContent: authPolicy.canCreateContent,
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
    collapsedPreviewChannels: focusedTaskCollapsedSidebarPreview.channels,
    channelMatchMode,
    peopleWithState,
    collapsedPreviewPeople: focusedTaskCollapsedSidebarPreview.people,
    nostrRelays,
    isSidebarFocused,
    quickFilters,
    savedFilterConfigurations: savedFilterController.configurations,
    activeSavedFilterConfigurationId: savedFilterController.activeConfigurationId,
    pinnedChannelIds,
    pinnedPersonIds,
    desktopSwipeHandlers,
    kanbanDepthMode,
    searchQuery,
    t,
  });

  // Mobile layout
  if (isMobile) {
    return (
      <FeedPageProviders
        interactionBus={feedInteractionBus}
        uiConfig={uiConfig}
        surfaceState={feedSurfaceState}
        taskViewModel={feedTaskViewModel}
      >
        <MotdBanner />
        <FeedPageMobileShell
          controller={mobileController}
          authModalProps={{
            isOpen: isAuthModalOpen,
            onClose: handleCloseAuthModal,
            initialStep: authModalInitialStep,
          }}
          onboardingOverlays={onboardingOverlays}
        />
      </FeedPageProviders>
    );
  }

  // Desktop layout
  return (
    <FeedPageProviders
      interactionBus={feedInteractionBus}
      uiConfig={uiConfig}
      surfaceState={feedSurfaceState}
      taskViewModel={feedTaskViewModel}
      sidebarController={desktopSidebarController}
    >
      <MotdBanner />
      <FeedPageDesktopShell
        header={desktopHeader}
        content={desktopContent}
        shortcutsHelpProps={{ isOpen: shortcutsHelp.isOpen, onClose: shortcutsHelp.close }}
        authModalProps={{
          isOpen: isAuthModalOpen,
          onClose: handleCloseAuthModal,
          initialStep: authModalInitialStep,
        }}
        onboardingOverlays={onboardingOverlays}
      />
    </FeedPageProviders>
  );
};

export default Index;
