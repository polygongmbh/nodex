import { Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Sidebar, SidebarHeader } from "@/components/layout/Sidebar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FailedPublishQueueBanner } from "@/components/tasks/FailedPublishQueueBanner";
import { DesktopSearchDock, type KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import { ViewSwitcher, ViewType } from "@/components/tasks/ViewSwitcher";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFeedNavigation } from "@/hooks/use-feed-navigation";
import { NOSTR_EVENTS_QUERY_KEY, useNostrEventCache } from "@/hooks/use-nostr-event-cache";
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useNDK } from "@/lib/nostr/ndk-context";
import { NostrAuthModal, NostrUserMenu } from "@/components/auth/NostrAuthModal";
import { ThemeModeToggle } from "@/components/theme/ThemeModeToggle";
import { LanguageToggle } from "@/components/theme/LanguageToggle";
import { CompletionFeedbackToggle } from "@/components/theme/CompletionFeedbackToggle";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import { OnboardingIntroPopover } from "@/components/onboarding/OnboardingIntroPopover";
import { mergeTasks, nostrEventsToTasks, getRelayIdFromUrl, getRelayNameFromUrl, isSpamContent } from "@/lib/nostr/event-converter";
import { deriveChannels } from "@/lib/channels";
import {
  loadPinnedChannelsState,
  savePinnedChannelsState,
  getPinnedChannelIdsForView,
  pinChannelForRelays,
  unpinChannelFromRelays,
  type PinnedChannelsState,
} from "@/lib/pinned-channels-preferences";
import {
  getChannelFrecencyScores,
  loadChannelFrecencyState,
  recordChannelInteraction,
  saveChannelFrecencyState,
  type ChannelFrecencyState,
} from "@/lib/channel-frecency";
import { applyTaskStatusUpdate, cycleTaskStatus } from "@/lib/task-status";
import { resolveCurrentUser } from "@/lib/current-user";
import { canUserChangeTaskStatus } from "@/lib/task-permissions";
import { isNostrEventId } from "@/lib/nostr/event-id";
import { NostrEventKind } from "@/lib/nostr/types";
import { isTaskStateEventKind } from "@/lib/nostr/task-state-events";
import { isPriorityPropertyEvent } from "@/lib/nostr/task-property-events";
import {
  buildImetaTag,
} from "@/lib/attachments";
import { shouldPromptSignInAfterOnboarding } from "@/lib/onboarding-auth-prompt";
import { filterTasks } from "@/lib/task-filtering";
import { deriveSidebarPeople } from "@/lib/sidebar-people";
import { loadPresencePublishingEnabled } from "@/lib/user-preferences";
import {
  loadCompletionSoundEnabled,
  saveCompletionSoundEnabled,
} from "@/lib/user-preferences";
import { playCompletionPopSound } from "@/lib/completion-feedback";
import {
  NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS,
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildActivePresenceContent,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import { shouldBootstrapGuideDemoFeed } from "@/lib/onboarding-guide";
import {
  mapPeopleSelection,
  setAllChannelFilters,
} from "@/lib/filter-state-utils";
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
import { useKind0People } from "@/hooks/use-kind0-people";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import {
  removeCachedNostrEventsByRelayUrl,
  removeRelayUrlFromCachedEvents,
  type CachedNostrEvent,
} from "@/lib/nostr/event-cache";
import { resolveChannelRelayScopeIds } from "@/lib/relay-scope";
import { isDemoFeedEnabled } from "@/lib/demo-feed-config";
import {
  notifyStatusRestricted,
} from "@/lib/notifications";
import { mockKind0Events, mockTasks, mockRelays as demoRelays } from "@/data/mockData";
import { cloneBasicNostrEvents } from "@/data/basic-nostr-events";
import {
  Relay,
  Channel,
  ChannelMatchMode,
  Task,
  TaskStatus,
} from "@/types";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// Demo relay constant
const DEMO_RELAY_ID = "demo";
const DEMO_FEED_ENABLED = isDemoFeedEnabled(import.meta.env.VITE_ENABLE_DEMO_FEED);
const LISTING_EVENT_KIND = NostrEventKind.ClassifiedListing;
const TASK_STATUS_REORDER_DELAY_MS = 260;
const INITIAL_CHANNEL_SEED_LIMIT = 16;
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

function buildPendingPublishDedupKey(task: Task): string {
  const authorId = task.author.id?.trim().toLowerCase() || "";
  const normalizedContent = task.content.trim();
  const normalizedTags = [...task.tags].map((tag) => tag.trim().toLowerCase()).sort().join(",");
  const feedMessageType = task.feedMessageType || "";
  const parentId = task.parentId || "";
  return `${authorId}|${task.taskType}|${feedMessageType}|${parentId}|${normalizedTags}|${normalizedContent}`;
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

  // Convert NDK relays to the format expected by sidebar/widgets
  const nostrRelays = useMemo(() => {
    return ndkRelays.map(r => ({
      url: r.url,
      status: r.status,
      latency: r.latency,
      nip11: r.nip11,
    }));
  }, [ndkRelays]);

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
    events: nostrEvents,
    hasLiveHydratedScope: hasLiveHydratedRelayScope,
  } = useNostrEventCache({
    isConnected: isNostrConnected,
    subscribedKinds,
    activeRelayIds: effectiveActiveRelayIds,
    availableRelayIds: relays.map((relay) => relay.id),
    subscribe,
  });
  const {
    people,
    setPeople,
    cachedKind0Events,
    supplementalLatestActivityByAuthor,
    seedCachedKind0Events,
    removeCachedRelayProfile,
  } = useKind0People(nostrEvents, selectedRelayUrls, user);
  const [localTasks, setLocalTasks] = useState<Task[]>(() => (DEMO_FEED_ENABLED ? DEMO_SEED_TASKS : []));
  const [postedTags, setPostedTags] = useState<string[]>([]);
  const [channelFrecencyState, setChannelFrecencyState] = useState<ChannelFrecencyState>(
    () => loadChannelFrecencyState()
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [completionSoundEnabled, setCompletionSoundEnabled] = useState(() => loadCompletionSoundEnabled());
  const [isSidebarFocused, setIsSidebarFocused] = useState(false);
  const pendingStatusUpdateTimeoutsRef = useRef<Map<string, number>>(new Map());
  const completionConfettiLastAtRef = useRef<Map<string, number>>(new Map());
  const pendingTaskStatusesRef = useRef<Map<string, TaskStatus>>(new Map());
  const [suppressedNostrEventIds, setSuppressedNostrEventIds] = useState<Set<string>>(new Set());
  const [sortStatusHoldByTaskId, setSortStatusHoldByTaskId] = useState<Record<string, TaskStatus>>({});
  const [sortModifiedAtHoldByTaskId, setSortModifiedAtHoldByTaskId] = useState<Record<string, string>>({});

  // Filter nostr events - only keep those with tags and not spam
  const filteredNostrEvents = useMemo(() => {
    return nostrEvents.filter(event => {
      if (suppressedNostrEventIds.has(event.id)) return false;
      if (event.kind === NostrEventKind.Metadata) return false;
      if (isTaskStateEventKind(event.kind)) return true;
      if (isPriorityPropertyEvent(event.kind, event.tags)) return true;
      if (event.kind === NostrEventKind.ClassifiedListing) return true;
      if (
        event.kind === NostrEventKind.CalendarDateBased ||
        event.kind === NostrEventKind.CalendarTimeBased
      ) {
        return true;
      }
      // Convert NDKEvent to check tags
      const hasTags = event.tags.some(tag => tag[0]?.toLowerCase() === "t" && tag[1]) ||
        /#\w+/.test(event.content);
      if (!hasTags) return false;
      // Filter out spam
      if (isSpamContent(event.content)) return false;
      return true;
    });
  }, [nostrEvents, suppressedNostrEventIds]);

  // Convert filtered Nostr events to tasks
  const nostrTasks: Task[] = useMemo(() => {
    return nostrEventsToTasks(
      filteredNostrEvents.map((event) => ({
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        kind: event.kind as NostrEventKind,
        tags: event.tags,
        content: event.content,
        sig: event.sig || "",
        relayUrl: event.relayUrl,
        relayUrls: event.relayUrls,
      }))
    );
  }, [filteredNostrEvents]);

  // Combine local tasks with Nostr tasks
  const allTasks = useMemo(() => {
    const nostrTaskDedupKeys = new Set(nostrTasks.map((task) => buildPendingPublishDedupKey(task)));
    const localTasksForMerge = localTasks.filter((task) => {
      if (!task.pendingPublishToken) return true;
      return !nostrTaskDedupKeys.has(buildPendingPublishDedupKey(task));
    });
    const combined = mergeTasks(localTasksForMerge, nostrTasks);
    const byId = new Map<string, Task>();
    const byListingReplaceableKey = new Map<string, Task>();

    for (const task of combined) {
      const listingReplaceableKey = getListingReplaceableKey(task, LISTING_EVENT_KIND);
      if (!listingReplaceableKey) {
        const existing = byId.get(task.id);
        if (!existing) {
          byId.set(task.id, task);
          continue;
        }
        const mergedRelays = Array.from(new Set([...existing.relays, ...task.relays]));
        byId.set(task.id, {
          ...(existing.timestamp.getTime() >= task.timestamp.getTime() ? existing : task),
          relays: mergedRelays,
        });
        continue;
      }
      const existing = byListingReplaceableKey.get(listingReplaceableKey);
      if (
        !existing ||
        task.timestamp.getTime() > existing.timestamp.getTime() ||
        (task.timestamp.getTime() === existing.timestamp.getTime() && task.id > existing.id)
      ) {
        byListingReplaceableKey.set(listingReplaceableKey, task);
      }
    }

    return [...byId.values(), ...byListingReplaceableKey.values()].map((task) => {
      const sortStatus = sortStatusHoldByTaskId[task.id];
      const sortLastEditedAtIso = sortModifiedAtHoldByTaskId[task.id];
      if (!sortStatus && !sortLastEditedAtIso) return task;
      return {
        ...task,
        ...(sortStatus ? { sortStatus } : {}),
        ...(sortLastEditedAtIso ? { sortLastEditedAt: new Date(sortLastEditedAtIso) } : {}),
      };
    }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [localTasks, nostrTasks, sortModifiedAtHoldByTaskId, sortStatusHoldByTaskId]);

  const personalizedChannelScores = useMemo(
    () => getChannelFrecencyScores(channelFrecencyState),
    [channelFrecencyState]
  );

  const scopedLocalTasksForChannels = useMemo(
    () =>
      {
        const channelRelayScopeIds = resolveChannelRelayScopeIds(
          effectiveActiveRelayIds,
          relays.map((relay) => relay.id)
        );
        return localTasks.filter((task) =>
          task.relays.length === 0 ||
          task.relays.some((relayId) => channelRelayScopeIds.has(relayId))
        );
      },
    [effectiveActiveRelayIds, localTasks, relays]
  );

  const scopedNostrEventsForChannels = useMemo(
    () => {
      const channelRelayScopeIds = resolveChannelRelayScopeIds(
        effectiveActiveRelayIds,
        relays.map((relay) => relay.id)
      );
      return filteredNostrEvents.filter((event) => {
        const relayUrls = [
          ...(event.relayUrls || []),
          ...(event.relayUrl ? [event.relayUrl] : []),
        ]
          .map((url) => url.trim().replace(/\/+$/, ""))
          .filter((url) => Boolean(url));
        if (relayUrls.length === 0) return false;
        return relayUrls.some((relayUrl) => channelRelayScopeIds.has(getRelayIdFromUrl(relayUrl)));
      });
    },
    [effectiveActiveRelayIds, filteredNostrEvents, relays]
  );

  // Sidebar channels: selected-feed scoped, personalized, and dampened by usage.
  const channels: Channel[] = useMemo(() => {
    return deriveChannels(scopedLocalTasksForChannels, scopedNostrEventsForChannels, postedTags, {
      minCount: 6,
      personalizeScores: personalizedChannelScores,
      maxCount: INITIAL_CHANNEL_SEED_LIMIT,
      sortVisibleAlphabetically: true,
    });
  }, [scopedLocalTasksForChannels, scopedNostrEventsForChannels, postedTags, personalizedChannelScores]);

  // Compose autocomplete channels: all known tags.
  const composeChannels: Channel[] = useMemo(() => {
    return deriveChannels(localTasks, filteredNostrEvents, postedTags, 1);
  }, [localTasks, filteredNostrEvents, postedTags]);

  const [pinnedChannelsState, setPinnedChannelsState] = useState<PinnedChannelsState>(
    () => loadPinnedChannelsState(user?.pubkey)
  );
  const bumpChannelFrecency = useCallback((tag: string, weight = 1) => {
    setChannelFrecencyState((previous) => recordChannelInteraction(previous, tag, weight));
  }, []);
  const sidebarPeople = useMemo(() => {
    return deriveSidebarPeople(people, allTasks, supplementalLatestActivityByAuthor);
  }, [allTasks, people, supplementalLatestActivityByAuthor]);
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

  // Reload pinned state when the authenticated user changes
  useEffect(() => {
    setPinnedChannelsState(loadPinnedChannelsState(user?.pubkey));
  }, [user?.pubkey]);

  useEffect(() => {
    savePinnedChannelsState(pinnedChannelsState, user?.pubkey);
  }, [pinnedChannelsState, user?.pubkey]);

  useEffect(() => {
    saveChannelFrecencyState(channelFrecencyState);
  }, [channelFrecencyState]);

  const handleFocusSidebar = useCallback(() => {
    setIsSidebarFocused(true);
  }, []);

  const handleFocusTasks = useCallback(() => {
    setIsSidebarFocused(false);
  }, []);

  const handleOpenAuthModal = useCallback(() => {
    setIsOnboardingIntroOpen(false);
    setIsOnboardingOpen(false);
    setIsAuthModalOpen(true);
  }, []);

  const shouldForceAuthAfterOnboarding = useMemo(() => {
    return shouldPromptSignInAfterOnboarding({
      isSignedIn: Boolean(user),
      relays: ndkRelays,
    });
  }, [ndkRelays, user]);

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
  } = useFeedNavigation({ allTasks, isMobile, effectiveActiveRelayIds, relays });

  const activeRelayIdList = useMemo(
    () => Array.from(effectiveActiveRelayIds),
    [effectiveActiveRelayIds]
  );

  // Map each channel ID to the relay IDs that have at least one post with that tag
  const channelRelayIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const task of allTasks) {
      for (const tag of task.tags) {
        let relays = map.get(tag);
        if (!relays) { relays = new Set(); map.set(tag, relays); }
        for (const relayId of task.relays) relays.add(relayId);
      }
    }
    return map;
  }, [allTasks]);

  // Merge dynamic channels with persisted filter states, pinned channels sorted first
  const channelsWithState: Channel[] = useMemo(() => {
    const pinnedIds = getPinnedChannelIdsForView(pinnedChannelsState, currentView, activeRelayIdList);
    const pinnedSet = new Set(pinnedIds);
    const existingIds = new Set(channels.map((c) => c.id));
    const stubs: Channel[] = pinnedIds
      .filter((id) => !existingIds.has(id))
      .map((id) => ({ id, name: id, usageCount: 0, filterState: "neutral" as const }));
    return [...stubs, ...channels]
      .map((channel) => ({
        ...channel,
        filterState: channelFilterStates.get(channel.id) ?? "neutral",
      }))
      .sort((a, b) => {
        const aIdx = pinnedSet.has(a.id) ? pinnedIds.indexOf(a.id) : Infinity;
        const bIdx = pinnedSet.has(b.id) ? pinnedIds.indexOf(b.id) : Infinity;
        return aIdx - bIdx;
      });
  }, [channels, channelFilterStates, pinnedChannelsState, currentView, activeRelayIdList]);

  const currentUser = resolveCurrentUser(people, user);
  const hasCachedCurrentUserProfileMetadata = useMemo(() => {
    if (!user?.pubkey) return true;
    const normalizedPubkey = user.pubkey.trim().toLowerCase();
    return cachedKind0Events.some((event) => {
      const eventPubkey = typeof event.pubkey === "string" ? event.pubkey.trim().toLowerCase() : "";
      return eventPubkey === normalizedPubkey && Boolean(event.content?.trim());
    });
  }, [cachedKind0Events, user?.pubkey]);
  const shortcutsHelp = useKeyboardShortcutsHelp();
  const [kanbanDepthMode, setKanbanDepthMode] = useState<KanbanDepthMode>("leaves");
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

  const handleChannelPin = useCallback((id: string) => {
    // Pin for each active relay that has at least one post with this tag.
    // Fall back to all active relays if none have the tag yet.
    const relaysWithTag = channelRelayIds.get(id);
    const targetRelayIds = relaysWithTag
      ? activeRelayIdList.filter((r) => relaysWithTag.has(r))
      : activeRelayIdList;
    const relayIds = targetRelayIds.length > 0 ? targetRelayIds : activeRelayIdList;
    setPinnedChannelsState((prev) => pinChannelForRelays(prev, currentView, relayIds, id));
  }, [activeRelayIdList, channelRelayIds, currentView]);

  const handleChannelUnpin = useCallback((id: string) => {
    // Unpin from all active relays.
    setPinnedChannelsState((prev) => unpinChannelFromRelays(prev, currentView, activeRelayIdList, id));
  }, [activeRelayIdList, currentView]);

  const triggerCompletionCheer = useCallback((taskId: string) => {
    triggerTaskCompletionCheer(taskId, completionConfettiLastAtRef.current);
  }, []);

  const triggerCompletionFeedback = useCallback((taskId: string, status: "todo" | "in-progress" | "done") => {
    if (status !== "done") return;
    triggerCompletionCheer(taskId);
    playCompletionPopSound(completionSoundEnabled);
  }, [completionSoundEnabled, triggerCompletionCheer]);

  const handleToggleCompletionSound = useCallback(() => {
    setCompletionSoundEnabled((previous) => {
      const next = !previous;
      saveCompletionSoundEnabled(next);
      return next;
    });
  }, []);

  const clearPendingStatusUpdate = useCallback((taskId: string) => {
    const timeoutId = pendingStatusUpdateTimeoutsRef.current.get(taskId);
    if (timeoutId === undefined) return;
    window.clearTimeout(timeoutId);
    pendingStatusUpdateTimeoutsRef.current.delete(taskId);
  }, []);

  const scheduleTaskStatusReorderUpdate = useCallback((taskId: string, status: TaskStatus) => {
    clearPendingStatusUpdate(taskId);
    const existingTask = allTasks.find((task) => task.id === taskId);
    const currentStatus = pendingTaskStatusesRef.current.get(taskId) ?? existingTask?.status ?? "todo";
    pendingTaskStatusesRef.current.set(taskId, status);
    setSortStatusHoldByTaskId((previous) => ({ ...previous, [taskId]: currentStatus }));
    if (existingTask) {
      const currentSortDate = existingTask.lastEditedAt || existingTask.timestamp;
      setSortModifiedAtHoldByTaskId((previous) => ({
        ...previous,
        [taskId]: currentSortDate.toISOString(),
      }));
    }

    const timeoutId = window.setTimeout(() => {
      setLocalTasks((previous) =>
        applyTaskStatusUpdate(previous, allTasks, taskId, status, currentUser?.name)
      );
      pendingTaskStatusesRef.current.delete(taskId);
      pendingStatusUpdateTimeoutsRef.current.delete(taskId);
      setSortStatusHoldByTaskId((previous) => {
        const next = { ...previous };
        delete next[taskId];
        return next;
      });
      setSortModifiedAtHoldByTaskId((previous) => {
        const next = { ...previous };
        delete next[taskId];
        return next;
      });
    }, TASK_STATUS_REORDER_DELAY_MS);

    pendingStatusUpdateTimeoutsRef.current.set(taskId, timeoutId);
  }, [allTasks, clearPendingStatusUpdate, currentUser?.name]);

  useEffect(() => {
    const pendingTimeouts = pendingStatusUpdateTimeoutsRef.current;
    const pendingStatuses = pendingTaskStatusesRef.current;
    return () => {
      for (const timeoutId of pendingTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      pendingTimeouts.clear();
      pendingStatuses.clear();
      setSortStatusHoldByTaskId({});
      setSortModifiedAtHoldByTaskId({});
    };
  }, []);

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
    allTasks,
    relays,
    effectiveActiveRelayIds,
    demoFeedActive,
    user,
    handleOpenAuthModal,
    publishEvent,
    t,
  });

  const handleToggleComplete = (taskId: string) => {
    if (guardInteraction("modify")) {
      return;
    }

    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask) return;
    if (!canUserChangeTaskStatus(existingTask, currentUser)) {
      notifyStatusRestricted(t);
      return;
    }
    const currentStatus = pendingTaskStatusesRef.current.get(taskId) ?? existingTask.status ?? "todo";
    const nextStatus = cycleTaskStatus(currentStatus);
    scheduleTaskStatusReorderUpdate(taskId, nextStatus);
    triggerCompletionFeedback(taskId, nextStatus);
    void publishTaskStateUpdate(taskId, nextStatus);
  };


  const handleStatusChange = (taskId: string, newStatus: "todo" | "in-progress" | "done") => {
    if (guardInteraction("modify")) {
      return;
    }

    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask) return;
    if (!canUserChangeTaskStatus(existingTask, currentUser)) {
      notifyStatusRestricted(t);
      return;
    }

    scheduleTaskStatusReorderUpdate(taskId, newStatus);
    triggerCompletionFeedback(taskId, newStatus);
    void publishTaskStateUpdate(taskId, newStatus);
  };

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

  // Build relays with active state for sidebar display
  const relaysWithActiveState: Relay[] = useMemo(() => {
    return relays.map((r) => ({
      ...r,
      isActive: effectiveActiveRelayIds.has(r.id),
    }));
  }, [relays, effectiveActiveRelayIds]);

  const handleAddRelay = useCallback((url: string) => {
    addRelay(url);
    const relayId = getRelayIdFromUrl(url);
    if (!relayId) return;
    setActiveRelayIds((previous) => {
      if (previous.has(relayId)) return previous;
      const next = new Set(previous);
      next.add(relayId);
      return next;
    });
  }, [addRelay, setActiveRelayIds]);

  const handleRemoveRelay = useCallback((url: string) => {
    const normalizedRelayUrl = url.trim().replace(/\/+$/, "");
    if (!normalizedRelayUrl) return;

    queryClient.setQueriesData<CachedNostrEvent[]>(
      { queryKey: NOSTR_EVENTS_QUERY_KEY },
      (previous) => removeRelayUrlFromCachedEvents(previous || [], normalizedRelayUrl)
    );
    removeCachedNostrEventsByRelayUrl(normalizedRelayUrl);
    removeCachedRelayProfile(normalizedRelayUrl);

    const relayId = getRelayIdFromUrl(normalizedRelayUrl);
    if (relayId) {
      setActiveRelayIds((previous) => {
        if (!previous.has(relayId)) return previous;
        const next = new Set(previous);
        next.delete(relayId);
        return next;
      });
    }

    removeRelay(normalizedRelayUrl);
  }, [queryClient, removeCachedRelayProfile, removeRelay, setActiveRelayIds]);

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
