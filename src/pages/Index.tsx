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
import { canUserChangeTaskStatus, extractAssignedMentionsFromContent } from "@/lib/task-permissions";
import { isNostrEventId } from "@/lib/nostr/event-id";
import { NostrEventKind } from "@/lib/nostr/types";
import { isTaskStateEventKind, mapTaskStatusToStateEvent } from "@/lib/nostr/task-state-events";
import { buildLinkedTaskCalendarEvent } from "@/lib/nostr/nip52-task-calendar-events";
import { buildTaskPriorityUpdateEvent, isPriorityPropertyEvent } from "@/lib/nostr/task-property-events";
import { buildTaskPublishTags } from "@/lib/nostr/task-publish-tags";
import {
  buildImetaTag,
  extractEmbeddableAttachmentsFromContent,
  normalizePublishedAttachments,
} from "@/lib/attachments";
import {
  resolveOriginRelayIdForTask,
  resolveRelaySelectionForSubmission,
} from "@/lib/nostr/task-relay-routing";
import {
  loadFailedPublishDrafts,
  saveFailedPublishDrafts,
  type FailedPublishDraft,
} from "@/lib/failed-publish-drafts";
import { shouldPromptSignInAfterOnboarding } from "@/lib/onboarding-auth-prompt";
import { filterTasks } from "@/lib/task-filtering";
import { deriveSidebarPeople } from "@/lib/sidebar-people";
import { loadPresencePublishingEnabled } from "@/lib/presence-preferences";
import { loadPublishDelayEnabled } from "@/lib/publish-delay-preferences";
import {
  loadCompletionSoundEnabled,
  saveCompletionSoundEnabled,
} from "@/lib/completion-feedback-preferences";
import { playCompletionPopSound } from "@/lib/completion-feedback";
import { triggerTaskCompletionCheer } from "@/lib/completion-cheer";
import {
  NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS,
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildActivePresenceContent,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import { shouldBootstrapGuideDemoFeed } from "@/lib/onboarding-guide";
import { resolveMentionedPubkeysAsync } from "@/lib/mentions";
import { resolveNip05Identifier } from "@/lib/nostr/nip05-resolver";
import {
  mapPeopleSelection,
  setAllChannelFilters,
} from "@/lib/filter-state-utils";
import { buildFilterSnapshot, type FilterSnapshot } from "@/lib/filter-snapshot";
import { normalizeComposerMessageType } from "@/lib/task-type";
import { buildNip99PublishTags } from "@/lib/nostr/nip99-metadata";
import type { Nip99ListingStatus } from "@/types";
import { getListingReplaceableKey } from "@/lib/nostr/listing-replaceable-key";
import { normalizeGeohash } from "@/lib/nostr/geohash-location";
import { getConfiguredDefaultRelayIds } from "@/lib/nostr/default-relays";
import { useIndexFilters } from "@/hooks/use-index-filters";
import { useIndexOnboarding } from "@/hooks/use-index-onboarding";
import { useRelayFilterState } from "@/hooks/use-relay-filter-state";
import { useSavedFilterConfigs } from "@/hooks/use-saved-filter-configs";
import { useKind0People } from "@/hooks/use-kind0-people";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import {
  removeCachedNostrEventById,
  removeCachedNostrEventsByRelayUrl,
  removeRelayUrlFromCachedEvents,
  type CachedNostrEvent,
} from "@/lib/nostr/event-cache";
import { resolveChannelRelayScopeIds } from "@/lib/relay-scope";
import { resolveSubmissionTags } from "@/lib/submission-tags";
import { isDemoFeedEnabled } from "@/lib/demo-feed-config";
import {
  notifyDisconnectedSelectedFeeds,
  notifyLocalSaved,
  notifyNeedSigninModify,
  notifyNeedSigninPost,
  notifyNeedTag,
  notifyPartialPublish,
  notifyPublished,
  notifyPublishSavedForRetry,
  notifyStatusRestricted,
} from "@/lib/notifications";
import { mockKind0Events, mockTasks, mockRelays as demoRelays } from "@/data/mockData";
import { cloneBasicNostrEvents } from "@/data/basic-nostr-events";
import {
  Relay,
  Channel,
  ChannelMatchMode,
  Person,
  Task,
  TaskCreateResult,
  TaskDateType,
  TaskStatus,
  ComposeRestoreRequest,
  ComposeRestoreState,
  PublishedAttachment,
  Nip99Metadata,
} from "@/types";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// Demo relay constant
const DEMO_RELAY_ID = "demo";
const DEMO_FEED_ENABLED = isDemoFeedEnabled(import.meta.env.VITE_ENABLE_DEMO_FEED);
const LISTING_EVENT_KIND = NostrEventKind.ClassifiedListing;
const TASK_STATUS_REORDER_DELAY_MS = 260;
const PUBLISH_UNDO_DELAY_MS = 5000;
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

  const [failedPublishDrafts, setFailedPublishDrafts] = useState<FailedPublishDraft[]>(() => loadFailedPublishDrafts());

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
  const pendingPublishStateRef = useRef<Map<string, { timeoutId: number; toastId: string | number; composeState: ComposeRestoreState }>>(new Map());
  const [pendingPublishTaskIds, setPendingPublishTaskIds] = useState<Set<string>>(new Set());
  const [suppressedNostrEventIds, setSuppressedNostrEventIds] = useState<Set<string>>(new Set());
  const [composeRestoreRequest, setComposeRestoreRequest] = useState<ComposeRestoreRequest | null>(null);
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
    saveFailedPublishDrafts(failedPublishDrafts);
  }, [failedPublishDrafts]);

  useEffect(() => {
    savePinnedChannelsState(pinnedChannelsState, user?.pubkey);
  }, [pinnedChannelsState, user?.pubkey]);

  useEffect(() => {
    saveChannelFrecencyState(channelFrecencyState);
  }, [channelFrecencyState]);

  useEffect(() => {
    const pendingPublishState = pendingPublishStateRef.current;
    return () => {
      for (const pending of pendingPublishState.values()) {
        window.clearTimeout(pending.timeoutId);
        toast.dismiss(pending.toastId);
      }
      pendingPublishState.clear();
    };
  }, []);

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

  const resolveMentionPubkeys = useCallback(async (content: string): Promise<string[]> => {
    return resolveMentionedPubkeysAsync(content, people, {
      resolveNip05: resolveNip05Identifier,
    });
  }, [people]);

  const resolveRelayUrlsFromIds = useCallback((relayIds: string[]) => {
    const resolvedRelayUrls = relays
      .filter((relay) => relayIds.includes(relay.id))
      .map((relay) => relay.url)
      .filter((url): url is string => Boolean(url));
    nostrDevLog("routing", "Resolved relay IDs to relay URLs", {
      relayIds,
      resolvedRelayUrls,
    });
    return resolvedRelayUrls;
  }, [relays]);

  const hasDisconnectedSelectedRelays = useMemo(() => {
    return relays.some(
      (relay) =>
        effectiveActiveRelayIds.has(relay.id) &&
        relay.id !== DEMO_RELAY_ID &&
        relay.connectionStatus !== "connected"
    );
  }, [effectiveActiveRelayIds, relays]);

  const notifyModifyBlockedByDisconnectedFeeds = useCallback(() => {
    notifyDisconnectedSelectedFeeds(t);
  }, [t]);

  const isInteractionBlocked = !user || hasDisconnectedSelectedRelays;

  const guardInteraction = useCallback((mode: "post" | "modify"): boolean => {
    if (hasDisconnectedSelectedRelays) {
      notifyModifyBlockedByDisconnectedFeeds();
      return true;
    }
    if (!user) {
      handleOpenAuthModal();
      if (mode === "post") {
        notifyNeedSigninPost(t);
      } else {
        notifyNeedSigninModify(t);
      }
      return true;
    }
    return false;
  }, [handleOpenAuthModal, hasDisconnectedSelectedRelays, notifyModifyBlockedByDisconnectedFeeds, t, user]);

  const handleBlockedInteractionAttempt = useCallback(() => {
    guardInteraction("modify");
  }, [guardInteraction]);

  const resolveTaskOriginRelay = useCallback((taskId: string) => {
    const task = allTasks.find((item) => item.id === taskId);
    const originRelayId = resolveOriginRelayIdForTask(task, demoFeedActive ? DEMO_RELAY_ID : undefined);
    if (!originRelayId) {
      nostrDevLog("routing", "No origin relay found for task", { taskId });
      return { relayId: undefined, relayUrls: [] as string[] };
    }
    const relayUrls = resolveRelayUrlsFromIds([originRelayId]);
    nostrDevLog("routing", "Resolved task origin relay", {
      taskId,
      originRelayId,
      relayUrls,
    });
    return {
      relayId: originRelayId,
      relayUrls,
    };
  }, [allTasks, resolveRelayUrlsFromIds]);

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

  const publishTaskStateUpdate = useCallback(async (
    taskId: string,
    status: "todo" | "in-progress" | "done",
    relayUrlsOverride?: string[]
  ) => {
    if (!isNostrEventId(taskId)) {
      nostrDevLog("publish-state", "Skipping publish for non-Nostr task id", { taskId, status });
      return;
    }

    const relayUrls = relayUrlsOverride && relayUrlsOverride.length > 0
      ? relayUrlsOverride.slice(0, 1)
      : resolveTaskOriginRelay(taskId).relayUrls;

    if (relayUrls.length === 0) {
      nostrDevLog("publish-state", "Skipping publish due to empty relay mapping", { taskId, status });
      return;
    }
    nostrDevLog("publish-state", "Publishing task status update", { taskId, status, relayUrls });

    const mapped = mapTaskStatusToStateEvent(status);
    const result = await publishEvent(
      mapped.kind,
      mapped.content,
      [["e", taskId, relayUrls[0], "property"]],
      undefined,
      relayUrls
    );

    if (!result.success) {
      toast.error(t("toasts.errors.publishStatusFailed"));
      console.warn("Status publish failed", { taskId, status, relayUrls });
    }
  }, [publishEvent, resolveTaskOriginRelay, t]);

  const publishTaskDueUpdate = useCallback(async (
    taskId: string,
    taskContent: string,
    dueDate: Date,
    dueTime?: string,
    dateType: TaskDateType = "due",
    relayUrlsOverride?: string[]
  ) => {
    if (!isNostrEventId(taskId)) return false;
    const relayUrls = relayUrlsOverride && relayUrlsOverride.length > 0
      ? relayUrlsOverride.slice(0, 1)
      : resolveTaskOriginRelay(taskId).relayUrls;
    if (relayUrls.length === 0) {
      toast.error(t("toasts.errors.publishDateFailed"));
      nostrDevLog("publish-date", "Unable to publish due date update: no relay mapping", {
        taskId,
        dateType,
      });
      return false;
    }
    nostrDevLog("publish-date", "Publishing task due date update", {
      taskId,
      relayUrls,
      dateType,
    });
    const relayUrl = relayUrls[0];
    const calendarEvent = buildLinkedTaskCalendarEvent({
      taskEventId: taskId,
      taskContent,
      dueDate,
      dueTime,
      dateType,
      relayUrl,
    });
    const result = await publishEvent(
      calendarEvent.kind,
      calendarEvent.content,
      calendarEvent.tags,
      undefined,
      [relayUrl]
    );
    if (!result.success) {
      toast.error(t("toasts.errors.publishDateFailed"));
      console.warn("Date publish failed", { taskId, relayUrl });
    }
    return result.success;
  }, [publishEvent, resolveTaskOriginRelay, t]);

  const publishTaskPriorityUpdate = useCallback(async (taskId: string, priority: number) => {
    if (!isNostrEventId(taskId)) return false;
    const { relayUrls } = resolveTaskOriginRelay(taskId);
    if (relayUrls.length === 0) {
      toast.error(t("toasts.errors.publishPriorityFailed"));
      nostrDevLog("publish-priority", "Unable to publish priority update: no relay mapping", {
        taskId,
        priority,
      });
      return false;
    }
    nostrDevLog("publish-priority", "Publishing task priority update", {
      taskId,
      priority,
      relayUrls,
    });
    const relayUrl = relayUrls[0];
    const priorityEvent = buildTaskPriorityUpdateEvent({
      taskEventId: taskId,
      priority,
      relayUrl,
    });
    const result = await publishEvent(
      priorityEvent.kind,
      priorityEvent.content,
      priorityEvent.tags,
      undefined,
      [relayUrl]
    );
    if (!result.success) {
      toast.error(t("toasts.errors.publishPriorityFailed"));
      console.warn("Priority publish failed", { taskId, priority, relayUrl });
    }
    return result.success;
  }, [publishEvent, resolveTaskOriginRelay, t]);

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

  const isPendingPublishTask = useCallback((taskId: string) => {
    return pendingPublishTaskIds.has(taskId);
  }, [pendingPublishTaskIds]);

  const clearPendingPublishTask = useCallback((taskId: string, options?: { dismissToast?: boolean }) => {
    const pending = pendingPublishStateRef.current.get(taskId);
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    if (options?.dismissToast !== false) {
      toast.dismiss(pending.toastId);
    }
    pendingPublishStateRef.current.delete(taskId);
    setPendingPublishTaskIds((prev) => {
      if (!prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  }, []);

  const handleUndoPendingPublish = useCallback((taskId: string) => {
    const pending = pendingPublishStateRef.current.get(taskId);
    if (!pending) return;
    setComposeRestoreRequest({
      id: Date.now(),
      state: pending.composeState,
    });
    clearPendingPublishTask(taskId);
    setLocalTasks((prev) => prev.filter((task) => task.id !== taskId));
    toast.info(t("toasts.success.publishUndone"));
  }, [clearPendingPublishTask, t]);

  const suppressFailedPublishEvent = useCallback((eventId?: string) => {
    const normalizedEventId = (eventId || "").trim();
    if (!normalizedEventId) return;
    setSuppressedNostrEventIds((previous) => {
      if (previous.has(normalizedEventId)) return previous;
      const next = new Set(previous);
      next.add(normalizedEventId);
      return next;
    });
    queryClient.setQueriesData<CachedNostrEvent[]>(
      { queryKey: NOSTR_EVENTS_QUERY_KEY },
      (previous) => (previous || []).filter((event) => event.id !== normalizedEventId)
    );
    removeCachedNostrEventById(normalizedEventId);
  }, [queryClient]);

  useEffect(() => {
    if (suppressedNostrEventIds.size === 0) return;
    const blockedIds = new Set(suppressedNostrEventIds);
    queryClient.setQueriesData<CachedNostrEvent[]>(
      { queryKey: NOSTR_EVENTS_QUERY_KEY },
      (previous) => (previous || []).filter((event) => !blockedIds.has(event.id))
    );
    blockedIds.forEach((eventId) => removeCachedNostrEventById(eventId));
  }, [queryClient, suppressedNostrEventIds]);

  const handleNewTask = async (
    content: string,
    extractedTags: string[],
    relayIds: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    dateType: TaskDateType = "due",
    parentId?: string,
    initialStatus?: TaskStatus,
    explicitMentionPubkeys: string[] = [],
    priority?: number,
    attachments: PublishedAttachment[] = [],
    nip99?: Nip99Metadata,
    locationGeohash?: string
  ): Promise<TaskCreateResult> => {
    if (guardInteraction("post")) {
      return hasDisconnectedSelectedRelays
        ? { ok: false, reason: "relay-selection" }
        : { ok: false, reason: "not-authenticated" };
    }
    const normalizedMessageType = normalizeComposerMessageType(taskType);
    if (normalizedMessageType !== taskType) {
      console.warn("Unexpected taskType payload; defaulting to task", { taskType });
    }
    const normalizedTaskType: Task["taskType"] = normalizedMessageType === "task" ? "task" : "comment";
    const feedMessageType: Task["feedMessageType"] =
      normalizedMessageType === "offer" || normalizedMessageType === "request"
        ? normalizedMessageType
        : undefined;

    const requestedRelayIds = relayIds.length > 0
      ? relayIds
      : (demoFeedActive ? [DEMO_RELAY_ID] : []);
    const submissionParentId = feedMessageType ? undefined : parentId;
    const parentTask = submissionParentId ? allTasks.find((task) => task.id === submissionParentId) : undefined;
    const normalizedExtractedTags = Array.from(
      new Set(extractedTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
    );
    const { submissionTags: resolvedSubmissionTags } = resolveSubmissionTags(normalizedExtractedTags, parentTask);
    if (resolvedSubmissionTags.length === 0) {
      notifyNeedTag(t);
      return { ok: false, reason: "missing-tag" };
    }
    setPostedTags((prev) => Array.from(new Set([...prev, ...resolvedSubmissionTags])));
    resolvedSubmissionTags.forEach((tag) => bumpChannelFrecency(tag, 1.1));

    const resolvedRelaySelection = resolveRelaySelectionForSubmission({
      taskType: normalizedTaskType,
      selectedRelayIds: requestedRelayIds,
      relays,
      parentTask,
      demoRelayId: demoFeedActive ? DEMO_RELAY_ID : undefined,
    });
    if (resolvedRelaySelection.error) {
      toast.error(resolvedRelaySelection.error || t("toasts.errors.selectRelayOrParent"));
      nostrDevLog("routing", "Relay selection rejected for submission", {
        taskType: normalizedTaskType,
        requestedRelayIds,
        parentId: parentId || null,
        error: resolvedRelaySelection.error,
      });
      return { ok: false, reason: "relay-selection" };
    }
    const targetRelayIds = resolvedRelaySelection.relayIds;
    const hasNonDemoRelay = demoFeedActive
      ? targetRelayIds.some((id) => id !== DEMO_RELAY_ID)
      : targetRelayIds.length > 0;

    const selectedRelayUrls = resolveRelayUrlsFromIds(targetRelayIds);
    nostrDevLog("routing", "Resolved relay selection for submission", {
      taskType: normalizedTaskType,
      requestedRelayIds,
      targetRelayIds,
      selectedRelayUrls,
      hasNonDemoRelay,
      parentId: parentId || null,
    });
    
    const shouldPublish = hasNonDemoRelay && selectedRelayUrls.length > 0;
    const dedupedExplicitMentionPubkeys = Array.from(
      new Set(
        explicitMentionPubkeys
          .map((pubkey) => pubkey.trim().toLowerCase())
          .filter((pubkey) => /^[a-f0-9]{64}$/i.test(pubkey))
      )
    );
    const resolvedMentionPubkeys = await resolveMentionPubkeys(content);
    const mentionPubkeys = Array.from(
      new Set([...resolvedMentionPubkeys, ...dedupedExplicitMentionPubkeys])
    );
    const defaultAuthorAssignee =
      normalizedTaskType === "task" && /^[a-f0-9]{64}$/i.test(user.pubkey)
        ? user.pubkey.toLowerCase()
        : undefined;
    const assigneePubkeys = normalizedTaskType === "task"
      ? Array.from(
          new Set(
            mentionPubkeys.length > 0
              ? mentionPubkeys
              : [defaultAuthorAssignee].filter((value): value is string => Boolean(value))
          )
        )
      : [];
    const normalizedLocationGeohash = normalizeGeohash(locationGeohash);
    const contentDerivedAttachments = extractEmbeddableAttachmentsFromContent(content);
    const normalizedAttachments = normalizePublishedAttachments([
      ...attachments,
      ...contentDerivedAttachments,
    ]);
    
    const createdAt = new Date();
    const taskAuthor: Person = (() => {
      if (currentUser) return currentUser;
      if (user?.pubkey) {
        return {
          id: user.pubkey,
          name: (user.profile?.name || user.profile?.displayName || user.npub.slice(0, 8)).trim(),
          displayName: (user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`).trim(),
          nip05: user.profile?.nip05?.trim().toLowerCase(),
          avatar: user.profile?.picture,
          isOnline: true,
          onlineStatus: "online",
          isSelected: false,
        };
      }
      return people[0];
    })();
    const publishKind: NostrEventKind =
      normalizedMessageType === "task"
        ? NostrEventKind.Task
        : normalizedMessageType === "offer" || normalizedMessageType === "request"
          ? NostrEventKind.ClassifiedListing
          : NostrEventKind.TextNote;
    const validParentId = isNostrEventId(submissionParentId) ? submissionParentId : undefined;
    const primaryRelayUrl = selectedRelayUrls[0] ?? "";
    if (shouldPublish && normalizedTaskType === "task" && parentId && !validParentId) {
      toast.warning(t("toasts.warnings.parentLocalOnly"));
    }
    const publishTags = shouldPublish
      ? (
          normalizedTaskType === "task"
            ? buildTaskPublishTags(
                validParentId,
                primaryRelayUrl,
                assigneePubkeys,
                priority,
                resolvedSubmissionTags,
                normalizedAttachments,
                normalizedLocationGeohash
              )
            : feedMessageType
              ? buildNip99PublishTags({
                  metadata: nip99,
                  feedMessageType,
                  hashtags: resolvedSubmissionTags,
                  mentionPubkeys,
                  attachmentTags: normalizedAttachments
                    .map((attachment) => buildImetaTag(attachment))
                    .filter((tag) => tag.length > 0),
                  fallbackTitle: content.slice(0, 80),
                  statusOverride: (nip99?.status || "active") as Nip99ListingStatus,
                  locationGeohash: normalizedLocationGeohash,
                })
              : [
                  ...mentionPubkeys.map((pubkey) => ["p", pubkey] as string[]),
                  ...resolvedSubmissionTags.map((tag) => ["t", tag] as string[]),
                  ...normalizedAttachments
                    .map((attachment) => buildImetaTag(attachment))
                    .filter((tag) => tag.length > 0),
                  ...((normalizedLocationGeohash ? [["g", normalizedLocationGeohash]] : []) as string[][]),
                ]
        )
      : [];
    const publishParentId =
      shouldPublish && normalizedMessageType === "comment" && validParentId ? validParentId : undefined;

    const publishFailedDraft = (
      fallbackKind: NostrEventKind,
      fallbackTags: string[][],
      fallbackParentId?: string
    ): FailedPublishDraft => ({
      id: `failed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      author: taskAuthor,
      content,
      tags: resolvedSubmissionTags,
      relayIds: targetRelayIds,
      relayUrls: selectedRelayUrls,
      taskType: normalizedTaskType,
      createdAt: createdAt.toISOString(),
      dueDate: dueDate ? dueDate.toISOString() : undefined,
      dueTime,
      dateType,
      parentId: submissionParentId,
      initialStatus,
      mentionPubkeys,
      assigneePubkeys: normalizedTaskType === "task" ? assigneePubkeys : undefined,
      priority: normalizedTaskType === "task" ? priority : undefined,
      locationGeohash: normalizedLocationGeohash,
      attachments: normalizedAttachments.length > 0 ? normalizedAttachments : undefined,
      publishKind: fallbackKind,
      publishTags: fallbackTags,
      publishParentId: fallbackParentId,
    });

    const effectiveRelayIds = targetRelayIds.length > 0
      ? targetRelayIds
      : selectedRelayUrls.map((url) => getRelayIdFromUrl(url));
    const resolvePublishedRelayIds = (publishedRelayUrls?: string[]): string[] => {
      if (!publishedRelayUrls || publishedRelayUrls.length === 0) {
        return effectiveRelayIds.length > 0
          ? effectiveRelayIds
          : (demoFeedActive ? [DEMO_RELAY_ID] : []);
      }
      const ids = publishedRelayUrls.map((url) => getRelayIdFromUrl(url)).filter(Boolean);
      if (ids.length > 0) return ids;
      return effectiveRelayIds.length > 0
        ? effectiveRelayIds
        : (demoFeedActive ? [DEMO_RELAY_ID] : []);
    };
    const notifyIfPartialPublish = (publishedRelayUrls?: string[]) => {
      const normalizeUrl = (url: string) => url.replace(/\/+$/, "");
      const targetCount = new Set(selectedRelayUrls.map(normalizeUrl)).size;
      const publishedCount = new Set((publishedRelayUrls || []).map(normalizeUrl)).size;
      if (targetCount > 0 && publishedCount > 0 && publishedCount < targetCount) {
        notifyPartialPublish(t, { publishedCount, targetCount });
        nostrDevLog("publish", "Partial publish acknowledged by subset of target relays", {
          targetRelayUrls: selectedRelayUrls,
          publishedRelayUrls: publishedRelayUrls || [],
        });
      }
    };

    const baseTask: Omit<Task, "id"> = {
      author: taskAuthor,
      content,
      tags: resolvedSubmissionTags,
      relays: effectiveRelayIds.length > 0
        ? effectiveRelayIds
        : (demoFeedActive ? [DEMO_RELAY_ID] : []),
      taskType: normalizedTaskType,
      timestamp: createdAt,
      status: normalizedTaskType === "task" ? (initialStatus || "todo") : undefined,
      likes: 0,
      replies: 0,
      reposts: 0,
      dueDate,
      dueTime,
      dateType,
      parentId,
      mentions: Array.from(
        new Set([...extractAssignedMentionsFromContent(content), ...mentionPubkeys])
      ),
      assigneePubkeys: normalizedTaskType === "task" ? assigneePubkeys : undefined,
      priority: normalizedTaskType === "task" ? priority : undefined,
      feedMessageType,
      nip99: feedMessageType ? nip99 : undefined,
      locationGeohash: normalizedLocationGeohash,
      attachments: normalizedAttachments.length > 0 ? normalizedAttachments : undefined,
    };

    const parsedHashtagsFromContent = new Set(
      (content.match(/#(\w+)/g) || []).map((tag) => tag.slice(1).toLowerCase())
    );
    const explicitTagNamesForRestore = normalizedExtractedTags.filter((tag) => !parsedHashtagsFromContent.has(tag));
    const explicitMentionPubkeysForRestore = dedupedExplicitMentionPubkeys;
    const composeRestoreState: ComposeRestoreState = {
      content,
      taskType: normalizedTaskType,
      messageType: normalizedMessageType,
      dueDate,
      dueTime,
      dateType,
      explicitTagNames: explicitTagNamesForRestore,
      explicitMentionPubkeys: explicitMentionPubkeysForRestore,
      selectedRelays: targetRelayIds,
      priority,
      nip99,
      locationGeohash: normalizedLocationGeohash,
      attachments: normalizedAttachments,
    };

    if (!shouldPublish) {
      setLocalTasks((prev) => [{ ...baseTask, id: Date.now().toString() }, ...prev]);
      notifyLocalSaved(t, normalizedTaskType);
      return { ok: true, mode: "local" };
    }

    const publishWithMetadata = async () => {
      nostrDevLog("publish", "Submitting publish request", {
        kind: publishKind,
        parentId: publishParentId || null,
        relayUrls: selectedRelayUrls,
        tagCount: publishTags.length,
      });
      try {
        const result = await publishEvent(publishKind, content, publishTags, publishParentId, selectedRelayUrls);
        nostrDevLog("publish", "Publish request completed", {
          kind: publishKind,
          success: result.success,
          eventId: result.eventId || null,
          rejectionReason: result.rejectionReason || null,
          publishedRelayUrls: result.publishedRelayUrls || [],
          relayUrls: selectedRelayUrls,
        });
        return {
          success: result.success,
          eventId: result.eventId,
          rejectionReason: result.rejectionReason,
          publishedRelayUrls: result.publishedRelayUrls,
        };
      } catch (error) {
        console.error("Task publish failed unexpectedly", error);
        nostrDevLog("publish", "Publish request threw an exception", {
          kind: publishKind,
          relayUrls: selectedRelayUrls,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          eventId: undefined as string | undefined,
          rejectionReason: undefined as string | undefined,
          publishedRelayUrls: undefined as string[] | undefined,
        };
      }
    };

    const publishDelayEnabled = loadPublishDelayEnabled();
    if (publishDelayEnabled) {
      const pendingTaskId = `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const pendingUntil = new Date(Date.now() + PUBLISH_UNDO_DELAY_MS);
      setLocalTasks((prev) => [
        {
          ...baseTask,
          id: pendingTaskId,
          pendingPublishToken: pendingTaskId,
          pendingPublishUntil: pendingUntil,
        },
        ...prev,
      ]);
      setPendingPublishTaskIds((prev) => {
        const next = new Set(prev);
        next.add(pendingTaskId);
        return next;
      });

      const timeoutId = window.setTimeout(async () => {
        clearPendingPublishTask(pendingTaskId, { dismissToast: true });
        const publishResult = await publishWithMetadata();
        if (!publishResult.success) {
          suppressFailedPublishEvent(publishResult.eventId);
          const failedDraft = publishFailedDraft(publishKind, publishTags, publishParentId);
          setFailedPublishDrafts((prev) => [failedDraft, ...prev].slice(0, 50));
          setLocalTasks((prev) => prev.filter((task) => task.id !== pendingTaskId));
          notifyPublishSavedForRetry(t, {
            relayUrl: selectedRelayUrls.length === 1 ? selectedRelayUrls[0] : undefined,
            reason: publishResult.rejectionReason,
          });
          return;
        }

        if (publishResult.eventId && normalizedTaskType === "task" && initialStatus) {
          await publishTaskStateUpdate(
            publishResult.eventId,
            initialStatus,
            (publishResult.publishedRelayUrls && publishResult.publishedRelayUrls.length > 0
              ? publishResult.publishedRelayUrls
              : selectedRelayUrls
            ).slice(0, 1)
          );
        }
        if (publishResult.eventId && normalizedTaskType === "task" && dueDate) {
          await publishTaskDueUpdate(
            publishResult.eventId,
            content,
            dueDate,
            dueTime,
            dateType,
            (publishResult.publishedRelayUrls && publishResult.publishedRelayUrls.length > 0
              ? publishResult.publishedRelayUrls
              : selectedRelayUrls
            ).slice(0, 1)
          );
        }

        setLocalTasks((prev) =>
          prev.map((task) =>
            task.id === pendingTaskId
              ? {
                  ...task,
                  id: publishResult.eventId || task.id,
                  relays: resolvePublishedRelayIds(publishResult.publishedRelayUrls),
                  pendingPublishToken: undefined,
                  pendingPublishUntil: undefined,
                }
              : task
          )
        );
        notifyIfPartialPublish(publishResult.publishedRelayUrls);
        notifyPublished(t, normalizedTaskType);
      }, PUBLISH_UNDO_DELAY_MS);

      const toastId = toast(t("toasts.info.pendingPublish", { seconds: Math.floor(PUBLISH_UNDO_DELAY_MS / 1000) }), {
        duration: PUBLISH_UNDO_DELAY_MS,
        action: {
          label: t("toasts.actions.undo"),
          onClick: () => handleUndoPendingPublish(pendingTaskId),
        },
      });

      pendingPublishStateRef.current.set(pendingTaskId, { timeoutId, toastId, composeState: composeRestoreState });
      nostrDevLog("publish", "Queued publish with undo delay", {
        pendingTaskId,
        delayMs: PUBLISH_UNDO_DELAY_MS,
        relayUrls: selectedRelayUrls,
      });
      return { ok: true, mode: "published" };
    }

    const publishResult = await publishWithMetadata();
    if (!publishResult.success) {
      suppressFailedPublishEvent(publishResult.eventId);
      const failedDraft = publishFailedDraft(publishKind, publishTags, publishParentId);
      setFailedPublishDrafts((prev) => [failedDraft, ...prev].slice(0, 50));
      notifyPublishSavedForRetry(t, {
        relayUrl: selectedRelayUrls.length === 1 ? selectedRelayUrls[0] : undefined,
        reason: publishResult.rejectionReason,
      });
      return { ok: true, mode: "queued" };
    }

    if (publishResult.eventId && normalizedTaskType === "task" && initialStatus) {
      await publishTaskStateUpdate(
        publishResult.eventId,
        initialStatus,
        (publishResult.publishedRelayUrls && publishResult.publishedRelayUrls.length > 0
          ? publishResult.publishedRelayUrls
          : selectedRelayUrls
        ).slice(0, 1)
      );
    }
    if (publishResult.eventId && normalizedTaskType === "task" && dueDate) {
      await publishTaskDueUpdate(
        publishResult.eventId,
        content,
        dueDate,
        dueTime,
        dateType,
        (publishResult.publishedRelayUrls && publishResult.publishedRelayUrls.length > 0
          ? publishResult.publishedRelayUrls
          : selectedRelayUrls
        ).slice(0, 1)
      );
    }

    setLocalTasks((prev) => [
      {
        ...baseTask,
        id: publishResult.eventId || Date.now().toString(),
        relays: resolvePublishedRelayIds(publishResult.publishedRelayUrls),
      },
      ...prev,
    ]);
    notifyIfPartialPublish(publishResult.publishedRelayUrls);
    notifyPublished(t, normalizedTaskType);
    return { ok: true, mode: "published" };
  };

  const parseStoredDate = useCallback((value?: string): Date | undefined => {
    if (!value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, []);

  const publishFailedDraft = useCallback(async (
    draftId: string,
    resolveRelayUrls: (draft: FailedPublishDraft) => string[]
  ) => {
    if (guardInteraction("modify")) {
      return;
    }
    const draft = failedPublishDrafts.find((item) => item.id === draftId);
    if (!draft) return;

    const relayUrls = resolveRelayUrls(draft);
    if (relayUrls.length === 0) {
      toast.error(t("toasts.errors.retryRelayMissing"));
      return;
    }

    const result = await publishEvent(
      draft.publishKind,
      draft.content,
      draft.publishTags,
      draft.publishParentId,
      relayUrls
    );
    if (!result.success) {
      if (result.eventId) {
        nostrDevLog("publish", "Suppressing retry-failed event from cache and feed", {
          draftId,
          eventId: result.eventId,
        });
      }
      suppressFailedPublishEvent(result.eventId);
      if (result.rejectionReason) {
        toast.error(t("toasts.errors.retryRejectedByRelayWithReason", { reason: result.rejectionReason }));
      } else {
        toast.error(t("toasts.errors.retryRejectedByRelay"));
      }
      return;
    }

    const publishedEventId = result.eventId;
    const normalizeUrl = (url: string) => url.replace(/\/+$/, "");
    const targetCount = new Set(relayUrls.map(normalizeUrl)).size;
    const publishedCount = new Set((result.publishedRelayUrls || []).map(normalizeUrl)).size;
    if (targetCount > 0 && publishedCount > 0 && publishedCount < targetCount) {
      notifyPartialPublish(t, { publishedCount, targetCount });
      nostrDevLog("publish", "Partial publish acknowledged by subset of retry relay targets", {
        draftId,
        relayUrls,
        publishedRelayUrls: result.publishedRelayUrls || [],
      });
    }
    const effectiveRelayIds = (result.publishedRelayUrls && result.publishedRelayUrls.length > 0
      ? result.publishedRelayUrls
      : relayUrls
    ).map((url) => getRelayIdFromUrl(url));
    const dueDate = parseStoredDate(draft.dueDate);
    const restoredTask: Task = {
      id: publishedEventId || Date.now().toString(),
      author: draft.author,
      content: draft.content,
      tags: draft.tags,
      relays: effectiveRelayIds.length > 0
        ? effectiveRelayIds
        : (demoFeedActive ? [DEMO_RELAY_ID] : []),
      taskType: draft.taskType,
      timestamp: parseStoredDate(draft.createdAt) || new Date(),
      status: draft.taskType === "task" ? (draft.initialStatus || "todo") : undefined,
      likes: 0,
      replies: 0,
      reposts: 0,
      dueDate,
      dueTime: draft.dueTime,
      dateType: draft.dateType,
      parentId: draft.parentId,
      mentions: draft.mentionPubkeys,
      assigneePubkeys: draft.taskType === "task" ? draft.assigneePubkeys : undefined,
      priority: draft.taskType === "task" ? draft.priority : undefined,
      locationGeohash: draft.locationGeohash,
      attachments: draft.attachments,
    };
    setLocalTasks((prev) => [restoredTask, ...prev]);
    setFailedPublishDrafts((prev) => prev.filter((item) => item.id !== draftId));

    if (publishedEventId && draft.taskType === "task" && draft.initialStatus) {
      await publishTaskStateUpdate(
        publishedEventId,
        draft.initialStatus,
        (result.publishedRelayUrls && result.publishedRelayUrls.length > 0
          ? result.publishedRelayUrls
          : relayUrls
        ).slice(0, 1)
      );
    }
    if (publishedEventId && draft.taskType === "task" && dueDate) {
      await publishTaskDueUpdate(
        publishedEventId,
        draft.content,
        dueDate,
        draft.dueTime,
        draft.dateType || "due",
        (result.publishedRelayUrls && result.publishedRelayUrls.length > 0
          ? result.publishedRelayUrls
          : relayUrls
        ).slice(0, 1)
      );
    }

    notifyPublished(t, draft.taskType);
  }, [
    failedPublishDrafts,
    guardInteraction,
    parseStoredDate,
    publishEvent,
    publishTaskDueUpdate,
    publishTaskStateUpdate,
    suppressFailedPublishEvent,
    t,
  ]);

  const handleRetryFailedPublish = useCallback(async (draftId: string) => {
    await publishFailedDraft(draftId, (draft) =>
      draft.relayUrls.length > 0
        ? draft.relayUrls
        : resolveRelayUrlsFromIds(draft.relayIds)
    );
  }, [publishFailedDraft, resolveRelayUrlsFromIds]);

  const handleRepostFailedPublish = useCallback(async (draftId: string) => {
    await publishFailedDraft(draftId, () => resolveRelayUrlsFromIds(Array.from(effectiveActiveRelayIds)));
  }, [effectiveActiveRelayIds, publishFailedDraft, resolveRelayUrlsFromIds]);

  const handleDismissFailedPublish = useCallback((draftId: string) => {
    setFailedPublishDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
  }, []);

  const handleDismissAllFailedPublish = useCallback(() => {
    setFailedPublishDrafts([]);
  }, []);

  const handleDueDateChange = useCallback((
    taskId: string,
    dueDate: Date | undefined,
    dueTime?: string,
    dateType: TaskDateType = "due"
  ) => {
    if (guardInteraction("modify")) {
      return;
    }
    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask || existingTask.taskType !== "task" || !dueDate) return;
    setLocalTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, dueDate, dueTime, dateType, lastEditedAt: new Date() }
          : task
      )
    );
    void publishTaskDueUpdate(taskId, existingTask.content, dueDate, dueTime, dateType);
  }, [allTasks, guardInteraction, publishTaskDueUpdate]);

  const handlePriorityChange = useCallback((taskId: string, priority: number) => {
    if (guardInteraction("modify")) {
      return;
    }
    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask || existingTask.taskType !== "task") return;
    setLocalTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, priority, lastEditedAt: new Date() }
          : task
      )
    );
    void publishTaskPriorityUpdate(taskId, priority);
  }, [allTasks, guardInteraction, publishTaskPriorityUpdate]);

  // Build relays with active state for sidebar display
  const relaysWithActiveState: Relay[] = useMemo(() => {
    return relays.map((r) => ({
      ...r,
      isActive: effectiveActiveRelayIds.has(r.id),
    }));
  }, [relays, effectiveActiveRelayIds]);

  const visibleFailedPublishDrafts = useMemo(() => {
    return failedPublishDrafts.filter((draft) => {
      const targetRelayIds = draft.relayIds.length > 0
        ? draft.relayIds
        : draft.relayUrls.map((url) => getRelayIdFromUrl(url));
      if (targetRelayIds.length === 0) return true;
      return targetRelayIds.some((relayId) => effectiveActiveRelayIds.has(relayId));
    });
  }, [effectiveActiveRelayIds, failedPublishDrafts]);

  const selectedPublishableRelayIds = useMemo(
    () =>
      relays
        .filter((relay) => effectiveActiveRelayIds.has(relay.id) && Boolean(relay.url))
        .map((relay) => relay.id),
    [effectiveActiveRelayIds, relays]
  );

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
