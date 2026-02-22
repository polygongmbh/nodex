import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar, SidebarHeader } from "@/components/layout/Sidebar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { KanbanView } from "@/components/tasks/KanbanView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { ListView } from "@/components/tasks/ListView";
import { FailedPublishQueueBanner } from "@/components/tasks/FailedPublishQueueBanner";
import { DesktopSearchDock, type KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import { ViewSwitcher, ViewType } from "@/components/tasks/ViewSwitcher";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useSwipeNavigation } from "@/hooks/use-swipe-navigation";
import { useNostrEventCache } from "@/hooks/use-nostr-event-cache";
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useNDK } from "@/lib/nostr/ndk-context";
import { NostrAuthModal, NostrUserMenu } from "@/components/auth/NostrAuthModal";
import { ThemeModeToggle } from "@/components/theme/ThemeModeToggle";
import { LanguageToggle } from "@/components/theme/LanguageToggle";
import { CompletionFeedbackToggle } from "@/components/theme/CompletionFeedbackToggle";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import { VersionHint } from "@/components/layout/VersionHint";
import { getOnboardingSections } from "@/components/onboarding/onboarding-sections";
import { getOnboardingStepsBySection } from "@/components/onboarding/onboarding-steps";
import { OnboardingInitialSection, OnboardingSectionId } from "@/components/onboarding/onboarding-types";
import { nostrEventsToTasks, getRelayIdFromUrl, getRelayNameFromUrl, isSpamContent } from "@/lib/nostr/event-converter";
import { deriveChannels } from "@/lib/channels";
import {
  loadPersistedChannelMatchMode,
  loadPersistedChannelFilters,
  savePersistedChannelMatchMode,
  savePersistedChannelFilters,
} from "@/lib/filter-preferences";
import { loadSavedFilterState, saveSavedFilterState } from "@/lib/saved-filter-configurations";
import { applyTaskStatusUpdate, cycleTaskStatus } from "@/lib/task-status";
import { resolveCurrentUser } from "@/lib/current-user";
import { canUserChangeTaskStatus, extractAssignedMentionsFromContent } from "@/lib/task-permissions";
import { isNostrEventId } from "@/lib/nostr/event-id";
import { NostrEventKind } from "@/lib/nostr/types";
import { isTaskStateEventKind, mapTaskStatusToStateEvent } from "@/lib/nostr/task-state-events";
import { buildLinkedTaskCalendarEvent } from "@/lib/nostr/task-calendar-events";
import { buildTaskPriorityUpdateEvent, isPriorityPropertyEvent } from "@/lib/nostr/task-property-events";
import { buildTaskPublishTags } from "@/lib/nostr/task-publish-tags";
import {
  resolveOriginRelayIdForTask,
  resolveRelaySelectionForSubmission,
} from "@/lib/task-relay-routing";
import {
  derivePeopleFromKind0Events,
  loadCachedKind0Events,
  loadLoggedInIdentityPriority,
  mergeKind0EventsWithCache,
  rememberCachedKind0Profile,
  rememberLoggedInIdentity,
  saveCachedKind0Events,
} from "@/lib/people-from-kind0";
import {
  loadFailedPublishDrafts,
  saveFailedPublishDrafts,
  type FailedPublishDraft,
} from "@/lib/failed-publish-drafts";
import { loadOnboardingState, markOnboardingCompleted } from "@/lib/onboarding-state";
import { shouldAutoStartOnboarding } from "@/lib/onboarding-autostart";
import { filterTasks } from "@/lib/task-filtering";
import { deriveSidebarPeople } from "@/lib/sidebar-people";
import { loadPresencePublishingEnabled } from "@/lib/presence-preferences";
import { loadPublishDelayEnabled } from "@/lib/publish-delay-preferences";
import {
  loadCompletionSoundEnabled,
  saveCompletionSoundEnabled,
} from "@/lib/completion-feedback-preferences";
import { playCompletionPopSound } from "@/lib/completion-feedback";
import {
  NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS,
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildActivePresenceContent,
  buildOfflinePresenceContent,
  buildPresenceTags,
  deriveLatestActivePresenceByAuthor,
} from "@/lib/presence-status";
import { getOnboardingBehaviorGateId, shouldForceComposeForGuide } from "@/lib/onboarding-guide";
import {
  isFilterResetStep,
  isNavigationFocusStep,
  shouldForceFeedAndResetFiltersOnStep,
} from "@/lib/onboarding-step-rules";
import { getPreferredMentionIdentifier, resolveMentionedPubkeys } from "@/lib/mentions";
import {
  mapPeopleSelection,
  shouldToggleOffExclusiveChannel,
  shouldToggleOffExclusivePerson,
  setAllChannelFilters,
  setExclusiveChannelFilter,
} from "@/lib/filter-state-utils";
import { areFilterSnapshotsEqual, buildFilterSnapshot, type FilterSnapshot } from "@/lib/filter-snapshot";
import { normalizeTaskType } from "@/lib/task-type";
import { getConfiguredDefaultRelayIds } from "@/lib/default-relays";
import { useRelayFilterState } from "@/hooks/use-relay-filter-state";
import {
  notifyDisconnectedSelectedFeeds,
  notifyLocalSaved,
  notifyNeedSigninModify,
  notifyNeedSigninPost,
  notifyNeedTag,
  notifyPublished,
  notifyPublishSavedForRetry,
  notifyStatusRestricted,
} from "@/lib/notifications";
import { mockTasks, mockRelays as demoRelays } from "@/data/mockData";
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
  SavedFilterController,
  SavedFilterConfiguration,
  SavedFilterState,
} from "@/types";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const validViews: ViewType[] = ["tree", "feed", "kanban", "list", "calendar"];
const MOBILE_MANAGE_ROUTE = "manage";

// Default Nostr relays - these are managed by NDKProvider in App.tsx

// Demo relay constant
const DEMO_RELAY_ID = "demo";
const ENABLE_MOBILE_GUIDE_SECTION_PICKER = false;
const TASK_STATUS_REORDER_DELAY_MS = 260;
const PUBLISH_UNDO_DELAY_MS = 5000;

const Index = () => {
  const { t } = useTranslation();
  const { view: urlView, taskId: urlTaskId } = useParams<{ view: string; taskId: string }>();
  const navigate = useNavigate();
  const isManageRouteActive = urlView === MOBILE_MANAGE_ROUTE;

  // Derive current view from URL
  const currentView: ViewType = validViews.includes(urlView as ViewType) 
    ? (urlView as ViewType) 
    : "tree";

  // NDK Nostr integration
  const { 
    relays: ndkRelays, 
    isConnected: isNostrConnected,
    addRelay,
    removeRelay,
    subscribe,
    publishEvent,
    user,
  } = useNDK();

  // Auth modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

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
      NostrEventKind.CalendarDateBased,
      NostrEventKind.CalendarTimeBased,
      NostrEventKind.UserStatus,
    ],
    []
  );
  const nostrEvents = useNostrEventCache({
    isConnected: isNostrConnected,
    subscribedKinds,
    subscribe,
  });

  // Convert relay statuses to app Relay format - combine demo relay with nostr relays
  const relays: Relay[] = useMemo(() => {
    const nostrRelayItems = ndkRelays.map((r) => ({
      id: getRelayIdFromUrl(r.url),
      name: getRelayNameFromUrl(r.url),
      icon: "radio",
      isActive: r.status === "connected",
      connectionStatus: r.status,
      url: r.url,
      postCount: undefined,
    }));
    
    // Include demo relay
    return [...demoRelays, ...nostrRelayItems];
  }, [ndkRelays]);

  // Convert NDK relays to the format expected by sidebar/widgets
  const nostrRelays = useMemo(() => {
    return ndkRelays.map(r => ({
      url: r.url,
      status: r.status,
      latency: r.latency,
    }));
  }, [ndkRelays]);

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
    defaultRelayIds: getConfiguredDefaultRelayIds(),
  });
  const [people, setPeople] = useState<Person[]>([]);
  const [cachedKind0Events, setCachedKind0Events] = useState(() => loadCachedKind0Events());
  const [loggedInIdentityPriority, setLoggedInIdentityPriority] = useState(() => loadLoggedInIdentityPriority());
  const [localTasks, setLocalTasks] = useState<Task[]>(mockTasks);
  const [postedTags, setPostedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [completionSoundEnabled, setCompletionSoundEnabled] = useState(() => loadCompletionSoundEnabled());
  const [isSidebarFocused, setIsSidebarFocused] = useState(false);
  const [mentionRequest, setMentionRequest] = useState<{ mention: string; id: number } | null>(null);
  const pendingStatusUpdateTimeoutsRef = useRef<Map<string, number>>(new Map());
  const completionConfettiLastAtRef = useRef<Map<string, number>>(new Map());
  const pendingTaskStatusesRef = useRef<Map<string, TaskStatus>>(new Map());
  const pendingPublishStateRef = useRef<Map<string, { timeoutId: number; toastId: string | number; composeState: ComposeRestoreState }>>(new Map());
  const [pendingPublishTaskIds, setPendingPublishTaskIds] = useState<Set<string>>(new Set());
  const [composeRestoreRequest, setComposeRestoreRequest] = useState<ComposeRestoreRequest | null>(null);
  const [sortStatusHoldByTaskId, setSortStatusHoldByTaskId] = useState<Record<string, TaskStatus>>({});
  const [sortModifiedAtHoldByTaskId, setSortModifiedAtHoldByTaskId] = useState<Record<string, string>>({});

  // Filter nostr events - only keep those with tags and not spam
  const filteredNostrEvents = useMemo(() => {
    return nostrEvents.filter(event => {
      if (event.kind === NostrEventKind.Metadata) return false;
      if (isTaskStateEventKind(event.kind)) return true;
      if (isPriorityPropertyEvent(event.kind, event.tags)) return true;
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
  }, [nostrEvents]);

  const liveKind0Events = useMemo(
    () =>
      nostrEvents
        .filter((event) => event.kind === NostrEventKind.Metadata)
        .map((event) => ({
          kind: event.kind,
          pubkey: event.pubkey,
          created_at: event.created_at,
          content: event.content || "",
        })),
    [nostrEvents]
  );

  const mergedKind0Events = useMemo(
    () => mergeKind0EventsWithCache(liveKind0Events, cachedKind0Events),
    [cachedKind0Events, liveKind0Events]
  );
  const supplementalLatestActivityByAuthor = useMemo(() => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const latestActivePresenceByAuthor = deriveLatestActivePresenceByAuthor(
      nostrEvents.filter((event) => event.kind === NostrEventKind.UserStatus),
      nowUnix
    );
    const latestByAuthor = new Map<string, number>();

    for (const event of nostrEvents) {
      if (event.kind === NostrEventKind.Metadata || event.kind === NostrEventKind.UserStatus) continue;

      const authorId = event.pubkey?.trim().toLowerCase();
      if (!authorId) continue;

      const timestampMs = (event.created_at || 0) * 1000;
      const previous = latestByAuthor.get(authorId) ?? Number.NEGATIVE_INFINITY;
      if (timestampMs > previous) {
        latestByAuthor.set(authorId, timestampMs);
      }
    }

    for (const [authorId, presenceTimestampMs] of latestActivePresenceByAuthor.entries()) {
      const previous = latestByAuthor.get(authorId) ?? Number.NEGATIVE_INFINITY;
      if (presenceTimestampMs > previous) {
        latestByAuthor.set(authorId, presenceTimestampMs);
      }
    }

    return latestByAuthor;
  }, [nostrEvents]);

  useEffect(() => {
    const merged = mergeKind0EventsWithCache(liveKind0Events, loadCachedKind0Events());
    saveCachedKind0Events(merged);
    setCachedKind0Events(merged);
  }, [liveKind0Events]);

  useEffect(() => {
    if (!user?.pubkey) return;
    setLoggedInIdentityPriority(rememberLoggedInIdentity(user.pubkey));
  }, [user?.pubkey]);

  const profileCachePayload = useMemo(() => {
    if (!user?.pubkey || !user?.profile) return null;
    return {
      pubkey: user.pubkey,
      profile: {
        name: user.profile.name,
        displayName: user.profile.displayName,
        about: user.profile.about,
        picture: user.profile.picture,
        nip05: user.profile.nip05,
      },
    };
  }, [
    user?.profile,
    user?.pubkey,
  ]);

  useEffect(() => {
    if (!profileCachePayload) return;
    const nextCached = rememberCachedKind0Profile(profileCachePayload.pubkey, {
      name: profileCachePayload.profile.name,
      displayName: profileCachePayload.profile.displayName,
      about: profileCachePayload.profile.about,
      picture: profileCachePayload.profile.picture,
      nip05: profileCachePayload.profile.nip05,
    });
    setCachedKind0Events(nextCached);
  }, [profileCachePayload]);

  useEffect(() => {
    const priorityLookup = new Map(
      loggedInIdentityPriority.map((pubkey, index) => [pubkey.toLowerCase(), index] as const)
    );
    const sortPeopleByPriority = (value: Person[]): Person[] =>
      [...value].sort((a, b) => {
        const aPriority = priorityLookup.get(a.id.toLowerCase());
        const bPriority = priorityLookup.get(b.id.toLowerCase());
        if (aPriority !== undefined && bPriority !== undefined) return aPriority - bPriority;
        if (aPriority !== undefined) return -1;
        if (bPriority !== undefined) return 1;
        return a.displayName.localeCompare(b.displayName);
      });

    setPeople((prev) => {
      let next = derivePeopleFromKind0Events(mergedKind0Events, prev, {
        prioritizedPubkeys: loggedInIdentityPriority,
      });

      if (user?.pubkey && !next.some((person) => person.id === user.pubkey)) {
        next = [
          ...next,
          {
            id: user.pubkey,
            name: (user.profile?.name || user.profile?.displayName || user.npub.slice(0, 8)).trim(),
            displayName: (user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`).trim(),
            nip05: user.profile?.nip05?.trim().toLowerCase(),
            avatar: user.profile?.picture,
            isOnline: true,
            onlineStatus: "online",
            isSelected: prev.find((person) => person.id === user.pubkey)?.isSelected || false,
          },
        ];
      }

      return sortPeopleByPriority(next);
    });
  }, [loggedInIdentityPriority, mergedKind0Events, user]);

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
      }))
    );
  }, [filteredNostrEvents]);

  // Combine local tasks with Nostr tasks
  const allTasks = useMemo(() => {
    const combined = [...localTasks, ...nostrTasks];
    // Remove duplicates by id
    const seen = new Set<string>();
    return combined.filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    }).map((task) => {
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

  // Sidebar channels: most-used tags plus user-posted tags.
  const channels: Channel[] = useMemo(() => {
    return deriveChannels(localTasks, filteredNostrEvents, postedTags, 6);
  }, [localTasks, filteredNostrEvents, postedTags]);

  // Compose autocomplete channels: all known tags.
  const composeChannels: Channel[] = useMemo(() => {
    return deriveChannels(localTasks, filteredNostrEvents, postedTags, 1);
  }, [localTasks, filteredNostrEvents, postedTags]);

  // Maintain channel filter states across dynamic updates
  const [channelFilterStates, setChannelFilterStates] = useState<Map<string, Channel["filterState"]>>(
    () => loadPersistedChannelFilters()
  );
  const [channelMatchMode, setChannelMatchMode] = useState<ChannelMatchMode>(
    () => loadPersistedChannelMatchMode()
  );
  const [savedFilterState, setSavedFilterState] = useState<SavedFilterState>(() => loadSavedFilterState());

  // Merge dynamic channels with persisted filter states
  const channelsWithState: Channel[] = useMemo(() => {
    return channels.map((channel) => ({
      ...channel,
      filterState: channelFilterStates.get(channel.id) || "neutral",
    }));
  }, [channels, channelFilterStates]);

  const composeChannelsWithState: Channel[] = useMemo(() => {
    return composeChannels.map((channel) => ({
      ...channel,
      filterState: channelFilterStates.get(channel.id) || "neutral",
    }));
  }, [composeChannels, channelFilterStates]);

  useEffect(() => {
    saveFailedPublishDrafts(failedPublishDrafts);
  }, [failedPublishDrafts]);

  useEffect(() => {
    savePersistedChannelFilters(channelFilterStates);
  }, [channelFilterStates]);

  useEffect(() => {
    savePersistedChannelMatchMode(channelMatchMode);
  }, [channelMatchMode]);

  useEffect(() => {
    saveSavedFilterState(savedFilterState);
  }, [savedFilterState]);

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
    setIsOnboardingOpen(false);
    setIsAuthModalOpen(true);
  }, []);

  const handleCloseGuide = useCallback(() => {
    setIsOnboardingOpen(false);
    setActiveOnboardingSection(null);
  }, []);

  const handleCompleteGuide = useCallback((lastStep: number) => {
    markOnboardingCompleted(lastStep);
  }, []);

  // Derive focused task from URL
  const focusedTaskId = urlTaskId || null;
  const openedWithFocusedTaskRef = useRef(Boolean(urlTaskId));

  const isMobile = useIsMobile();
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
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingInitialSection, setOnboardingInitialSection] = useState<OnboardingInitialSection>(null);
  const [onboardingManualStart, setOnboardingManualStart] = useState(false);
  const [activeOnboardingSection, setActiveOnboardingSection] = useState<OnboardingSectionId | null>(null);
  const [activeOnboardingStepId, setActiveOnboardingStepId] = useState<string | null>(null);
  const [composeGuideActivationSignal, setComposeGuideActivationSignal] = useState(0);
  const [kanbanDepthMode, setKanbanDepthMode] = useState<KanbanDepthMode>("leaves");
  const onboardingSections = useMemo(
    () => getOnboardingSections(isMobile, currentView, t),
    [currentView, isMobile, t]
  );
  const onboardingStepsBySection = useMemo(
    () => getOnboardingStepsBySection(isMobile, currentView, t),
    [currentView, isMobile, t]
  );

  const handleOpenGuide = useCallback(() => {
    const initialSectionForOpen: OnboardingInitialSection =
      isMobile && !ENABLE_MOBILE_GUIDE_SECTION_PICKER ? "all" : null;
    setOnboardingManualStart(true);
    setOnboardingInitialSection(initialSectionForOpen);
    setActiveOnboardingSection(null);
    setIsOnboardingOpen(true);
  }, [isMobile]);

  useEffect(() => {
    const onboardingState = loadOnboardingState();
    if (shouldAutoStartOnboarding({
      onboardingCompleted: onboardingState.completed,
      openedWithFocusedTask: openedWithFocusedTaskRef.current,
    })) {
      setOnboardingManualStart(false);
      setOnboardingInitialSection("all");
      setIsOnboardingOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isOnboardingOpen) {
      lastHandledOnboardingStepRef.current = null;
      setActiveOnboardingStepId(null);
    }
  }, [isOnboardingOpen]);

  // Handle view change - update URL
  const setCurrentView = useCallback((newView: ViewType) => {
    if (focusedTaskId) {
      navigate(`/${newView}/${focusedTaskId}`);
    } else {
      navigate(`/${newView}`);
    }
  }, [navigate, focusedTaskId]);

  const setManageRouteActive = useCallback((isActive: boolean) => {
    if (isActive) {
      navigate(`/${MOBILE_MANAGE_ROUTE}`);
      return;
    }
    if (focusedTaskId) {
      navigate(`/${currentView}/${focusedTaskId}`);
      return;
    }
    navigate(`/${currentView}`);
  }, [currentView, focusedTaskId, navigate]);

  const handleDesktopSwipeLeft = useCallback(() => {
    const currentIndex = validViews.indexOf(currentView);
    if (currentIndex < validViews.length - 1) {
      setCurrentView(validViews[currentIndex + 1]);
    }
  }, [currentView, setCurrentView]);

  const handleDesktopSwipeRight = useCallback(() => {
    const currentIndex = validViews.indexOf(currentView);
    if (currentIndex > 0) {
      setCurrentView(validViews[currentIndex - 1]);
    }
  }, [currentView, setCurrentView]);

  const desktopSwipeHandlers = useSwipeNavigation({
    onSwipeLeft: handleDesktopSwipeLeft,
    onSwipeRight: handleDesktopSwipeRight,
    threshold: 55,
    enableHaptics: false,
    enableWheelSwipe: !isMobile,
  });

  // Desktop keyboard shortcuts (disabled on mobile)
  useKeyboardShortcuts({
    onViewChange: setCurrentView,
    enabled: !isMobile,
  });

  // Handle task focus - update URL
  const setFocusedTaskId = useCallback((taskId: string | null) => {
    if (taskId) {
      navigate(`/${currentView}/${taskId}`);
    } else {
      navigate(`/${currentView}`);
    }
  }, [navigate, currentView]);

  const lastHandledOnboardingStepRef = useRef<string | null>(null);
  const handleOnboardingStepChange = useCallback((payload: {
    id: string;
    stepNumber: number;
  }) => {
    setActiveOnboardingStepId(payload.id);

    const stepKey = getOnboardingBehaviorGateId(payload.id);
    if (lastHandledOnboardingStepRef.current === stepKey) return;
    lastHandledOnboardingStepRef.current = stepKey;

    if (shouldForceFeedAndResetFiltersOnStep(payload.id, isMobile)) {
      setCurrentView("feed");
      setFocusedTaskId(null);
      setSearchQuery("");
      setActiveRelayIds(new Set(relays.map((relay) => relay.id)));
      setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
      setPeople((prev) => mapPeopleSelection(prev, () => false));
      return;
    }

    if (isNavigationFocusStep(payload.id)) {
      setCurrentView("feed");
      return;
    }
    if (!isFilterResetStep(payload.id)) return;

    setFocusedTaskId(null);
    setSearchQuery("");
    setActiveRelayIds(new Set(relays.map((relay) => relay.id)));
    setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
    setPeople((prev) => mapPeopleSelection(prev, () => false));
  }, [channels, isMobile, relays, setActiveRelayIds, setCurrentView, setFocusedTaskId]);

  const forceShowComposeForGuide = shouldForceComposeForGuide({
    isOnboardingOpen,
    activeOnboardingStepId,
    isMobile,
    currentView,
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

  const activeSavedConfiguration = useMemo(
    () =>
      savedFilterState.configurations.find(
        (configuration) => configuration.id === savedFilterState.activeConfigurationId
      ) || null,
    [savedFilterState.activeConfigurationId, savedFilterState.configurations]
  );

  const createSnapshotFromConfiguration = useCallback(
    (configuration: SavedFilterConfiguration): FilterSnapshot => ({
      relayIds: [...configuration.relayIds].sort(),
      channelStates: configuration.channelStates,
      selectedPeopleIds: [...configuration.selectedPeopleIds].sort(),
      channelMatchMode: configuration.channelMatchMode,
    }),
    []
  );

  useEffect(() => {
    if (!activeSavedConfiguration) return;
    const activeSnapshot = createSnapshotFromConfiguration(activeSavedConfiguration);
    if (areFilterSnapshotsEqual(activeSnapshot, currentFilterSnapshot)) return;
    setSavedFilterState((previous) => {
      if (!previous.activeConfigurationId) return previous;
      return {
        ...previous,
        activeConfigurationId: null,
      };
    });
  }, [activeSavedConfiguration, createSnapshotFromConfiguration, currentFilterSnapshot]);

  const handleOnboardingActiveSectionChange = useCallback((section: OnboardingSectionId | null) => {
    setActiveOnboardingSection(section);
    const isDedicatedViewGuide = !isMobile && (currentView === "kanban" || currentView === "calendar");
    if (section === "compose" && !isDedicatedViewGuide) {
      setComposeGuideActivationSignal((previous) => previous + 1);
    }
    if (!isMobile && section === "compose" && !isDedicatedViewGuide && currentView !== "feed") {
      setCurrentView("feed");
    }
  }, [currentView, isMobile, setCurrentView]);

  const handleChannelToggle = (id: string) => {
    setChannelFilterStates((prev) => {
      const newMap = new Map(prev);
      const currentState = newMap.get(id) || "neutral";
      const states: Channel["filterState"][] = ["neutral", "included", "excluded"];
      const currentIndex = states.indexOf(currentState);
      const nextState = states[(currentIndex + 1) % states.length];
      newMap.set(id, nextState);
      return newMap;
    });
  };

  const handleChannelExclusive = (id: string) => {
    const shouldToggleOff = shouldToggleOffExclusiveChannel(channels, channelFilterStates, id);
    if (shouldToggleOff) {
      setChannelFilterStates((prev) => {
        const next = new Map(prev);
        next.set(id, "neutral");
        return next;
      });
      return;
    }
    setChannelFilterStates(() => setExclusiveChannelFilter(channels, id));
    const channel = channelsWithState.find((c) => c.id === id);
    toast.success(t("toasts.success.showingOnlyChannel", { channelName: channel?.name || id }));
  };

  const handleToggleAllChannels = () => {
    const allNeutral = Array.from(channelFilterStates.values()).every((s) => s === "neutral") || channelFilterStates.size === 0;
    setChannelFilterStates(() => setAllChannelFilters(channels, allNeutral ? "included" : "neutral"));
    toast.success(allNeutral ? t("toasts.success.allChannelsIncluded") : t("toasts.success.allChannelsReset"));
  };

  const handleChannelMatchModeChange = (mode: ChannelMatchMode) => {
    setChannelMatchMode(mode);
  };

  const resetFiltersToDefault = useCallback(() => {
    setActiveRelayIds(new Set(relays.map((relay) => relay.id)));
    setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
    setChannelMatchMode("and");
    setPeople((prev) => mapPeopleSelection(prev, () => false));
  }, [channels, relays, setActiveRelayIds]);

  const handleSaveCurrentFilterConfiguration = useCallback((name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;
    const nowIso = new Date().toISOString();
    const configurationId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `saved-filter-${Date.now()}`;
    const configuration: SavedFilterConfiguration = {
      id: configurationId,
      name: normalizedName,
      relayIds: currentFilterSnapshot.relayIds,
      channelStates: currentFilterSnapshot.channelStates,
      selectedPeopleIds: currentFilterSnapshot.selectedPeopleIds,
      channelMatchMode: currentFilterSnapshot.channelMatchMode,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setSavedFilterState((previous) => ({
      activeConfigurationId: configurationId,
      configurations: [...previous.configurations, configuration],
    }));
  }, [currentFilterSnapshot]);

  const handleApplySavedFilterConfiguration = useCallback((configurationId: string) => {
    const configuration = savedFilterState.configurations.find((item) => item.id === configurationId);
    if (!configuration) return;

    if (savedFilterState.activeConfigurationId === configurationId) {
      resetFiltersToDefault();
      setSavedFilterState((previous) => ({
        ...previous,
        activeConfigurationId: null,
      }));
      return;
    }

    const availableRelayIds = new Set(relays.map((relay) => relay.id));
    const nextRelayIds = new Set(
      configuration.relayIds.filter((relayId) => availableRelayIds.has(relayId))
    );
    setActiveRelayIds(nextRelayIds.size > 0 ? nextRelayIds : new Set(relays.map((relay) => relay.id)));

    const nextChannelStates = new Map<string, Channel["filterState"]>();
    for (const [channelId, state] of Object.entries(configuration.channelStates)) {
      if (state === "included" || state === "excluded") {
        nextChannelStates.set(channelId, state);
      }
    }
    setChannelFilterStates(nextChannelStates);
    setChannelMatchMode(configuration.channelMatchMode);

    const selectedPeopleIdSet = new Set(configuration.selectedPeopleIds);
    setPeople((previous) => mapPeopleSelection(previous, (person) => selectedPeopleIdSet.has(person.id)));

    setSavedFilterState((previous) => ({
      ...previous,
      activeConfigurationId: configurationId,
    }));
  }, [relays, resetFiltersToDefault, savedFilterState.activeConfigurationId, savedFilterState.configurations, setActiveRelayIds]);

  const handleRenameSavedFilterConfiguration = useCallback((configurationId: string, nextName: string) => {
    const normalizedName = nextName.trim();
    if (!normalizedName) return;
    setSavedFilterState((previous) => ({
      ...previous,
      configurations: previous.configurations.map((configuration) =>
        configuration.id === configurationId
          ? {
              ...configuration,
              name: normalizedName,
              updatedAt: new Date().toISOString(),
            }
          : configuration
      ),
    }));
  }, []);

  const handleDeleteSavedFilterConfiguration = useCallback((configurationId: string) => {
    setSavedFilterState((previous) => ({
      activeConfigurationId:
        previous.activeConfigurationId === configurationId ? null : previous.activeConfigurationId,
      configurations: previous.configurations.filter((configuration) => configuration.id !== configurationId),
    }));
  }, []);

  const savedFilterController = useMemo<SavedFilterController>(
    () => ({
      configurations: savedFilterState.configurations,
      activeConfigurationId: savedFilterState.activeConfigurationId,
      onApplyConfiguration: handleApplySavedFilterConfiguration,
      onSaveCurrentConfiguration: handleSaveCurrentFilterConfiguration,
      onRenameConfiguration: handleRenameSavedFilterConfiguration,
      onDeleteConfiguration: handleDeleteSavedFilterConfiguration,
    }),
    [
      handleApplySavedFilterConfiguration,
      handleDeleteSavedFilterConfiguration,
      handleRenameSavedFilterConfiguration,
      handleSaveCurrentFilterConfiguration,
      savedFilterState.activeConfigurationId,
      savedFilterState.configurations,
    ]
  );

  const handleHashtagExclusive = useCallback((tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag) return;

    const existsInSidebar = channels.some((ch) => ch.name.toLowerCase() === normalizedTag);

    // If the tag isn't in the sidebar yet, add it via postedTags so deriveChannels includes it
    if (!existsInSidebar) {
      setPostedTags((prev) => Array.from(new Set([...prev, normalizedTag])));
    }

    // Use a functional updater that works with the potentially-updated channels list.
    // Since postedTags triggers a re-derive of channels, we set the filter state
    // keyed by the normalizedTag id directly.
    setChannelFilterStates(() => {
      const channelId = channels.find((ch) => ch.name.toLowerCase() === normalizedTag)?.id || normalizedTag;
      const allChannels = existsInSidebar
        ? channels
        : [...channels, { id: normalizedTag, name: normalizedTag, filterState: "neutral" as const }];
      return setExclusiveChannelFilter(allChannels, channelId);
    });

    toast.success(t("toasts.success.showingOnlyTag", { tag: normalizedTag }));
  }, [channels, t]);

  const handlePersonToggle = (id: string) => {
    setPeople((prev) =>
      prev.map((person) =>
        person.id === id ? { ...person, isSelected: !person.isSelected } : person
      )
    );
  };

  const handlePersonExclusive = (id: string) => {
    if (shouldToggleOffExclusivePerson(people, id)) {
      setPeople((prev) => mapPeopleSelection(prev, () => false));
      return;
    }
    setPeople((prev) => mapPeopleSelection(prev, (person) => person.id === id));
    const person = people.find((p) => p.id === id);
    toast.success(
      t("toasts.success.showingOnlyPerson", {
        personName: person?.displayName || person?.name || t("toasts.success.selectedUserFallback"),
      })
    );
  };

  const upsertAndSelectPerson = useCallback((author: Person) => {
    setPeople((prev) => {
      const exists = prev.some((person) => person.id === author.id);
      const next = exists
        ? prev
        : [
            ...prev,
            {
              ...author,
              avatar: author.avatar || "",
              isOnline: author.isOnline ?? true,
              onlineStatus: author.onlineStatus ?? "online",
              isSelected: false,
            },
          ];

      return next.map((person) => ({
        ...person,
        isSelected: person.id === author.id,
      }));
    });
  }, []);

  const handleAuthorClick = useCallback((author: Person) => {
    upsertAndSelectPerson(author);
    const mention = `@${getPreferredMentionIdentifier(author)}`;
    setMentionRequest({ mention, id: Date.now() });

    if (isMobile) {
      setSearchQuery((previous) => {
        const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(previous)) {
          return previous;
        }
        const separator = previous && !previous.endsWith(" ") ? " " : "";
        return `${previous}${separator}${mention} `;
      });
    }
    toast.success(
      t("toasts.success.showingOnlyAuthorAndTagging", {
        authorName: author.displayName || author.name,
        mention,
      })
    );
  }, [isMobile, t, upsertAndSelectPerson]);

  const handleToggleAllPeople = () => {
    if (sidebarPeople.length === 0) {
      toast.success(t("toasts.success.noFrequentPeople"));
      return;
    }
    const sidebarIds = new Set(sidebarPeople.map((person) => person.id));
    const selectedCount = sidebarPeople.filter((person) => person.isSelected).length;
    const shouldSelectAll = selectedCount !== sidebarPeople.length;
    setPeople((prev) =>
      prev.map((person) =>
        sidebarIds.has(person.id)
          ? { ...person, isSelected: shouldSelectAll }
          : person
      )
    );
    toast.success(shouldSelectAll ? t("toasts.success.frequentPeopleSelected") : t("toasts.success.frequentPeopleDeselected"));
  };

  const triggerCompletionCheer = useCallback((taskId: string) => {
    const launchCompletionConfetti = (taskElement: HTMLElement) => {
      if (typeof window === "undefined" || typeof document === "undefined") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const now = Date.now();
      const lastAt = completionConfettiLastAtRef.current.get(taskId) || 0;
      if (now - lastAt < 220) return;
      completionConfettiLastAtRef.current.set(taskId, now);

      const rect = taskElement.getBoundingClientRect();
      const burst = document.createElement("div");
      burst.setAttribute("data-confetti-burst", taskId);
      burst.style.position = "fixed";
      burst.style.left = `${rect.left + Math.min(44, rect.width * 0.2)}px`;
      burst.style.top = `${rect.top + Math.min(24, rect.height * 0.5)}px`;
      burst.style.pointerEvents = "none";
      burst.style.zIndex = "250";

      const particles = [
        { x: -18, y: -22, rotate: -22, color: "hsl(var(--success))" },
        { x: -8, y: -28, rotate: -6, color: "hsl(var(--primary))" },
        { x: 6, y: -26, rotate: 12, color: "hsl(var(--warning))" },
        { x: 18, y: -20, rotate: 24, color: "hsl(var(--success))" },
        { x: -3, y: -18, rotate: -14, color: "hsl(var(--primary))" },
        { x: 12, y: -16, rotate: 18, color: "hsl(var(--warning))" },
      ];

      for (const particle of particles) {
        const node = document.createElement("span");
        node.className = "motion-confetti-particle";
        node.style.position = "absolute";
        node.style.left = "0px";
        node.style.top = "0px";
        node.style.width = "0.28rem";
        node.style.height = "0.28rem";
        node.style.borderRadius = "9999px";
        node.style.background = particle.color;
        node.style.setProperty("--confetti-x", `${particle.x}px`);
        node.style.setProperty("--confetti-y", `${particle.y}px`);
        node.style.setProperty("--confetti-rotate", `${particle.rotate}deg`);
        burst.appendChild(node);
      }

      document.body.appendChild(burst);
      window.setTimeout(() => {
        burst.remove();
      }, 420);
    };

    window.setTimeout(() => {
      const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(taskId) : taskId;
      const taskElement = document.querySelector(`[data-task-id="${escapedId}"]`) as HTMLElement | null;
      if (!taskElement) return;
      taskElement.classList.remove("motion-completion-cheer");
      // Reflow allows immediate replay when users complete tasks in quick succession.
      void taskElement.offsetWidth;
      taskElement.classList.add("motion-completion-cheer");
      launchCompletionConfetti(taskElement);
      window.setTimeout(() => {
        taskElement.classList.remove("motion-completion-cheer");
      }, 700);
    }, 0);
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

  const resolveMentionPubkeys = useCallback((content: string): string[] => {
    return resolveMentionedPubkeys(content, people);
  }, [people]);

  const resolveRelayUrlsFromIds = useCallback((relayIds: string[]) => {
    return relays
      .filter((relay) => relayIds.includes(relay.id))
      .map((relay) => relay.url)
      .filter((url): url is string => Boolean(url));
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
    const originRelayId = resolveOriginRelayIdForTask(task, DEMO_RELAY_ID);
    if (!originRelayId) {
      return { relayId: undefined, relayUrls: [] as string[] };
    }
    return {
      relayId: originRelayId,
      relayUrls: resolveRelayUrlsFromIds([originRelayId]),
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
      console.info("Skipping state publish: task id is not a Nostr event id", { taskId });
      return;
    }

    const relayUrls = relayUrlsOverride && relayUrlsOverride.length > 0
      ? relayUrlsOverride.slice(0, 1)
      : resolveTaskOriginRelay(taskId).relayUrls;

    if (relayUrls.length === 0) {
      console.info("Skipping state publish: no non-demo relay mapped for task", taskId);
      return;
    }

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
      return false;
    }
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
      return false;
    }
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
    toast.success(t("toasts.success.publishUndone"));
  }, [clearPendingPublishTask, t]);

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
    priority?: number
  ): Promise<TaskCreateResult> => {
    if (guardInteraction("post")) {
      return hasDisconnectedSelectedRelays
        ? { ok: false, reason: "relay-selection" }
        : { ok: false, reason: "not-authenticated" };
    }
    if (extractedTags.length === 0) {
      notifyNeedTag(t);
      return { ok: false, reason: "missing-tag" };
    }
    const normalizedTaskType = normalizeTaskType(taskType);
    if (normalizedTaskType !== taskType) {
      console.warn("Unexpected taskType payload; defaulting to task", { taskType });
    }
    setPostedTags((prev) => Array.from(new Set([...prev, ...extractedTags.map((t) => t.toLowerCase())])));

    const requestedRelayIds = relayIds.length > 0 ? relayIds : [DEMO_RELAY_ID];
    const parentTask = parentId ? allTasks.find((task) => task.id === parentId) : undefined;
    const resolvedRelaySelection = resolveRelaySelectionForSubmission({
      taskType: normalizedTaskType,
      selectedRelayIds: requestedRelayIds,
      relays,
      parentTask,
      demoRelayId: DEMO_RELAY_ID,
    });
    if (resolvedRelaySelection.error) {
      toast.error(resolvedRelaySelection.error || t("toasts.errors.selectRelayOrParent"));
      return { ok: false, reason: "relay-selection" };
    }
    const targetRelayIds = resolvedRelaySelection.relayIds;
    const hasNonDemoRelay = targetRelayIds.some((id) => id !== DEMO_RELAY_ID);

    const selectedRelayUrls = resolveRelayUrlsFromIds(targetRelayIds);
    
    const shouldPublish = hasNonDemoRelay && selectedRelayUrls.length > 0;
    const dedupedExplicitMentionPubkeys = Array.from(
      new Set(
        explicitMentionPubkeys
          .map((pubkey) => pubkey.trim().toLowerCase())
          .filter((pubkey) => /^[a-f0-9]{64}$/i.test(pubkey))
      )
    );
    const mentionPubkeys = Array.from(
      new Set([...resolveMentionPubkeys(content), ...dedupedExplicitMentionPubkeys])
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
    const normalizedExtractedTags = Array.from(
      new Set(extractedTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
    );
    
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
    const publishKind: NostrEventKind = normalizedTaskType === "task" ? NostrEventKind.Task : NostrEventKind.TextNote;
    const validParentId = isNostrEventId(parentId) ? parentId : undefined;
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
                normalizedExtractedTags
              )
            : [
                ...mentionPubkeys.map((pubkey) => ["p", pubkey] as string[]),
                ...normalizedExtractedTags.map((tag) => ["t", tag] as string[]),
              ]
        )
      : [];
    const publishParentId = shouldPublish && normalizedTaskType === "comment" && validParentId ? validParentId : undefined;

    const publishFailedDraft = (
      fallbackKind: NostrEventKind,
      fallbackTags: string[][],
      fallbackParentId?: string
    ): FailedPublishDraft => ({
      id: `failed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      author: taskAuthor,
      content,
      tags: normalizedExtractedTags,
      relayIds: targetRelayIds,
      relayUrls: selectedRelayUrls,
      taskType: normalizedTaskType,
      createdAt: createdAt.toISOString(),
      dueDate: dueDate ? dueDate.toISOString() : undefined,
      dueTime,
      dateType,
      parentId,
      initialStatus,
      mentionPubkeys,
      assigneePubkeys: normalizedTaskType === "task" ? assigneePubkeys : undefined,
      priority: normalizedTaskType === "task" ? priority : undefined,
      publishKind: fallbackKind,
      publishTags: fallbackTags,
      publishParentId: fallbackParentId,
    });

    const effectiveRelayIds = selectedRelayUrls.length > 0
      ? selectedRelayUrls.slice(0, 1).map((url) => getRelayIdFromUrl(url))
      : targetRelayIds;

    const baseTask: Omit<Task, "id"> = {
      author: taskAuthor,
      content,
      tags: normalizedExtractedTags,
      relays: effectiveRelayIds.length > 0 ? effectiveRelayIds : [DEMO_RELAY_ID],
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
    };

    const parsedHashtagsFromContent = new Set(
      (content.match(/#(\w+)/g) || []).map((tag) => tag.slice(1).toLowerCase())
    );
    const explicitTagNamesForRestore = normalizedExtractedTags.filter((tag) => !parsedHashtagsFromContent.has(tag));
    const explicitMentionPubkeysForRestore = dedupedExplicitMentionPubkeys;
    const composeRestoreState: ComposeRestoreState = {
      content,
      taskType: normalizedTaskType,
      dueDate,
      dueTime,
      dateType,
      explicitTagNames: explicitTagNamesForRestore,
      explicitMentionPubkeys: explicitMentionPubkeysForRestore,
      selectedRelays: targetRelayIds,
      priority,
    };

    if (!shouldPublish) {
      setLocalTasks((prev) => [{ ...baseTask, id: Date.now().toString() }, ...prev]);
      notifyLocalSaved(t, normalizedTaskType);
      return { ok: true, mode: "local" };
    }

    const publishWithMetadata = async () => {
      try {
        const result = await publishEvent(publishKind, content, publishTags, publishParentId, selectedRelayUrls);
        return { success: result.success, eventId: result.eventId };
      } catch (error) {
        console.error("Task publish failed unexpectedly", error);
        return { success: false, eventId: undefined as string | undefined };
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
          const failedDraft = publishFailedDraft(publishKind, publishTags, publishParentId);
          setFailedPublishDrafts((prev) => [failedDraft, ...prev].slice(0, 50));
          setLocalTasks((prev) => prev.filter((task) => task.id !== pendingTaskId));
          notifyPublishSavedForRetry(t);
          return;
        }

        if (publishResult.eventId && normalizedTaskType === "task" && initialStatus) {
          await publishTaskStateUpdate(publishResult.eventId, initialStatus, selectedRelayUrls.slice(0, 1));
        }
        if (publishResult.eventId && normalizedTaskType === "task" && dueDate) {
          await publishTaskDueUpdate(
            publishResult.eventId,
            content,
            dueDate,
            dueTime,
            dateType,
            selectedRelayUrls.slice(0, 1)
          );
        }

        setLocalTasks((prev) =>
          prev.map((task) =>
            task.id === pendingTaskId
              ? {
                  ...task,
                  id: publishResult.eventId || task.id,
                  pendingPublishToken: undefined,
                  pendingPublishUntil: undefined,
                }
              : task
          )
        );
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
      return { ok: true, mode: "published" };
    }

    const publishResult = await publishWithMetadata();
    if (!publishResult.success) {
      const failedDraft = publishFailedDraft(publishKind, publishTags, publishParentId);
      setFailedPublishDrafts((prev) => [failedDraft, ...prev].slice(0, 50));
      notifyPublishSavedForRetry(t);
      return { ok: true, mode: "queued" };
    }

    if (publishResult.eventId && normalizedTaskType === "task" && initialStatus) {
      await publishTaskStateUpdate(publishResult.eventId, initialStatus, selectedRelayUrls.slice(0, 1));
    }
    if (publishResult.eventId && normalizedTaskType === "task" && dueDate) {
      await publishTaskDueUpdate(
        publishResult.eventId,
        content,
        dueDate,
        dueTime,
        dateType,
        selectedRelayUrls.slice(0, 1)
      );
    }

    setLocalTasks((prev) => [
      {
        ...baseTask,
        id: publishResult.eventId || Date.now().toString(),
      },
      ...prev,
    ]);
    notifyPublished(t, normalizedTaskType);
    return { ok: true, mode: "published" };
  };

  const parseStoredDate = useCallback((value?: string): Date | undefined => {
    if (!value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, []);

  const handleRetryFailedPublish = useCallback(async (draftId: string) => {
    if (guardInteraction("modify")) {
      return;
    }
    const draft = failedPublishDrafts.find((item) => item.id === draftId);
    if (!draft) return;

    const relayUrls = draft.relayUrls.length > 0
      ? draft.relayUrls
      : resolveRelayUrlsFromIds(draft.relayIds);
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
      toast.error(t("toasts.errors.retryRejectedByRelay"));
      return;
    }

    const publishedEventId = result.eventId;
    const effectiveRelayIds = relayUrls.slice(0, 1).map((url) => getRelayIdFromUrl(url));
    const dueDate = parseStoredDate(draft.dueDate);
    const restoredTask: Task = {
      id: publishedEventId || Date.now().toString(),
      author: draft.author,
      content: draft.content,
      tags: draft.tags,
      relays: effectiveRelayIds.length > 0 ? effectiveRelayIds : [DEMO_RELAY_ID],
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
    };
    setLocalTasks((prev) => [restoredTask, ...prev]);
    setFailedPublishDrafts((prev) => prev.filter((item) => item.id !== draftId));

    if (publishedEventId && draft.taskType === "task" && draft.initialStatus) {
      await publishTaskStateUpdate(publishedEventId, draft.initialStatus, relayUrls.slice(0, 1));
    }
    if (publishedEventId && draft.taskType === "task" && dueDate) {
      await publishTaskDueUpdate(
        publishedEventId,
        draft.content,
        dueDate,
        draft.dueTime,
        draft.dateType || "due",
        relayUrls.slice(0, 1)
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
    resolveRelayUrlsFromIds,
    t,
  ]);

  const handleDismissFailedPublish = useCallback((draftId: string) => {
    setFailedPublishDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
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

  const filteredTasks = useMemo(
    () =>
      filterTasks({
        tasks: allTasks,
        activeRelayIds: effectiveActiveRelayIds,
        channels: channelsWithState,
        people,
        channelMatchMode,
      }),
    [allTasks, channelMatchMode, channelsWithState, effectiveActiveRelayIds, people]
  );

  const sidebarPeople = useMemo(() => {
    return deriveSidebarPeople(people, allTasks, supplementalLatestActivityByAuthor);
  }, [allTasks, people, supplementalLatestActivityByAuthor]);

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
    savedFilters: savedFilterController,
  };

  const renderView = () => {
    switch (currentView) {
      case "tree":
        return <TaskTree {...viewProps} />;
      case "feed":
        return <FeedView {...viewProps} />;
      case "kanban":
        return <KanbanView {...viewProps} depthMode={kanbanDepthMode} />;
      case "calendar":
        return <CalendarView {...viewProps} />;
      case "list":
        return <ListView {...viewProps} depthMode={kanbanDepthMode} />;
      default:
        return <TaskTree {...viewProps} />;
    }
  };

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
          onAddRelay={addRelay}
          onRemoveRelay={removeRelay}
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
          savedFilters={savedFilterController}
          failedPublishDrafts={failedPublishDrafts}
          onRetryFailedPublish={handleRetryFailedPublish}
          onDismissFailedPublish={handleDismissFailedPublish}
          isInteractionBlocked={isInteractionBlocked}
          onInteractionBlocked={handleBlockedInteractionAttempt}
          isOnboardingOpen={isOnboardingOpen && !isAuthModalOpen}
          activeOnboardingStepId={activeOnboardingStepId}
          isManageRouteActive={isManageRouteActive}
          onManageRouteChange={setManageRouteActive}
        />
        <NostrAuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
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
  }

  // Desktop layout
  return (
    <div className="grid h-screen overflow-hidden bg-background grid-cols-[auto,1fr] grid-rows-[var(--topbar-height),1fr] [--topbar-height:3rem] sm:[--topbar-height:3.5rem] xl:[--topbar-height:4rem]">
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
        onAddRelay={addRelay}
        onRemoveRelay={removeRelay}
        isFocused={isSidebarFocused}
        onFocusTasks={handleFocusTasks}
        onShortcutsClick={shortcutsHelp.open}
        onGuideClick={handleOpenGuide}
      />
      <div className="min-w-0 overflow-hidden flex flex-col" {...desktopSwipeHandlers}>
        <FailedPublishQueueBanner
          drafts={failedPublishDrafts}
          onRetry={handleRetryFailedPublish}
          onDismiss={handleDismissFailedPublish}
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
      <VersionHint className="fixed bottom-2 right-3 z-20 rounded bg-background/70 px-1.5 py-0.5 backdrop-blur-sm border border-border/60" />
    </div>
  );
};

export default Index;
