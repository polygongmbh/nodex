import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFeedNavigation } from "@/features/feed-page/controllers/use-feed-navigation";
import { useFocusedTaskCollapsedSidebarPreview } from "@/features/feed-page/controllers/use-focused-task-collapsed-sidebar-preview";
import { useTaskScopeSpecificFilters } from "@/features/feed-page/controllers/use-task-scope-specific-filters";
import { useNostrEventRouter } from "@/infrastructure/nostr/use-nostr-event-router";
import { useKeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { OnboardingController } from "@/components/onboarding/OnboardingController";
import { WelcomeController } from "@/components/welcome/WelcomeController";
import { NostrEventKind, type NostrEventWithRelay } from "@/lib/nostr/types";
import {
  REACTION_INGEST_KINDS,
  handleReactionEvent,
  useReactionViewerSync,
} from "@/features/feed-page/controllers/reaction-ingest";
import { ingestKind0Event } from "@/infrastructure/nostr/people-from-kind0";
import { ingestPresenceEvent } from "@/lib/presence-status";
import { ingestPostEvent } from "@/infrastructure/nostr/post-event-ingest";
import { filterTasksByRelayAndPeople } from "@/domain/content/task-filtering";
import { buildFilterSnapshot, type FilterSnapshot } from "@/domain/content/filter-snapshot";
import { useChannelFilterController } from "@/features/feed-page/controllers/use-channel-filter-controller";
import { useOnboarding } from "@/components/onboarding/use-onboarding";
import { useSavedFilterConfigs } from "@/features/feed-page/controllers/use-saved-filter-configs";
import { useTaskPublishFlow } from "@/features/feed-page/controllers/use-task-publish-flow";
import { buildTaskPermalink } from "@/domain/content/task-permalink";
import { writeToClipboard } from "@/lib/clipboard";
import {
  notifyPermalinkCopied,
  notifyPermalinkCopyFailed,
} from "@/lib/notifications";
import { useTaskPublishControls } from "@/features/feed-page/controllers/use-task-publish-controls";
import { useTaskStatusController } from "@/features/feed-page/controllers/use-task-status-controller";
import { useKind0People } from "@/infrastructure/nostr/use-kind0-people";
import { useAllPosts } from "@/features/feed-page/controllers/use-all-posts";
import { useChannels } from "@/features/feed-page/controllers/use-channels";
import { useSidebarPeople } from "@/features/feed-page/controllers/use-sidebar-people";
import { useMentionAutocompletePeople } from "@/features/feed-page/controllers/use-mention-autocomplete-people";
import { resolveCurrentUser } from "@/lib/current-user";
import { hasCurrentUserProfileMetadata as resolveCurrentUserProfileMetadata } from "@/domain/auth/profile-metadata";
import { useHydrationStatusStore } from "@/features/feed-page/stores/hydration-status-store";
import { useInteractionBlockStore } from "@/features/feed-page/stores/interaction-block-store";
import { usePendingPublishStore } from "@/features/feed-page/stores/pending-publish-store";
import { useCurrentUserStore } from "@/features/feed-page/stores/current-user-store";
import { useComposerSignalsStore } from "@/features/feed-page/stores/composer-signals-store";
import { useFeedSidebarCommandsController } from "@/features/feed-page/controllers/use-feed-sidebar-commands-controller";
import type { FeedViewCommands, FailedPublishCommands } from "@/features/feed-page/interactions/feed-interaction-inputs";
import type { FeedTaskCommands } from "@/features/feed-page/controllers/feed-task-commands-context";
import { useFeedInteractionFrecency } from "@/features/feed-page/controllers/use-feed-interaction-frecency";
import { useIndexRelayShell } from "@/features/feed-page/controllers/use-index-relay-shell";
import { useAuthModalRoute } from "@/features/feed-page/controllers/use-auth-modal-route";
import { useListingStatusPublish } from "@/features/feed-page/controllers/use-listing-status-publish";
import { useFeedAuthPolicy } from "@/features/feed-page/controllers/use-feed-auth-policy";
import { useRelayScopedPresence } from "@/features/feed-page/controllers/use-relay-scoped-presence";
import { type FeedPageCoreHandlers } from "@/features/feed-page/views/FeedPageProviders";
import { type ScrollCaptureRef } from "@/features/feed-page/views/scroll-capture-context";
import { applyTaskSortOverlays } from "@/domain/content/task-collections";
import { buildTaskViewFilterIndex, filterTasksForView } from "@/domain/content/task-view-filtering";
import { resolveChannelRelayScopeIds } from "@/domain/relays/relay-scope";
import { DEMO_RELAY_ID } from "@/lib/demo-feed-config";
import { bandChannelsByActivity } from "@/lib/channel-banding";
import { useCoreChannels } from "@/lib/use-core-channels";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import {
  DesktopAppShell,
} from "@/features/feed-page/views/DesktopAppShell";
import {
  FeedPageMobileShell,
} from "@/features/feed-page/views/FeedPageMobileShell";
import { FeedPageProviders } from "@/features/feed-page/views/FeedPageProviders";
import { FeedRelayProvider, useFeedRelayState } from "@/features/feed-page/views/FeedRelayProvider";
import { PersonPresenceProvider } from "@/lib/person-presence-context";
import { MotdBanner } from "@/components/MotdBanner";
import { DocumentTitleSync } from "@/components/DocumentTitleSync";
import { featureDebugLog } from "@/lib/feature-debug";

function FeedIndexContent() {
  const renderStart = import.meta.env.DEV && typeof performance !== "undefined"
    ? performance.now()
    : 0;
  const renderCountRef = useRef(0);

  const { publishEvent, signEvent, broadcastSignedEvent, setPresenceRelayUrls, user, defaultNoasHostUrl, isSessionLocked } = useNDK();

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
    isConnected,
    subscribe,
    activeRelayIds,
    setActiveRelayIds,
    effectiveActiveRelayIds,
    selectedRelayUrls,
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
      ...new Set<NostrEventKind>([
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
        NostrEventKind.EventDeletion,
        ...REACTION_INGEST_KINDS,
      ]),
    ],
    []
  );

  const isMobile = useIsMobile();
  const dispatchIncomingEvent = useCallback(
    (event: NostrEventWithRelay) => {
      if (event.kind === NostrEventKind.Reaction) {
        handleReactionEvent(event);
        return;
      }
      if (event.kind === NostrEventKind.EventDeletion) {
        // NIP-09 deletions can target a reaction OR a task; both stores get to
        // see them and decide whether the targeted id is theirs.
        handleReactionEvent(event);
        ingestPostEvent(event);
        return;
      }
      if (event.kind === NostrEventKind.Metadata) {
        ingestKind0Event(event);
        return;
      }
      if (event.kind === NostrEventKind.UserStatus) {
        ingestPresenceEvent(event);
        return;
      }
      ingestPostEvent(event);
    },
    [],
  );
  const {
    hasLiveHydratedScope: hasLiveHydratedRelayScope,
    isHydrating,
  } = useNostrEventRouter({
    isConnected,
    subscribedKinds,
    subscribe,
    onEvent: dispatchIncomingEvent,
  });
  useEffect(() => {
    useHydrationStatusStore.getState().setIsHydrating(isHydrating);
  }, [isHydrating]);
  useReactionViewerSync(user?.pubkey);

  const {
    people,
    setPeople,
    cachedKind0Events,
    latestPresenceByAuthor,
    removeCachedRelayProfile,
  } = useKind0People(
    selectedRelayUrls,
    user,
  );

  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const setSelectedPubkeys = useFilterStore((s) => s.setSelectedPubkeys);

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

  const [isSidebarFocused, setIsSidebarFocused] = useState(false);
  const {
    channelFrecencyState,
    personFrecencyState,
    dispatchFrecencyIntent,
    interactionEffects: frecencyInteractionEffects,
  } = useFeedInteractionFrecency();

  const baseAllTasks = useAllPosts({
    demoTasks,
    isHydrating,
    hasLiveHydratedScope: hasLiveHydratedRelayScope,
  });

  const allRelayIds = useMemo(() => relays.map((relay) => relay.id), [relays]);

  const channels = useChannels({
    allTasks: baseAllTasks,
    effectiveActiveRelayIds,
    allRelayIds,
    channelFrecencyState,
    userPubkey: user?.pubkey,
  });

  const sidebarPeople = useSidebarPeople({
    allTasks: baseAllTasks,
    people,
    latestPresenceByAuthor,
    effectiveActiveRelayIds,
    allRelayIds,
    personFrecencyState,
  });

  const scopedPostsForMentions = useMemo(() => {
    const scopeIds = resolveChannelRelayScopeIds(effectiveActiveRelayIds, allRelayIds);
    return baseAllTasks.filter(
      (task) =>
        task.relays.length === 0 ||
        task.relays.some((relayId) => scopeIds.has(relayId))
    );
  }, [baseAllTasks, effectiveActiveRelayIds, allRelayIds]);

  const mentionAutocompletePeople = useMentionAutocompletePeople({
    scopedPosts: scopedPostsForMentions,
    cachedKind0Events,
  });

  const currentUser = resolveCurrentUser(people, user);
  useEffect(() => {
    useCurrentUserStore.getState().setCurrentUser(currentUser);
  }, [currentUser]);

  const hasCurrentUserProfileMetadata = useMemo(
    () => resolveCurrentUserProfileMetadata(user, cachedKind0Events),
    [cachedKind0Events, user]
  );

  const sidebarPeopleWithSelected = useMemo(() => {
    const sidebarIds = new Set(sidebarPeople.map((person) => person.pubkey));
    const selectedMissing = people.filter((person) => selectedPubkeys.has(person.pubkey) && !sidebarIds.has(person.pubkey));
    return [...(selectedMissing as typeof sidebarPeople), ...sidebarPeople];
  }, [people, selectedPubkeys, sidebarPeople]);

  const {
    mentionRequest,
    onMentionRequestConsumed,
    channelFilterStates,
    setChannelFilterStates,
    channelMatchMode,
    setChannelMatchMode,
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
  } = useChannelFilterController({
    relays,
    channels,
    people,
    setPeople,
    sidebarPeople: sidebarPeopleWithSelected,
    hasLiveHydratedScope: hasLiveHydratedRelayScope,
    isHydrating,
  });
  useEffect(() => {
    useComposerSignalsStore.getState().setMentionRequest(mentionRequest ?? null);
  }, [mentionRequest]);
  useEffect(() => {
    useComposerSignalsStore.getState().setMentionRequestAck(onMentionRequestConsumed);
  }, [onMentionRequestConsumed]);

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
  useEffect(() => {
    useInteractionBlockStore.getState().setInteractionBlock({
      isInteractionBlocked,
      onBlockedInteractionAttempt: handleBlockedInteractionAttempt,
    });
  }, [isInteractionBlocked, handleBlockedInteractionAttempt]);

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
    openedWithFocusedTaskRef,
  } = useFeedNavigation({
    allTasks,
    isMobile,
    effectiveActiveRelayIds,
    relays,
    isHydrating,
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
        selectedPubkeys,
        channelMatchMode,
        quickFilters,
      }),
    [effectiveActiveRelayIds, channelFilterStates, selectedPubkeys, channelMatchMode, quickFilters]
  );

  const { savedFilterController } = useSavedFilterConfigs({
    currentFilterSnapshot,
    relays,
    setActiveRelayIds,
    setChannelFilterStates,
    setChannelMatchMode,
    setSelectedPubkeys,
    setQuickFilters,
    resetFiltersToDefault,
  });

  const sidebarChannels = channels;

  const {
    commands: sidebarCommands,
    channelsWithState,
    peopleWithState,
    pinnedPersonIds,
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

  const { isCore: isCoreChannelName } = useCoreChannels();
  const bandedChannels = useMemo(
    () => bandChannelsByActivity(channelsWithState, isCoreChannelName),
    [channelsWithState, isCoreChannelName]
  );
  const expandedBandChannels = bandedChannels.expanded;
  const primaryBandChannels = bandedChannels.primary;

  const relayScopedTasks = useMemo(
    () =>
      filterTasksByRelayAndPeople({
        tasks: allTasks,
        activeRelayIds: effectiveActiveRelayIds,
        selectedPeople: [],
        allowUnknownRelayMetadata: !hasLiveHydratedRelayScope,
      }),
    [allTasks, effectiveActiveRelayIds, hasLiveHydratedRelayScope]
  );

  const shouldRestoreTaskScopeFilters = useCallback((snapshot: FilterSnapshot) => {
    const snapshotSelectedPubkeys = new Set(snapshot.selectedPeopleIds);
    const snapshotFilterIndex = buildTaskViewFilterIndex(allTasks, people);
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
        people,
        selectedPubkeys: snapshotSelectedPubkeys,
      },
      criteria: {
        searchQuery: useFilterStore.getState().searchQuery,
        quickFilters: snapshot.quickFilters,
        channels: {
          included: includedChannels,
          excluded: excludedChannels,
          matchMode: snapshot.channelMatchMode,
        },
      },
    }).length > 0;
  }, [allTasks, people, relayScopedTasks]);

  const scrollCaptureRef = useRef<ScrollCaptureRef["current"]>(null);
  const onCaptureScrollTop = useCallback(() => scrollCaptureRef.current?.getScrollTop(), []);
  const onRestoreScrollTop = useCallback((scrollTop: number) => {
    scrollCaptureRef.current?.setScrollTop(scrollTop);
  }, []);

  const { discardTaskScopeFilterRestore } = useTaskScopeSpecificFilters({
    focusedTaskId,
    currentFilterSnapshot,
    shouldRestoreSnapshot: shouldRestoreTaskScopeFilters,
    setChannelFilterStates,
    setChannelMatchMode,
    onCaptureScrollTop,
    onRestoreScrollTop,
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
  });
  useEffect(() => {
    useComposerSignalsStore.getState().setForceShowComposer(forceShowComposeForGuide);
  }, [forceShowComposeForGuide]);
  useEffect(() => {
    useComposerSignalsStore.getState().setComposeGuideActivationSignal(composeGuideActivationSignal);
  }, [composeGuideActivationSignal]);

  const { handleListingStatusChange } = useListingStatusPublish({
    allTasks,
    currentUser,
    guardInteraction,
    publishEvent,
    resolveTaskOriginRelay,
  });

  const {
    composeRestoreRequest,
    onComposeRestoreRequestConsumed,
    isPendingPublishTask,
    handleUndoPendingPublish,
    handleNewTask,
    handleRetryFailedPublish,
    handleRepostFailedPublish,
    handleDismissFailedPublish,
    handleDismissAllFailedPublish,
    handleDueDateChange,
    handlePriorityChange,
    handlePostDelete,
    handleRecomposeTask,
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
    dispatchFrecencyIntent,
    guardInteraction,
    hasDisconnectedSelectedRelays,
    resolveRelayUrlsFromIds,
    publishEvent,
    signEvent,
    broadcastSignedEvent,
    publishTaskDueUpdate,
    publishTaskPriorityUpdate,
    publishTaskCreateFollowUps,
  });
  useEffect(() => {
    usePendingPublishStore.getState().setPendingPublishPredicate(isPendingPublishTask);
  }, [isPendingPublishTask]);
  useEffect(() => {
    useComposerSignalsStore.getState().setComposeRestoreRequest(composeRestoreRequest ?? null);
  }, [composeRestoreRequest]);
  useEffect(() => {
    useComposerSignalsStore.getState().setComposeRestoreRequestAck(onComposeRestoreRequestConsumed);
  }, [onComposeRestoreRequestConsumed]);

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
    if (isSessionLocked && !isAuthModalOpen) {
      handleOpenAuthModal();
    }
  }, [isSessionLocked, isAuthModalOpen, handleOpenAuthModal]);

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

  const viewCommands = useMemo<FeedViewCommands>(
    () => ({
      focusSidebar: () => setIsSidebarFocused(true),
      focusTasks: () => setIsSidebarFocused(false),
      setCurrentView,
      setDisplayDepthMode,
      setManageRouteActive,
    }),
    [setCurrentView, setDisplayDepthMode, setManageRouteActive, setIsSidebarFocused]
  );

  const handleCopyPermalink = useCallback(async (taskId: string): Promise<boolean> => {
    const task = allTasks.find((candidate) => candidate.id === taskId);
    if (!task) return false;
    const taskRelayUrls = resolveRelayUrlsFromIds(task.relays);
    const activeRelayUrls = relays
      .filter((relay) => relay.isActive)
      .map((relay) => relay.url)
      .filter(Boolean);
    const permalink = buildTaskPermalink({
      origin: typeof window !== "undefined" ? window.location.origin : "",
      eventId: taskId,
      taskRelayUrls,
      activeRelayUrls,
    });
    const ok = await writeToClipboard(permalink);
    if (ok) {
      notifyPermalinkCopied();
      return true;
    }
    notifyPermalinkCopyFailed();
    return false;
  }, [allTasks, relays, resolveRelayUrlsFromIds]);

  const taskCommands = useMemo<FeedTaskCommands>(
    () => ({
      focusTask: setFocusedTaskId,
      createTask: handleNewTask,
      toggleComplete: handleToggleComplete,
      changeStatus: handleStatusChange,
      updateDueDate: handleDueDateChange,
      updatePriority: handlePriorityChange,
      changeListingStatus: handleListingStatusChange,
      deletePost: handlePostDelete,
      recomposePost: handleRecomposeTask,
      copyPermalink: handleCopyPermalink,
      undoPendingPublish: handleUndoPendingPublish,
    }),
    [
      setFocusedTaskId, handleNewTask, handleToggleComplete, handleStatusChange,
      handleDueDateChange, handlePriorityChange, handleListingStatusChange,
      handlePostDelete, handleRecomposeTask, handleCopyPermalink,
      handleUndoPendingPublish,
    ]
  );

  const failedPublishCommands = useMemo<FailedPublishCommands>(
    () => ({
      retryFailedPublish: handleRetryFailedPublish,
      repostFailedPublish: handleRepostFailedPublish,
      dismissFailedPublish: handleDismissFailedPublish,
      dismissAllFailedPublish: handleDismissAllFailedPublish,
    }),
    [
      handleRetryFailedPublish, handleRepostFailedPublish,
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
      visibleChannels: expandedBandChannels,
      primaryChannels: primaryBandChannels,
      people,
      visiblePeople: peopleWithState,
      mentionablePeople: mentionAutocompletePeople,
      quickFilters,
    }),
    [
      relaysWithActiveState,
      channelsWithState,
      expandedBandChannels,
      primaryBandChannels,
      people,
      peopleWithState,
      mentionAutocompletePeople,
      quickFilters,
    ]
  );

  const desktopSidebarController = useMemo(
    () => ({
      relays: relaysWithActiveState,
      channels: expandedBandChannels,
      collapsedPreviewChannels: focusedTaskCollapsedSidebarPreview.channels ?? channelsWithState,
      channelMatchMode,
      people: peopleWithState,
      collapsedPreviewPeople: focusedTaskCollapsedSidebarPreview.people as typeof peopleWithState,
      pinnedPersonIds,
      nostrRelays,
      isFocused: isSidebarFocused,
      quickFilters,
      savedFilterConfigurations: savedFilterController.configurations,
      activeSavedFilterConfigurationId: savedFilterController.activeConfigurationId,
      posts: relayScopedTasks,
      focusedTaskId,
    }),
    [
      channelMatchMode,
      channelsWithState,
      expandedBandChannels,
      focusedTaskCollapsedSidebarPreview.channels,
      focusedTaskCollapsedSidebarPreview.people,
      focusedTaskId,
      isSidebarFocused,
      nostrRelays,
      peopleWithState,
      pinnedPersonIds,
      quickFilters,
      relayScopedTasks,
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
    }),
    [
      activeOnboardingStepId,
      authPolicy.canCreateContent,
      currentView,
      isAuthModalOpen,
      isManageRouteActive,
      isOnboardingOpen,
      isSidebarFocused,
      displayDepthMode,
      profileCompletionPromptSignal,
    ]
  );

  useEffect(() => {
    if (!import.meta.env.DEV || typeof performance === "undefined") return;
    renderCountRef.current += 1;
    const elapsed = performance.now() - renderStart;
    console.debug(
      `[hydration-perf] FeedIndexContent render #${renderCountRef.current}: view=${currentView} focusedTask=${focusedTaskId ?? "-"} ms=${elapsed.toFixed(1)}`,
    );
  });

  const welcomeController = (
    <WelcomeController
      openedWithFocusedTaskRef={openedWithFocusedTaskRef}
      showCreateAccount={Boolean(import.meta.env.VITE_NOAS_HOST_URL || defaultNoasHostUrl)}
      onOpenAuthModal={handleOpenAuthModal}
    />
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
      handleCloseGuide={handleCloseGuide}
      handleOnboardingStepChange={handleOnboardingStepChange}
      handleOnboardingActiveSectionChange={handleOnboardingActiveSectionChange}
    />
  );

  return (
    <PersonPresenceProvider
      latestPresenceByAuthor={latestPresenceByAuthor}
      allTasks={allTasks}
      currentUserPubkey={user?.pubkey}
    >
    <FeedPageProviders
      coreHandlers={coreHandlers}
      surfaceState={feedSurfaceState}
      viewState={feedViewState}
      sidebarCommands={sidebarCommands}
      viewCommands={viewCommands}
      taskCommands={taskCommands}
      failedPublishCommands={failedPublishCommands}
      scrollCaptureRef={scrollCaptureRef}
    >
      <DocumentTitleSync currentView={currentView} focusedTask={focusedTask} />
      <MotdBanner />
      {isMobile ? (
        <FeedPageMobileShell
          posts={relayScopedTasks}
          focusedTaskId={focusedTaskId}
          authModalProps={{
            isOpen: isAuthModalOpen,
            onClose: handleCloseAuthModal,
            initialStep: authModalInitialStep,
          }}
        />
      ) : (
        <DesktopAppShell
          posts={relayScopedTasks}
          focusedTaskId={focusedTaskId}
          sidebarController={desktopSidebarController}
          shortcutsHelpProps={{ isOpen: shortcutsHelp.isOpen, onClose: shortcutsHelp.close }}
          authModalProps={{
            isOpen: isAuthModalOpen,
            onClose: handleCloseAuthModal,
            initialStep: authModalInitialStep,
          }}
        />
      )}
      {welcomeController}
      {onboardingController}
    </FeedPageProviders>
    </PersonPresenceProvider>
  );
}

const Index = () => (
  <FeedRelayProvider>
    <FeedIndexContent />
  </FeedRelayProvider>
);

export default Index;
