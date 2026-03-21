import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { type KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFeedNavigation } from "@/features/feed-page/controllers/use-feed-navigation";
import { useNostrEventCache } from "@/infrastructure/nostr/use-nostr-event-cache";
import { useKeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import { OnboardingIntroPopover } from "@/components/onboarding/OnboardingIntroPopover";
import { mergeTasks } from "@/domain/content/task-merge";
import { getRelayIdFromUrl, getRelayNameFromUrl } from "@/infrastructure/nostr/relay-identity";
import { nostrEventsToTasks } from "@/infrastructure/nostr/task-converter";
import {
  getPinnedChannelIdsForView,
} from "@/domain/preferences/pinned-channel-state";
import {
  saveChannelFrecencyState,
  loadChannelFrecencyState,
  recordChannelInteraction,
  type ChannelFrecencyState,
} from "@/lib/channel-frecency";
import { NostrEventKind } from "@/lib/nostr/types";
import { shouldPromptSignInAfterOnboarding } from "@/lib/onboarding-auth-prompt";
import { filterTasksByRelayAndPeople } from "@/domain/content/task-filtering";
import { loadPresencePublishingEnabled } from "@/infrastructure/preferences/user-preferences-storage";
import {
  NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS,
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildActivePresenceContent,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import { buildFilterSnapshot, type FilterSnapshot } from "@/domain/content/filter-snapshot";
import type { Nip99ListingStatus } from "@/types";
import { useIndexFilters } from "@/features/feed-page/controllers/use-index-filters";
import { useIndexOnboarding } from "@/features/feed-page/controllers/use-index-onboarding";
import { useRelayFilterState } from "@/features/feed-page/controllers/use-relay-filter-state";
import { useSavedFilterConfigs } from "@/features/feed-page/controllers/use-saved-filter-configs";
import { useTaskPublishFlow } from "@/features/feed-page/controllers/use-task-publish-flow";
import { useTaskPublishControls } from "@/features/feed-page/controllers/use-task-publish-controls";
import { useTaskStatusController } from "@/features/feed-page/controllers/use-task-status-controller";
import { useKind0People } from "@/infrastructure/nostr/use-kind0-people";
import { useIndexDerivedData } from "@/features/feed-page/controllers/use-index-derived-data";
import { usePinnedSidebarChannels } from "@/features/feed-page/controllers/use-pinned-sidebar-channels";
import { useIndexRelayShell } from "@/features/feed-page/controllers/use-index-relay-shell";
import { useAuthModalRoute } from "@/features/feed-page/controllers/use-auth-modal-route";
import { useFeedDemoBootstrap } from "@/features/feed-page/controllers/use-feed-demo-bootstrap";
import { useListingStatusPublish } from "@/features/feed-page/controllers/use-listing-status-publish";
import { useRelayAutoReconnect } from "@/features/feed-page/controllers/use-relay-auto-reconnect";
import { applyTaskSortOverlays } from "@/domain/content/task-collections";
import { taskMatchesQuickFilters } from "@/domain/content/quick-filter-constraints";
import { shouldReconnectRelayOnSelection } from "@/domain/relays/relay-reconnect-policy";
import { resolveChannelRelayScopeIds } from "@/domain/relays/relay-scope";
import { isDemoFeedEnabled } from "@/lib/demo-feed-config";
import { mockKind0Events, mockTasks, mockRelays as demoRelays } from "@/data/mockData";
import { cloneBasicNostrEvents } from "@/data/basic-nostr-events";
import {
  Relay,
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
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";
import { createFeedInteractionMiddlewareSkeleton } from "@/features/feed-page/interactions/feed-interaction-middleware-skeleton";
import {
  createFeedInteractionBus,
  type FeedInteractionHandlerMap,
} from "@/features/feed-page/interactions/feed-interaction-pipeline";
import { FeedSidebarControllerProvider } from "@/features/feed-page/controllers/feed-sidebar-controller-context";

// Demo relay constant
const DEMO_RELAY_ID = "demo";
const DEMO_FEED_ENABLED = isDemoFeedEnabled(import.meta.env.VITE_ENABLE_DEMO_FEED);
const DEMO_SEED_TASKS = mergeTasks(mockTasks, nostrEventsToTasks(cloneBasicNostrEvents()));
const Index = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // NDK Nostr integration
  const {
    relays: ndkRelays,
    isConnected: isNostrConnected,
    addRelay,
    removeRelay,
    reconnectRelay,
    subscribe,
    publishEvent,
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
  const hasConfiguredNoasAuth = Boolean(import.meta.env.VITE_NOAS_API_URL || import.meta.env.VITE_NOAS_HOST_URL);

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
    handleToggleAllRelays,
  } = useRelayFilterState({
    relays,
    t,
    onRelayEnabled: (relay) => {
      if (
        relay.id !== DEMO_RELAY_ID &&
        relay.url &&
        shouldReconnectRelayOnSelection(relay.connectionStatus)
      ) {
        reconnectRelay(relay.url);
      }
    },
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

  // Compute selected relay URLs for profile hydration
  const selectedRelayUrls = useMemo(() => {
    const selectedRelayScopeIds = resolveChannelRelayScopeIds(
      effectiveActiveRelayIds,
      relays.map((relay) => relay.id)
    );
    return relays
      .filter((relay) => relay.id !== DEMO_RELAY_ID && relay.url && selectedRelayScopeIds.has(relay.id))
      .map((relay) => relay.url as string);
  }, [effectiveActiveRelayIds, relays]);

  const {
    people,
    setPeople,
    cachedKind0Events,
    supplementalLatestActivityByAuthor,
    seedCachedKind0Events,
    removeCachedRelayProfile,
  } = useKind0People(nostrEvents, selectedRelayUrls, user);

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

  const [localTasks, setLocalTasks] = useState<Task[]>(() => (DEMO_FEED_ENABLED ? DEMO_SEED_TASKS : []));
  const [postedTags, setPostedTags] = useState<string[]>([]);
  const [channelFrecencyState, setChannelFrecencyState] = useState<ChannelFrecencyState>(
    () => loadChannelFrecencyState()
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarFocused, setIsSidebarFocused] = useState(false);
  const [suppressedNostrEventIds, setSuppressedNostrEventIds] = useState<Set<string>>(new Set());

  const {
    allTasks: baseAllTasks,
    channels,
    composeChannels,
    sidebarPeople,
    currentUser,
    hasCachedCurrentUserProfileMetadata,
  } = useIndexDerivedData({
    nostrEvents,
    localTasks,
    postedTags,
    suppressedNostrEventIds,
    people,
    supplementalLatestActivityByAuthor,
    cachedKind0Events,
    user,
    effectiveActiveRelayIds,
    relays,
    channelFrecencyState,
    isHydrating,
  });

  const sidebarPeopleWithSelected = useMemo(() => {
    const sidebarIds = new Set(sidebarPeople.map((person) => person.id));
    const selectedMissing = people.filter((person) => person.isSelected && !sidebarIds.has(person.id));
    return [...selectedMissing, ...sidebarPeople];
  }, [people, sidebarPeople]);

  const bumpChannelFrecency = useCallback((tag: string, weight = 1) => {
    setChannelFrecencyState((previous) => recordChannelInteraction(previous, tag, weight));
  }, []);

  useEffect(() => {
    saveChannelFrecencyState(channelFrecencyState);
  }, [channelFrecencyState]);

  const {
    mentionRequest,
    channelFilterStates,
    setChannelFilterStates,
    channelMatchMode,
    setChannelMatchMode,
    composeChannelsWithState,
    handleChannelToggle,
    handleChannelClear,
    handleChannelExclusive,
    handleToggleAllChannels,
    handleChannelMatchModeChange,
    handleHashtagExclusive,
    handlePersonToggle,
    handlePersonClear,
    handlePersonExclusive,
    handleToggleAllPeople,
    handleAuthorClick,
    quickFilters,
    setQuickFilters,
    handleRecentDaysChange,
    handleRecentEnabledChange,
    handleMinPriorityChange,
    handlePriorityEnabledChange,
    resetFiltersToDefault,
  } = useIndexFilters({
    relays,
    setActiveRelayIds,
    channels,
    composeChannels,
    postedTags,
    setPostedTags,
    people,
    setPeople,
    sidebarPeople: sidebarPeopleWithSelected,
    isMobile,
    hasLiveHydratedScope: hasLiveHydratedRelayScope,
    isHydrating,
    setSearchQuery,
    bumpChannelFrecency,
    t,
  });

  const shouldForceAuthAfterOnboarding = useMemo(() => {
    return shouldPromptSignInAfterOnboarding({
      isSignedIn: Boolean(user),
      relays: ndkRelays,
    });
  }, [ndkRelays, user]);

  const shortcutsHelp = useKeyboardShortcutsHelp();
  const [kanbanDepthMode, setKanbanDepthMode] = useState<KanbanDepthMode>("leaves");

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
    user,
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
    isManageRouteActive,
    setCurrentView,
    setFocusedTaskId,
    setManageRouteActive,
    desktopSwipeHandlers,
    openedWithFocusedTaskRef,
  } = useFeedNavigation({ allTasks, isMobile, effectiveActiveRelayIds, relays });

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
    channelsWithState,
    handleChannelPin,
    handleChannelUnpin,
  } = usePinnedSidebarChannels({
    userPubkey: user?.pubkey,
    currentView,
    effectiveActiveRelayIds,
    channels: sidebarChannels,
    channelFilterStates,
    allTasks,
  });

  const filteredTasks = useMemo(
    () =>
      filterTasksByRelayAndPeople({
        tasks: allTasks,
        activeRelayIds: effectiveActiveRelayIds,
        people,
        allowUnknownRelayMetadata: !hasLiveHydratedRelayScope,
      }).filter((task) => taskMatchesQuickFilters(task, quickFilters)),
    [allTasks, effectiveActiveRelayIds, hasLiveHydratedRelayScope, people, quickFilters]
  );

  const { ensureGuideDataAvailable } = useFeedDemoBootstrap({
    totalTasks: allTasks.length,
    demoFeedActive,
    demoRelayId: DEMO_RELAY_ID,
    demoSeedTasks: DEMO_SEED_TASKS,
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
    setCurrentView,
    setFocusedTaskId,
    setSearchQuery,
    setActiveRelayIds,
    setChannelFilterStates,
    setPeople,
    setIsAuthModalOpen,
    t,
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
    effectiveActiveRelayIds,
    demoFeedActive,
    demoRelayId: DEMO_RELAY_ID,
    queryClient,
    t,
    setLocalTasks,
    setPostedTags,
    suppressedNostrEventIds,
    setSuppressedNostrEventIds,
    bumpChannelFrecency,
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

  const lastPublishedPresenceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.pubkey) {
      lastPublishedPresenceRef.current = null;
      return;
    }

    if (!loadPresencePublishingEnabled()) return;

    const snapshot = `${currentView}:${focusedTaskId || ""}`;
    if (lastPublishedPresenceRef.current === snapshot) return;
    lastPublishedPresenceRef.current = snapshot;

    const expirationUnix = Math.floor(Date.now() / 1000) + NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS;
    void publishEvent(
      NostrEventKind.UserStatus,
      buildActivePresenceContent(currentView, focusedTaskId),
      buildPresenceTags(expirationUnix)
    );
  }, [currentView, focusedTaskId, publishEvent, user?.pubkey]);

  useEffect(() => {
    if (!user?.pubkey) return;

    const publishOfflinePresence = () => {
      if (!loadPresencePublishingEnabled()) return;
      const expirationUnix = Math.floor(Date.now() / 1000) + NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS;
      void publishEvent(
        NostrEventKind.UserStatus,
        buildOfflinePresenceContent(),
        buildPresenceTags(expirationUnix)
      );
    };

    window.addEventListener("pagehide", publishOfflinePresence);
    window.addEventListener("beforeunload", publishOfflinePresence);
    return () => {
      window.removeEventListener("pagehide", publishOfflinePresence);
      window.removeEventListener("beforeunload", publishOfflinePresence);
    };
  }, [publishEvent, user?.pubkey]);

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
      "filter.applyHashtagExclusive": (intent) => {
        handleHashtagExclusive(intent.tag);
      },
      "filter.applyAuthorExclusive": (intent) => {
        handleAuthorClick(intent.author);
      },
      "filter.clearChannel": (intent) => {
        handleChannelClear(intent.channelId);
      },
      "filter.clearPerson": (intent) => {
        handlePersonClear(intent.personId);
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
      "sidebar.relay.remove": (intent) => {
        handleRemoveRelay(intent.url);
      },
      "sidebar.relay.reconnect": (intent) => {
        reconnectRelay(intent.url);
      },
      "sidebar.channel.toggle": (intent) => {
        handleChannelToggle(intent.channelId);
      },
      "sidebar.channel.exclusive": (intent) => {
        handleChannelExclusive(intent.channelId);
      },
      "sidebar.channel.toggleAll": () => {
        handleToggleAllChannels();
      },
      "sidebar.channel.matchMode.change": (intent) => {
        handleChannelMatchModeChange(intent.mode);
      },
      "sidebar.channel.pin": (intent) => {
        handleChannelPin(intent.channelId);
      },
      "sidebar.channel.unpin": (intent) => {
        handleChannelUnpin(intent.channelId);
      },
      "sidebar.person.toggle": (intent) => {
        handlePersonToggle(intent.personId);
      },
      "sidebar.person.exclusive": (intent) => {
        handlePersonExclusive(intent.personId);
      },
      "sidebar.person.toggleAll": () => {
        handleToggleAllPeople();
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
      "sidebar.quickFilter.recentDays.change": (intent) => {
        handleRecentDaysChange(intent.days);
      },
      "sidebar.quickFilter.recentEnabled.change": (intent) => {
        handleRecentEnabledChange(intent.enabled);
      },
      "sidebar.quickFilter.minPriority.change": (intent) => {
        handleMinPriorityChange(intent.priority);
      },
      "sidebar.quickFilter.priorityEnabled.change": (intent) => {
        handlePriorityEnabledChange(intent.enabled);
      },
      "task.toggleComplete": (intent) => {
        handleToggleComplete(intent.taskId);
      },
      "task.changeStatus": (intent) => {
        handleStatusChange(intent.taskId, intent.status);
      },
    }),
    [
      handleOpenAuthModal,
      shortcutsHelp,
      handleOpenGuide,
      handleFocusSidebar,
      handleFocusTasks,
      handleHashtagExclusive,
      handleAuthorClick,
      handleChannelClear,
      handlePersonClear,
      handleRelayToggle,
      handleRelayExclusive,
      handleToggleAllRelays,
      handleAddRelay,
      handleRemoveRelay,
      reconnectRelay,
      handleChannelToggle,
      handleChannelExclusive,
      handleToggleAllChannels,
      handleChannelMatchModeChange,
      handleChannelPin,
      handleChannelUnpin,
      handlePersonToggle,
      handlePersonExclusive,
      handleToggleAllPeople,
      savedFilterController,
      handleRecentDaysChange,
      handleRecentEnabledChange,
      handleMinPriorityChange,
      handlePriorityEnabledChange,
      handleToggleComplete,
      handleStatusChange,
    ]
  );
  const feedInteractionBus = useMemo(
    () =>
      createFeedInteractionBus({
        middlewares: createFeedInteractionMiddlewareSkeleton(),
        handlers: feedInteractionHandlers,
      }),
    [feedInteractionHandlers]
  );
  const dispatchFeedInteraction = feedInteractionBus.dispatch;
  const handleDispatchToggleComplete = useCallback(
    (taskId: string) => {
      void dispatchFeedInteraction({ type: "task.toggleComplete", taskId });
    },
    [dispatchFeedInteraction]
  );
  const handleDispatchOpenAuthModal = useCallback(() => {
    void dispatchFeedInteraction({ type: "ui.openAuthModal" });
  }, [dispatchFeedInteraction]);
  const handleDispatchStatusChange = useCallback(
    (taskId: string, status: TaskStatus) => {
      void dispatchFeedInteraction({ type: "task.changeStatus", taskId, status });
    },
    [dispatchFeedInteraction]
  );
  const feedTaskViewModel: FeedTaskViewModel = useMemo(
    () => ({
      tasks: filteredTasks,
      allTasks,
      relays: relaysWithActiveState,
      channels: channelsWithState,
      channelMatchMode,
      composeChannels: composeChannelsWithState,
      people,
      currentUser,
      searchQuery,
      onSearchChange: setSearchQuery,
      onNewTask: handleNewTask,
      onToggleComplete: handleDispatchToggleComplete,
      focusedTaskId,
      onFocusTask: setFocusedTaskId,
      onStatusChange: handleDispatchStatusChange,
      onListingStatusChange: handleListingStatusChange,
      onUndoPendingPublish: handleUndoPendingPublish,
      isPendingPublishTask,
      composeRestoreRequest,
      mentionRequest,
      forceShowComposer: forceShowComposeForGuide,
      composeGuideActivationSignal,
      onUpdateDueDate: handleDueDateChange,
      onUpdatePriority: handlePriorityChange,
      isInteractionBlocked,
      onInteractionBlocked: handleBlockedInteractionAttempt,
      isHydrating,
    }),
    [
      filteredTasks,
      allTasks,
      relaysWithActiveState,
      channelsWithState,
      channelMatchMode,
      composeChannelsWithState,
      people,
      currentUser,
      searchQuery,
      setSearchQuery,
      handleNewTask,
      handleDispatchToggleComplete,
      focusedTaskId,
      setFocusedTaskId,
      handleDispatchStatusChange,
      handleListingStatusChange,
      handleUndoPendingPublish,
      isPendingPublishTask,
      composeRestoreRequest,
      mentionRequest,
      forceShowComposeForGuide,
      composeGuideActivationSignal,
      handleDueDateChange,
      handlePriorityChange,
      isInteractionBlocked,
      handleBlockedInteractionAttempt,
      isHydrating,
    ]
  );

  const mobileViewState = useMemo(
    () => ({
      relays: relaysWithActiveState,
      channels: channelsWithState,
      channelMatchMode,
      people,
      hasCachedCurrentUserProfileMetadata,
      isSignedIn: Boolean(user),
      currentView,
      isOnboardingOpen: isOnboardingOpen && !isAuthModalOpen,
      activeOnboardingStepId,
      isManageRouteActive,
    }),
    [
      relaysWithActiveState,
      channelsWithState,
      channelMatchMode,
      people,
      hasCachedCurrentUserProfileMetadata,
      user,
      currentView,
      isOnboardingOpen,
      isAuthModalOpen,
      activeOnboardingStepId,
      isManageRouteActive,
    ]
  );

  const mobileActions = useMemo(
    () => ({
      onViewChange: setCurrentView,
      onRelayToggle: handleRelayToggle,
      onChannelToggle: handleChannelToggle,
      onPersonToggle: handlePersonToggle,
      onChannelMatchModeChange: handleChannelMatchModeChange,
      onAddRelay: handleAddRelay,
      onRemoveRelay: handleRemoveRelay,
      onSignInClick: handleDispatchOpenAuthModal,
      onGuideClick: handleOpenGuide,
      onManageRouteChange: setManageRouteActive,
    }),
    [
      setCurrentView,
      handleRelayToggle,
      handleChannelToggle,
      handlePersonToggle,
      handleChannelMatchModeChange,
      handleAddRelay,
      handleRemoveRelay,
      handleDispatchOpenAuthModal,
      handleOpenGuide,
      setManageRouteActive,
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
      onViewChange: setCurrentView,
      onSignInClick: handleDispatchOpenAuthModal,
    }),
    [currentView, setCurrentView, handleDispatchOpenAuthModal]
  );

  const desktopSidebarController = useMemo(
    () => ({
      relays: relaysWithActiveState,
      channels: channelsWithState,
      channelMatchMode,
      people: sidebarPeopleWithSelected,
      nostrRelays,
      isFocused: isSidebarFocused,
      quickFilters,
      savedFilterConfigurations: savedFilterController.configurations,
      activeSavedFilterConfigurationId: savedFilterController.activeConfigurationId,
      pinnedChannelIds: getPinnedChannelIdsForView(
        pinnedChannelsState,
        currentView,
        activeRelayIdList
      ),
    }),
    [
      relaysWithActiveState,
      channelsWithState,
      channelMatchMode,
      sidebarPeopleWithSelected,
      nostrRelays,
      isSidebarFocused,
      quickFilters,
      savedFilterController.configurations,
      savedFilterController.activeConfigurationId,
      pinnedChannelsState,
      currentView,
      activeRelayIdList,
    ]
  );

  const desktopContent: FeedPageDesktopContentConfig = useMemo(
    () => ({
      failedPublishQueueBannerProps: {
        drafts: failedPublishDrafts,
        selectedFeedDrafts: visibleFailedPublishDrafts,
        onRetry: handleRetryFailedPublish,
        onRepost: handleRepostFailedPublish,
        selectedRelayIds: selectedPublishableRelayIds,
        onDismiss: handleDismissFailedPublish,
        onDismissAll: handleDismissAllFailedPublish,
      },
      desktopSwipeHandlers,
      viewPane: (
        <FeedPageViewPane
          currentView={currentView}
          kanbanDepthMode={kanbanDepthMode}
          loadingLabel={t("app.loadingView")}
        />
      ),
      searchDockProps: {
        searchQuery,
        onSearchChange: setSearchQuery,
        showKanbanLevels: currentView === "kanban" || currentView === "list",
        kanbanDepthMode,
        onKanbanDepthModeChange: setKanbanDepthMode,
      },
    }),
    [
      failedPublishDrafts,
      visibleFailedPublishDrafts,
      handleRetryFailedPublish,
      handleRepostFailedPublish,
      selectedPublishableRelayIds,
      handleDismissFailedPublish,
      handleDismissAllFailedPublish,
      desktopSwipeHandlers,
      currentView,
      kanbanDepthMode,
      t,
      searchQuery,
      setSearchQuery,
      setKanbanDepthMode,
    ]
  );

  const mobileController: FeedPageMobileController = useMemo(
    () => ({
      viewState: mobileViewState,
      actions: mobileActions,
      publishState: {
        ...mobilePublishState,
        onRetryFailedPublish: handleRetryFailedPublish,
        onRepostFailedPublish: handleRepostFailedPublish,
        onDismissFailedPublish: handleDismissFailedPublish,
        onDismissAllFailedPublish: handleDismissAllFailedPublish,
      },
    }),
    [
      mobileViewState,
      mobileActions,
      mobilePublishState,
      handleRetryFailedPublish,
      handleRepostFailedPublish,
      handleDismissFailedPublish,
      handleDismissAllFailedPublish,
    ]
  );

  // Mobile layout
  if (isMobile) {
    return (
      <FeedInteractionProvider bus={feedInteractionBus}>
        <FeedPageUiConfigProvider value={uiConfig}>
          <FeedTaskViewModelProvider value={feedTaskViewModel}>
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
        </FeedPageUiConfigProvider>
      </FeedInteractionProvider>
    );
  }

  // Desktop layout
  return (
    <FeedInteractionProvider bus={feedInteractionBus}>
      <FeedPageUiConfigProvider value={uiConfig}>
        <FeedTaskViewModelProvider value={feedTaskViewModel}>
          <FeedSidebarControllerProvider value={desktopSidebarController}>
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
      </FeedPageUiConfigProvider>
    </FeedInteractionProvider>
  );
};

export default Index;
