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
import { mergeTasks } from "@/domain/content/task-merge";
import { getRelayIdFromUrl, getRelayNameFromUrl } from "@/infrastructure/nostr/relay-identity";
import { nostrEventsToTasks } from "@/infrastructure/nostr/task-converter";
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
import { useIndexRelayShell } from "@/features/feed-page/controllers/use-index-relay-shell";
import { useAuthModalRoute } from "@/features/feed-page/controllers/use-auth-modal-route";
import { useFeedDemoBootstrap } from "@/features/feed-page/controllers/use-feed-demo-bootstrap";
import { useListingStatusPublish } from "@/features/feed-page/controllers/use-listing-status-publish";
import { useRelayAutoReconnect } from "@/features/feed-page/controllers/use-relay-auto-reconnect";
import { useFeedAuthPolicy } from "@/features/feed-page/controllers/use-feed-auth-policy";
import { useRelayScopedPresence } from "@/features/feed-page/controllers/use-relay-scoped-presence";
import { useRelaySelectionController } from "@/features/feed-page/controllers/use-relay-selection-controller";
import { applyTaskSortOverlays } from "@/domain/content/task-collections";
import { buildTaskViewFilterIndex, filterTasksForView } from "@/domain/content/task-view-filtering";
import { resolveChannelRelayScopeIds } from "@/domain/relays/relay-scope";
import { isDemoFeedEnabled } from "@/lib/demo-feed-config";
import { mockKind0Events, mockTasks, mockRelays as demoRelays } from "@/data/mockData";
import { cloneBasicNostrEvents } from "@/data/basic-nostr-events";
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
  type FeedPageDesktopContentConfig,
  type FeedPageDesktopHeaderConfig,
} from "@/features/feed-page/views/FeedPageDesktopShell";
import {
  FeedPageMobileShell,
  type FeedPageMobileController,
} from "@/features/feed-page/views/FeedPageMobileShell";
import { FeedPageViewPane } from "@/features/feed-page/views/FeedPageViewPane";
import {
  FeedPageUiConfigProvider,
  type FeedPageUiConfig,
} from "@/features/feed-page/views/feed-page-ui-config";
import {
  FeedTaskViewModelProvider,
  type FeedTaskViewModel,
} from "@/features/feed-page/views/feed-task-view-model-context";
import { FeedSurfaceProvider } from "@/features/feed-page/views/feed-surface-context";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";
import { createFeedInteractionMiddlewareSkeleton } from "@/features/feed-page/interactions/feed-interaction-middleware-skeleton";
import {
  createFeedInteractionBus,
  type FeedInteractionPipelineApi,
  type FeedInteractionHandlerMap,
} from "@/features/feed-page/interactions/feed-interaction-pipeline";
import { FeedSidebarControllerProvider } from "@/features/feed-page/controllers/feed-sidebar-controller-context";
import { MotdBanner } from "@/components/MotdBanner";
import { featureDebugLog } from "@/lib/feature-debug";

// Demo relay constant
const DEMO_RELAY_ID = "demo";
const DEMO_FEED_ENABLED = isDemoFeedEnabled(import.meta.env.VITE_ENABLE_DEMO_FEED);
let _demoSeedTasksCache: Task[] | undefined;
function getDemoSeedTasks() {
  return (_demoSeedTasksCache ??= mergeTasks(mockTasks, nostrEventsToTasks(cloneBasicNostrEvents())));
}
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
  const [guideDemoFeedEnabled, setGuideDemoFeedEnabled] = useState(false);
  const demoFeedActive = DEMO_FEED_ENABLED || guideDemoFeedEnabled;
  const hasConfiguredNoasAuth = Boolean(import.meta.env.VITE_NOAS_HOST_URL);

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
      postCount: undefined,
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

  const subscriptionRelayIds = useMemo(
    () =>
      new Set(
        relays
          .map((relay) => relay.id)
          .filter((relayId) => relayId !== DEMO_RELAY_ID)
      ),
    [relays]
  );

  const {
    events: nostrEvents,
    hasLiveHydratedScope: hasLiveHydratedRelayScope,
    isHydrating,
  } = useNostrEventCache({
    isConnected: isNostrConnected,
    subscribedKinds,
    activeRelayIds: subscriptionRelayIds,
    availableRelayIds: relays.map((relay) => relay.id),
    subscribe,
  });

  const {
    people,
    setPeople,
    cachedKind0Events,
    latestPresenceByAuthor,
    seedCachedKind0Events,
    removeCachedRelayProfile,
  } = useKind0People(nostrEvents, selectedRelayUrls, user);

  const {
    nostrRelays,
    relaysWithActiveState,
    selectedRelayUrls,
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

  const selectedRelayScopeIds = useMemo(
    () =>
      resolveChannelRelayScopeIds(
        effectiveActiveRelayIds,
        relays.map((relay) => relay.id)
      ),
    [effectiveActiveRelayIds, relays]
  );

  const [localTasks, setLocalTasks] = useState<Task[]>(() => (DEMO_FEED_ENABLED ? getDemoSeedTasks() : []));
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

  const shouldForceAuthAfterOnboarding = useMemo(() => {
    return shouldPromptSignInAfterOnboarding({
      isSignedIn: Boolean(user),
      relays: ndkRelays,
    });
  }, [ndkRelays, user]);
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

  const { ensureGuideDataAvailable } = useFeedDemoBootstrap({
    totalTasks: allTasks.length,
    demoFeedActive,
    demoRelayId: DEMO_RELAY_ID,
    getDemoSeedTasks,
    demoKind0Events: mockKind0Events,
    setGuideDemoFeedEnabled,
    setLocalTasks,
    seedCachedKind0Events,
    setActiveRelayIds,
    navigate,
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
    relays,
    openedWithFocusedTaskRef,
    shouldForceAuthAfterOnboarding,
    ensureGuideDataAvailable,
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

  const handleFocusSidebar = useCallback(() => {
    setIsSidebarFocused(true);
  }, []);

  const handleFocusTasks = useCallback(() => {
    setIsSidebarFocused(false);
  }, []);

  const { publishOfflinePresenceNow } = useRelayScopedPresence({
    userPubkey: user?.pubkey,
    presenceEnabled: loadPresencePublishingEnabled(),
    currentView,
    focusedTask,
    relayScopeIds: selectedRelayScopeIds,
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
        showCreateAccount={hasConfiguredNoasAuth}
        onStartTour={handleStartOnboardingTour}
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
  const feedInteractionHandlers: FeedInteractionHandlerMap = useMemo(
    () => ({
      "ui.openAuthModal": (intent) => {
        if (
          intent.initialStep === "choose" ||
          intent.initialStep === "noas" ||
          intent.initialStep === "noasSignUp"
        ) {
          handleOpenAuthModal(intent.initialStep);
          return;
        }
        handleOpenAuthModal();
      },
      "ui.openShortcutsHelp": () => {
        shortcutsHelp.open();
      },
      "ui.openGuide": () => {
        handleOpenGuide();
      },
      "ui.focusSidebar": () => {
        handleFocusSidebar();
      },
      "ui.focusTasks": () => {
        handleFocusTasks();
      },
      "ui.interaction.guardModify": () => {
        guardInteraction("modify");
      },
      "ui.view.change": (intent) => {
        setCurrentView(intent.view);
      },
      "ui.search.change": (intent) => {
        setSearchQuery(intent.query);
      },
      "ui.kanbanDepth.change": (intent) => {
        setKanbanDepthMode(intent.mode);
      },
      "ui.manageRoute.change": (intent) => {
        setManageRouteActive(intent.isActive);
      },
      ...filterHandlers,
      "sidebar.relay.select": (intent, api: FeedInteractionPipelineApi) => {
        const reconnectRelayUrl = handleRelaySelectIntent(intent.relayId, intent.mode);
        if (reconnectRelayUrl) {
          return api.dispatch({
            type: "sidebar.relay.reconnect",
            url: reconnectRelayUrl,
          });
        }
      },
      "sidebar.relay.toggle": (intent) => {
        handleRelayToggle(intent.relayId);
      },
      "sidebar.relay.exclusive": (intent) => {
        handleRelayExclusive(intent.relayId);
      },
      "sidebar.relay.toggleAll": () => {
        handleToggleAllRelays();
      },
      "sidebar.relay.add": (intent) => {
        handleAddRelay(intent.url);
      },
      "sidebar.relay.reorder": (intent) => {
        reorderRelays(intent.orderedUrls);
      },
      "sidebar.relay.remove": (intent) => {
        handleRemoveRelay(intent.url);
      },
      "sidebar.relay.reconnect": (intent) => {
        reconnectRelay(intent.url);
      },
      "sidebar.channel.pin": (intent) => {
        handleChannelPin(intent.channelId);
      },
      "sidebar.channel.unpin": (intent) => {
        handleChannelUnpin(intent.channelId);
      },
      "sidebar.person.pin": (intent) => {
        handlePersonPin(intent.personId);
      },
      "sidebar.person.unpin": (intent) => {
        handlePersonUnpin(intent.personId);
      },
      "sidebar.savedFilter.apply": (intent) => {
        savedFilterController.onApplyConfiguration(intent.configurationId);
      },
      "sidebar.savedFilter.saveCurrent": (intent) => {
        savedFilterController.onSaveCurrentConfiguration(intent.name);
      },
      "sidebar.savedFilter.rename": (intent) => {
        savedFilterController.onRenameConfiguration(intent.configurationId, intent.name);
      },
      "sidebar.savedFilter.delete": (intent) => {
        savedFilterController.onDeleteConfiguration(intent.configurationId);
      },
      "task.focus.change": (intent) => {
        setFocusedTaskId(intent.taskId);
      },
      "task.create": (intent) => {
        return handleNewTask(
          intent.content,
          intent.tags,
          intent.relays,
          intent.taskType,
          intent.dueDate,
          intent.dueTime,
          intent.dateType,
          intent.parentId,
          intent.initialStatus,
          intent.explicitMentionPubkeys,
          intent.mentionIdentifiers,
          intent.priority,
          intent.attachments,
          intent.nip99,
          intent.locationGeohash
        );
      },
      "task.toggleComplete": (intent) => {
        handleToggleComplete(intent.taskId);
      },
      "task.changeStatus": (intent) => {
        handleStatusChange(intent.taskId, intent.status);
      },
      "task.updateDueDate": (intent) => {
        handleDueDateChange(intent.taskId, intent.dueDate, intent.dueTime, intent.dateType);
      },
      "task.updatePriority": (intent) => {
        handlePriorityChange(intent.taskId, intent.priority);
      },
      "task.listingStatus.change": (intent) => {
        handleListingStatusChange(intent.taskId, intent.status);
      },
      "task.undoPendingPublish": (intent) => {
        handleUndoPendingPublish(intent.taskId);
      },
      "publish.failed.retry": (intent) => {
        handleRetryFailedPublish(intent.draftId);
      },
      "publish.failed.repost": (intent) => {
        handleRepostFailedPublish(intent.draftId);
      },
      "publish.failed.dismiss": (intent) => {
        handleDismissFailedPublish(intent.draftId);
      },
      "publish.failed.dismissAll": () => {
        handleDismissAllFailedPublish();
      },
    }),
    [
      handleOpenAuthModal,
      shortcutsHelp,
      handleOpenGuide,
      handleFocusSidebar,
      handleFocusTasks,
      guardInteraction,
      setCurrentView,
      setSearchQuery,
      setKanbanDepthMode,
      setManageRouteActive,
      filterHandlers,
      handleRelayToggle,
      handleRelayExclusive,
      handleToggleAllRelays,
      handleAddRelay,
      reorderRelays,
      handleRemoveRelay,
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
    ]
  );
  const feedInteractionBus = useMemo(
    () =>
      createFeedInteractionBus({
        middlewares: createFeedInteractionMiddlewareSkeleton(),
        handlers: feedInteractionHandlers,
        effects: frecencyInteractionEffects,
      }),
    [feedInteractionHandlers, frecencyInteractionEffects]
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

  const feedSurfaceRelays = useMemo(
    () =>
      relaysWithActiveState.map((relay) => ({
        id: relay.id,
        name: relay.name,
        icon: relay.icon,
        isActive: relay.isActive,
        connectionStatus: relay.connectionStatus,
        url: relay.url,
      })),
    [relaysWithActiveState]
  );

  const feedSurfaceState = useMemo(
    () => ({
      relays: feedSurfaceRelays,
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
      feedSurfaceRelays,
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

  const mobileViewState = useMemo(
    () => ({
      canCreateContent: authPolicy.canCreateContent,
      profileCompletionPromptSignal,
      currentView,
      isOnboardingOpen: isOnboardingOpen && !isAuthModalOpen,
      activeOnboardingStepId,
      isManageRouteActive,
    }),
    [
      authPolicy.canCreateContent,
      profileCompletionPromptSignal,
      currentView,
      isOnboardingOpen,
      isAuthModalOpen,
      activeOnboardingStepId,
      isManageRouteActive,
    ]
  );

  const mobilePublishState = useMemo(
    () => ({
      failedPublishDrafts,
      visibleFailedPublishDrafts,
      selectedPublishableRelayIds,
    }),
    [failedPublishDrafts, visibleFailedPublishDrafts, selectedPublishableRelayIds]
  );

  const desktopHeader: FeedPageDesktopHeaderConfig = useMemo(
    () => ({
      currentView,
    }),
    [currentView]
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
      pinnedChannelIds,
      pinnedPersonIds,
    }),
    [
      relaysWithActiveState,
      channelsWithState,
      focusedTaskCollapsedSidebarPreview.channels,
      channelMatchMode,
      peopleWithState,
      focusedTaskCollapsedSidebarPreview.people,
      nostrRelays,
      isSidebarFocused,
      quickFilters,
      savedFilterController.configurations,
      savedFilterController.activeConfigurationId,
      pinnedChannelIds,
      pinnedPersonIds,
    ]
  );

  const desktopContent: FeedPageDesktopContentConfig = useMemo(
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
      failedPublishDrafts,
      visibleFailedPublishDrafts,
      selectedPublishableRelayIds,
      desktopSwipeHandlers,
      currentView,
      kanbanDepthMode,
      t,
      searchQuery,
    ]
  );

  const mobileController: FeedPageMobileController = useMemo(
    () => ({
      viewState: mobileViewState,
      publishState: {
        ...mobilePublishState,
      },
    }),
    [
      mobileViewState,
      mobilePublishState,
    ]
  );

  // Mobile layout
  if (isMobile) {
    return (
      <FeedInteractionProvider bus={feedInteractionBus}>
        <FeedPageUiConfigProvider value={uiConfig}>
          <FeedSurfaceProvider value={feedSurfaceState}>
            <FeedTaskViewModelProvider value={feedTaskViewModel}>
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
            </FeedTaskViewModelProvider>
          </FeedSurfaceProvider>
        </FeedPageUiConfigProvider>
      </FeedInteractionProvider>
    );
  }

  // Desktop layout
  return (
    <FeedInteractionProvider bus={feedInteractionBus}>
      <FeedPageUiConfigProvider value={uiConfig}>
        <FeedSurfaceProvider value={feedSurfaceState}>
          <FeedTaskViewModelProvider value={feedTaskViewModel}>
            <FeedSidebarControllerProvider value={desktopSidebarController}>
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
            </FeedSidebarControllerProvider>
          </FeedTaskViewModelProvider>
        </FeedSurfaceProvider>
      </FeedPageUiConfigProvider>
    </FeedInteractionProvider>
  );
};

export default Index;
