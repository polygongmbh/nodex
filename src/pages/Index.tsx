import { Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Sidebar, SidebarHeader } from "@/components/layout/Sidebar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FailedPublishQueueBanner } from "@/components/tasks/FailedPublishQueueBanner";
import { DesktopSearchDock, type KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import { ViewSwitcher } from "@/components/tasks/ViewSwitcher";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFeedNavigation } from "@/hooks/use-feed-navigation";
import { useNostrEventCache } from "@/hooks/use-nostr-event-cache";
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useNDK } from "@/lib/nostr/ndk-context";
import { NostrAuthModal, NostrUserMenu } from "@/components/auth/NostrAuthModal";
import { ThemeModeToggle } from "@/components/theme/ThemeModeToggle";
import { LanguageToggle } from "@/components/theme/LanguageToggle";
import { CompletionFeedbackToggle } from "@/components/theme/CompletionFeedbackToggle";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import { OnboardingIntroPopover } from "@/components/onboarding/OnboardingIntroPopover";
import { mergeTasks, nostrEventsToTasks, getRelayIdFromUrl, getRelayNameFromUrl } from "@/lib/nostr/event-converter";
import {
  getPinnedChannelIdsForView,
} from "@/lib/pinned-channels-preferences";
import {
  saveChannelFrecencyState,
  loadChannelFrecencyState,
  recordChannelInteraction,
  type ChannelFrecencyState,
} from "@/lib/channel-frecency";
import { isNostrEventId } from "@/lib/nostr/event-id";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  buildImetaTag,
} from "@/lib/attachments";
import { shouldPromptSignInAfterOnboarding } from "@/lib/onboarding-auth-prompt";
import { filterTasks } from "@/lib/task-filtering";
import { loadPresencePublishingEnabled } from "@/lib/user-preferences";
import {
  NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS,
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildActivePresenceContent,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import { shouldBootstrapGuideDemoFeed } from "@/lib/onboarding-guide";
import { buildFilterSnapshot, type FilterSnapshot } from "@/lib/filter-snapshot";
import { buildNip99PublishTags } from "@/lib/nostr/nip99-metadata";
import type { Nip99ListingStatus } from "@/types";
import { getListingReplaceableKey } from "@/lib/nostr/listing-replaceable-key";
import { getConfiguredDefaultRelayIds } from "@/lib/nostr/default-relays";
import { useIndexFilters } from "@/hooks/use-index-filters";
import { useIndexOnboarding } from "@/hooks/use-index-onboarding";
import { useRelayFilterState } from "@/hooks/use-relay-filter-state";
import { useSavedFilterConfigs } from "@/hooks/use-saved-filter-configs";
import { useTaskPublishFlow } from "@/hooks/use-task-publish-flow";
import { useTaskPublishControls } from "@/hooks/use-task-publish-controls";
import { useTaskStatusController } from "@/hooks/use-task-status-controller";
import { useKind0People } from "@/hooks/use-kind0-people";
import { applyTaskSortOverlays, useIndexDerivedData } from "@/hooks/use-index-derived-data";
import { usePinnedSidebarChannels } from "@/hooks/use-pinned-sidebar-channels";
import { useIndexRelayShell } from "@/hooks/use-index-relay-shell";
import { resolveChannelRelayScopeIds } from "@/lib/relay-scope";
import { isDemoFeedEnabled } from "@/lib/demo-feed-config";
import { mockKind0Events, mockTasks, mockRelays as demoRelays } from "@/data/mockData";
import { cloneBasicNostrEvents } from "@/data/basic-nostr-events";
import {
  Relay,
  Task,
} from "@/types";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// Demo relay constant
const DEMO_RELAY_ID = "demo";
const DEMO_FEED_ENABLED = isDemoFeedEnabled(import.meta.env.VITE_ENABLE_DEMO_FEED);
const LISTING_EVENT_KIND = NostrEventKind.ClassifiedListing;
const DEMO_SEED_TASKS = mergeTasks(mockTasks, nostrEventsToTasks(cloneBasicNostrEvents()));
const FeedView = lazy(() =>
  import("@/components/tasks/FeedView").then((module) => ({ default: module.FeedView }))
);
const KanbanView = lazy(() =>
  import("@/components/tasks/KanbanView").then((module) => ({ default: module.KanbanView }))
);
const CalendarView = lazy(() =>
  import("@/components/tasks/CalendarView").then((module) => ({ default: module.CalendarView }))
);
const ListView = lazy(() =>
  import("@/components/tasks/ListView").then((module) => ({ default: module.ListView }))
);

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

  // Auth modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [guideDemoFeedEnabled, setGuideDemoFeedEnabled] = useState(false);
  const demoFeedActive = DEMO_FEED_ENABLED || guideDemoFeedEnabled;

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
    const nostrRelayItems = ndkRelays.map((r) => ({
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

  const defaultRelayIds = useMemo(() => {
    const configuredRelayIds = getConfiguredDefaultRelayIds();
    if (!demoFeedActive) return configuredRelayIds;
    return Array.from(new Set([DEMO_RELAY_ID, ...configuredRelayIds]));
  }, [demoFeedActive]);

  const isMobile = useIsMobile();
  const {
    setActiveRelayIds,
    effectiveActiveRelayIds,
    handleRelayToggle,
    handleRelayExclusive,
    handleToggleAllRelays,
  } = useRelayFilterState({
    relays,
    t,
    defaultRelayIds,
    onRelayEnabled: (relay) => {
      if (
        relay.id !== DEMO_RELAY_ID &&
        relay.url &&
        relay.connectionStatus &&
        relay.connectionStatus !== "connected"
      ) {
        reconnectRelay(relay.url);
      }
    },
  });

  const {
    events: nostrEvents,
    hasLiveHydratedScope: hasLiveHydratedRelayScope,
  } = useNostrEventCache({
    isConnected: isNostrConnected,
    subscribedKinds,
    activeRelayIds: effectiveActiveRelayIds,
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
  });

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
    handleChannelExclusive,
    handleToggleAllChannels,
    handleChannelMatchModeChange,
    handleHashtagExclusive,
    handlePersonToggle,
    handlePersonExclusive,
    handleToggleAllPeople,
    handleAuthorClick,
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
    sidebarPeople,
    isMobile,
    setSearchQuery,
    bumpChannelFrecency,
    t,
  });

  const handleOpenAuthModal = useCallback(() => {
    setIsAuthModalOpen(true);
  }, []);

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
    channels,
    channelFilterStates,
    allTasks,
  });

  const filteredTasks = useMemo(
    () =>
      filterTasks({
        tasks: allTasks,
        activeRelayIds: effectiveActiveRelayIds,
        channels: channelsWithState,
        people,
        channelMatchMode,
        allowUnknownRelayMetadata: !hasLiveHydratedRelayScope,
      }),
    [allTasks, channelMatchMode, channelsWithState, effectiveActiveRelayIds, hasLiveHydratedRelayScope, people]
  );

  const ensureGuideDataAvailable = useCallback(() => {
    if (!shouldBootstrapGuideDemoFeed({ totalTasks: allTasks.length, demoFeedActive })) return;
    setGuideDemoFeedEnabled(true);
    setLocalTasks((previous) => (previous.length === 0 ? DEMO_SEED_TASKS : previous));
    seedCachedKind0Events(mockKind0Events);
    setActiveRelayIds((previous) => {
      const next = new Set(previous);
      next.add(DEMO_RELAY_ID);
      return next;
    });
    navigate("/feed");
  }, [allTasks.length, demoFeedActive, navigate, seedCachedKind0Events, setActiveRelayIds]);

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
      }),
    [effectiveActiveRelayIds, channelFilterStates, people, channelMatchMode]
  );
  const { savedFilterController } = useSavedFilterConfigs({
    currentFilterSnapshot,
    relays,
    setActiveRelayIds,
    setChannelFilterStates,
    setChannelMatchMode,
    setPeople,
    resetFiltersToDefault,
  });

  const handleListingStatusChange = useCallback((taskId: string, status: Nip99ListingStatus) => {
    if (guardInteraction("modify")) return;
    const existing = allTasks.find((task) => task.id === taskId);
    if (!existing?.feedMessageType || !existing.nip99) return;
    if (!currentUser?.id || currentUser.id.toLowerCase() !== existing.author.id.toLowerCase()) return;
    const previousStatus = existing.nip99.status;
    const replaceableKey = getListingReplaceableKey(existing, LISTING_EVENT_KIND);
    if (!replaceableKey) return;

    setLocalTasks((prev) => {
      const nextNip99 = { ...(existing.nip99 || {}), status };
      const matchesListing = (task: Task) =>
        task.id === taskId ||
        getListingReplaceableKey(task, LISTING_EVENT_KIND) === replaceableKey;
      let touched = false;
      const next = prev.map((task) => {
        if (!matchesListing(task)) return task;
        touched = true;
        return { ...task, nip99: nextNip99, lastEditedAt: new Date() };
      });
      if (touched) return next;
      return [{ ...existing, nip99: nextNip99, lastEditedAt: new Date() }, ...next];
    });

    if (!isNostrEventId(existing.id)) return;
    const { relayUrls } = resolveTaskOriginRelay(existing.id);
    if (relayUrls.length === 0) {
      toast.error("Failed to publish listing status update to relay");
      return;
    }

    const publishTags = buildNip99PublishTags({
      metadata: { ...existing.nip99, status },
      feedMessageType: existing.feedMessageType,
      hashtags: existing.tags,
      mentionPubkeys: (existing.mentions || []).filter((mention) => /^[a-f0-9]{64}$/i.test(mention)),
      attachmentTags: (existing.attachments || [])
        .map((attachment) => buildImetaTag(attachment))
        .filter((tag) => tag.length > 0),
      fallbackTitle: existing.content.slice(0, 80),
      identifierSeed: existing.nip99.identifier || existing.id,
      statusOverride: status,
      locationGeohash: existing.locationGeohash,
    });

    void publishEvent(
      NostrEventKind.ClassifiedListing,
      existing.content,
      publishTags,
      undefined,
      relayUrls.slice(0, 1)
    ).then((result) => {
      if (!result.success) {
        toast.error("Failed to publish listing status update to relay");
        setLocalTasks((prev) => prev.map((task) => {
          const taskReplaceableKey = getListingReplaceableKey(task, LISTING_EVENT_KIND);
          if (taskReplaceableKey !== replaceableKey) return task;
          return {
            ...task,
            nip99: { ...(task.nip99 || {}), status: previousStatus || "active" },
            lastEditedAt: new Date(),
          };
        }));
      }
    });
  }, [allTasks, currentUser?.id, guardInteraction, publishEvent, resolveTaskOriginRelay]);

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

  const viewProps = {
    tasks: filteredTasks,
    allTasks: allTasks,
    relays: relaysWithActiveState,
    channels: channelsWithState,
    channelMatchMode,
    composeChannels: composeChannelsWithState,
    people,
    currentUser,
    searchQuery,
    onSearchChange: setSearchQuery,
    onNewTask: handleNewTask,
    onToggleComplete: handleToggleComplete,
    focusedTaskId,
    onFocusTask: setFocusedTaskId,
    onStatusChange: handleStatusChange,
    onListingStatusChange: handleListingStatusChange,
    onFocusSidebar: handleFocusSidebar,
    onSignInClick: handleOpenAuthModal,
    onHashtagClick: handleHashtagExclusive,
    forceShowComposer: forceShowComposeForGuide,
    onAuthorClick: handleAuthorClick,
    onUndoPendingPublish: handleUndoPendingPublish,
    isPendingPublishTask,
    composeRestoreRequest,
    mentionRequest,
    composeGuideActivationSignal,
    onUpdateDueDate: handleDueDateChange,
    onUpdatePriority: handlePriorityChange,
    isInteractionBlocked,
    onInteractionBlocked: handleBlockedInteractionAttempt,
  };

  const renderView = () => {
    const viewFallback = <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading view...</div>;
    switch (currentView) {
      case "tree":
        return <TaskTree {...viewProps} />;
      case "feed":
        return (
          <Suspense fallback={viewFallback}>
            <FeedView {...viewProps} />
          </Suspense>
        );
      case "kanban":
        return (
          <Suspense fallback={viewFallback}>
            <KanbanView {...viewProps} depthMode={kanbanDepthMode} />
          </Suspense>
        );
      case "calendar":
        return (
          <Suspense fallback={viewFallback}>
            <CalendarView {...viewProps} />
          </Suspense>
        );
      case "list":
        return (
          <Suspense fallback={viewFallback}>
            <ListView {...viewProps} depthMode={kanbanDepthMode} />
          </Suspense>
        );
      default:
        return <TaskTree {...viewProps} />;
    }
  };

  const onboardingOverlays = (
    <>
      <OnboardingIntroPopover
        isOpen={isOnboardingIntroOpen && !isAuthModalOpen}
        onStartTour={handleStartOnboardingTour}
        onSignIn={handleOpenAuthModal}
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

  // Mobile layout
  if (isMobile) {
    return (
      <>
        <MobileLayout
          relays={relaysWithActiveState}
          channels={channelsWithState}
          channelMatchMode={channelMatchMode}
          people={people}
          tasks={filteredTasks}
          allTasks={allTasks}
          searchQuery={searchQuery}
          focusedTaskId={focusedTaskId}
          currentUser={currentUser}
          hasCachedCurrentUserProfileMetadata={hasCachedCurrentUserProfileMetadata}
          isSignedIn={Boolean(user)}
          currentView={currentView}
          onViewChange={setCurrentView}
          onSearchChange={setSearchQuery}
          onNewTask={handleNewTask}
          onToggleComplete={handleToggleComplete}
          onStatusChange={handleStatusChange}
          onFocusTask={setFocusedTaskId}
          onRelayToggle={handleRelayToggle}
          onChannelToggle={handleChannelToggle}
          onPersonToggle={handlePersonToggle}
          onChannelMatchModeChange={handleChannelMatchModeChange}
          onAddRelay={handleAddRelay}
          onRemoveRelay={handleRemoveRelay}
          onSignInClick={handleOpenAuthModal}
          onGuideClick={handleOpenGuide}
          completionSoundEnabled={completionSoundEnabled}
          onToggleCompletionSound={handleToggleCompletionSound}
          onHashtagClick={handleHashtagExclusive}
          forceComposeMode={forceShowComposeForGuide}
          onAuthorClick={handleAuthorClick}
          onUndoPendingPublish={handleUndoPendingPublish}
          isPendingPublishTask={isPendingPublishTask}
          composeRestoreRequest={composeRestoreRequest}
          mentionRequest={mentionRequest}
          failedPublishDrafts={failedPublishDrafts}
          visibleFailedPublishDrafts={visibleFailedPublishDrafts}
          selectedPublishableRelayIds={selectedPublishableRelayIds}
          onRetryFailedPublish={handleRetryFailedPublish}
          onRepostFailedPublish={handleRepostFailedPublish}
          onDismissFailedPublish={handleDismissFailedPublish}
          onDismissAllFailedPublish={handleDismissAllFailedPublish}
          isInteractionBlocked={isInteractionBlocked}
          onInteractionBlocked={handleBlockedInteractionAttempt}
          isOnboardingOpen={isOnboardingOpen && !isAuthModalOpen}
          activeOnboardingStepId={activeOnboardingStepId}
          isManageRouteActive={isManageRouteActive}
          onManageRouteChange={setManageRouteActive}
        />
        <NostrAuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        {onboardingOverlays}
      </>
    );
  }

  // Desktop layout
  return (
    <div className="grid app-shell-height overflow-hidden bg-background grid-cols-[auto,1fr] grid-rows-[var(--topbar-height),1fr] [--topbar-height:3rem] sm:[--topbar-height:3.5rem] xl:[--topbar-height:4rem]">
      <SidebarHeader className="h-[var(--topbar-height)]" />
      <div className="border-b border-border px-2 sm:px-3 bg-background/95 backdrop-blur-sm flex items-stretch justify-between gap-2 min-w-0 h-[var(--topbar-height)]">
        <div className="flex-1 min-w-0 h-full">
          <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} />
        </div>
        <div className="h-full flex items-center justify-end gap-2 w-auto pl-2">
          <NostrUserMenu onSignInClick={handleOpenAuthModal} />
          <LanguageToggle />
          <CompletionFeedbackToggle
            enabled={completionSoundEnabled}
            onToggle={handleToggleCompletionSound}
            className="hidden lg:inline-flex"
          />
          <ThemeModeToggle />
        </div>
      </div>
      <Sidebar
        relays={relaysWithActiveState}
        channels={channelsWithState}
        channelMatchMode={channelMatchMode}
        people={sidebarPeople}
        nostrRelays={nostrRelays}
        onRelayToggle={handleRelayToggle}
        onRelayExclusive={handleRelayExclusive}
        onChannelToggle={handleChannelToggle}
        onChannelExclusive={handleChannelExclusive}
        onPersonToggle={handlePersonToggle}
        onPersonExclusive={handlePersonExclusive}
        onToggleAllRelays={handleToggleAllRelays}
        onToggleAllChannels={handleToggleAllChannels}
        onChannelMatchModeChange={handleChannelMatchModeChange}
        onToggleAllPeople={handleToggleAllPeople}
        onAddRelay={handleAddRelay}
        onRemoveRelay={handleRemoveRelay}
        onReconnectRelay={reconnectRelay}
        isFocused={isSidebarFocused}
        onFocusTasks={handleFocusTasks}
        onShortcutsClick={shortcutsHelp.open}
        onGuideClick={handleOpenGuide}
        savedFilters={savedFilterController}
        pinnedChannelIds={getPinnedChannelIdsForView(pinnedChannelsState, currentView, activeRelayIdList)}
        onChannelPin={handleChannelPin}
        onChannelUnpin={handleChannelUnpin}
      />
      <div className="min-w-0 overflow-hidden flex flex-col" {...desktopSwipeHandlers}>
        <FailedPublishQueueBanner
          drafts={failedPublishDrafts}
          selectedFeedDrafts={visibleFailedPublishDrafts}
          onRetry={handleRetryFailedPublish}
          onRepost={handleRepostFailedPublish}
          selectedRelayIds={selectedPublishableRelayIds}
          onDismiss={handleDismissFailedPublish}
          onDismissAll={handleDismissAllFailedPublish}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          {renderView()}
        </div>
        <DesktopSearchDock
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showKanbanLevels={currentView === "kanban" || currentView === "list"}
          kanbanDepthMode={kanbanDepthMode}
          onKanbanDepthModeChange={setKanbanDepthMode}
        />
      </div>

      {/* Keyboard Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp isOpen={shortcutsHelp.isOpen} onClose={shortcutsHelp.close} />

      {/* Nostr Auth Modal */}
      <NostrAuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      {onboardingOverlays}
    </div>
  );
};

export default Index;
