import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar, SidebarHeader } from "@/components/layout/Sidebar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { KanbanView } from "@/components/tasks/KanbanView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { ListView } from "@/components/tasks/ListView";
import { DesktopSearchDock, type KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import { ViewSwitcher, ViewType } from "@/components/tasks/ViewSwitcher";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useSwipeNavigation } from "@/hooks/use-swipe-navigation";
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useNDK } from "@/lib/nostr/ndk-context";
import { NostrAuthModal, NostrUserMenu } from "@/components/auth/NostrAuthModal";
import { ThemeModeToggle } from "@/components/theme/ThemeModeToggle";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import { VersionHint } from "@/components/layout/VersionHint";
import { onboardingSections } from "@/components/onboarding/onboarding-sections";
import { getOnboardingStepsBySection } from "@/components/onboarding/onboarding-steps";
import { OnboardingInitialSection, OnboardingSectionId } from "@/components/onboarding/onboarding-types";
import { nostrEventsToTasks, getRelayIdFromUrl, getRelayNameFromUrl, isSpamContent } from "@/lib/nostr/event-converter";
import { deriveChannels } from "@/lib/channels";
import {
  getEffectiveActiveRelayIds,
  loadPersistedChannelFilters,
  loadPersistedRelayIds,
  savePersistedChannelFilters,
  savePersistedRelayIds,
} from "@/lib/filter-preferences";
import { applyTaskStatusUpdate, cycleTaskStatus } from "@/lib/task-status";
import { resolveCurrentUser } from "@/lib/current-user";
import { canUserChangeTaskStatus, extractAssignedMentionsFromContent } from "@/lib/task-permissions";
import { isNostrEventId } from "@/lib/nostr/event-id";
import { NostrEventKind } from "@/lib/nostr/types";
import { isTaskStateEventKind, mapTaskStatusToStateEvent } from "@/lib/nostr/task-state-events";
import { buildLinkedTaskCalendarEvent } from "@/lib/nostr/task-calendar-events";
import { buildTaskPublishTags } from "@/lib/nostr/task-publish-tags";
import {
  derivePeopleFromKind0Events,
  loadCachedKind0Events,
  loadLoggedInIdentityPriority,
  mergeKind0EventsWithCache,
  rememberLoggedInIdentity,
  saveCachedKind0Events,
} from "@/lib/people-from-kind0";
import { loadOnboardingState, markOnboardingCompleted } from "@/lib/onboarding-state";
import { filterTasks } from "@/lib/task-filtering";
import { getOnboardingBehaviorGateId, shouldForceComposeForGuide } from "@/lib/onboarding-guide";
import {
  isFilterResetStep,
  isNavigationFocusStep,
  shouldForceFeedAndResetFiltersOnStep,
} from "@/lib/onboarding-step-rules";
import { getPreferredMentionIdentifier, resolveMentionedPubkeys } from "@/lib/mentions";
import {
  mapPeopleSelection,
  setAllChannelFilters,
  setExclusiveChannelFilter,
} from "@/lib/filter-state-utils";
import { mockTasks, mockRelays as demoRelays } from "@/data/mockData";
import { Relay, Channel, Person, Task, TaskStatus, TaskType } from "@/types";
import { toast } from "sonner";
import { NDKEvent } from "@nostr-dev-kit/ndk";

const validViews: ViewType[] = ["tree", "feed", "kanban", "calendar", "list"];

// Default Nostr relays - these are managed by NDKProvider in App.tsx

// Demo relay constant
const DEMO_RELAY_ID = "demo";
const ENABLE_MOBILE_GUIDE_SECTION_PICKER = false;

const Index = () => {
  const { view: urlView, taskId: urlTaskId } = useParams<{ view: string; taskId: string }>();
  const navigate = useNavigate();

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

  // State for NDK events
  const [nostrEvents, setNostrEvents] = useState<NDKEvent[]>([]);

  // Convert relay statuses to app Relay format - combine demo relay with nostr relays
  const relays: Relay[] = useMemo(() => {
    const nostrRelayItems = ndkRelays.map((r) => ({
      id: getRelayIdFromUrl(r.url),
      name: getRelayNameFromUrl(r.url),
      icon: "radio",
      isActive: r.status === "connected",
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

  const TEST_RELAY_ID = "test-nostr-melonion-me";
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(() =>
    loadPersistedRelayIds([TEST_RELAY_ID])
  );
  const [people, setPeople] = useState<Person[]>([]);
  const [cachedKind0Events, setCachedKind0Events] = useState(() => loadCachedKind0Events());
  const [loggedInIdentityPriority, setLoggedInIdentityPriority] = useState(() => loadLoggedInIdentityPriority());
  const [localTasks, setLocalTasks] = useState<Task[]>(mockTasks);
  const [postedTags, setPostedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarFocused, setIsSidebarFocused] = useState(false);
  const [mentionRequest, setMentionRequest] = useState<{ mention: string; id: number } | null>(null);

  // Filter nostr events - only keep those with tags and not spam
  const filteredNostrEvents = useMemo(() => {
    return nostrEvents.filter(event => {
      if (event.kind === NostrEventKind.Metadata) return false;
      if (isTaskStateEventKind(event.kind)) return true;
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

  useEffect(() => {
    const merged = mergeKind0EventsWithCache(liveKind0Events, loadCachedKind0Events());
    saveCachedKind0Events(merged);
    setCachedKind0Events(merged);
  }, [liveKind0Events]);

  useEffect(() => {
    if (!user?.pubkey) return;
    setLoggedInIdentityPriority(rememberLoggedInIdentity(user.pubkey));
  }, [user?.pubkey]);

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
        id: event.id || "",
        pubkey: event.pubkey,
        created_at: event.created_at || Math.floor(Date.now() / 1000),
        kind: event.kind as NostrEventKind,
        tags: event.tags,
        content: event.content,
        sig: event.sig || "",
        relayUrl: event.relay?.url || "unknown",
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
    }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [localTasks, nostrTasks]);

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

  // Subscribe to Nostr events when connected
  useEffect(() => {
    if (!isNostrConnected) return;

    // Subscribe to notes, tasks, and task state updates.
    const subscribedKinds: NostrEventKind[] = [
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
    ];

    const subscription = subscribe(
      [{
        kinds: subscribedKinds,
        limit: 200,
      }],
      (event) => {
        setNostrEvents((prev) => {
          // Check for duplicates
          if (prev.some((e) => e.id === event.id)) {
            return prev;
          }
          // Add event and sort by created_at descending
          const newEvents = [event, ...prev].sort(
            (a, b) => (b.created_at || 0) - (a.created_at || 0)
          );
          // Limit to 500 events
          return newEvents.slice(0, 500);
        });
      }
    );

    return () => {
      subscription?.stop();
    };
  }, [isNostrConnected, subscribe]);

  useEffect(() => {
    savePersistedRelayIds(activeRelayIds);
  }, [activeRelayIds]);

  useEffect(() => {
    savePersistedChannelFilters(channelFilterStates);
  }, [channelFilterStates]);

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

  const isMobile = useIsMobile();
  const currentUser = resolveCurrentUser(people, user);
  const shortcutsHelp = useKeyboardShortcutsHelp();
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingInitialSection, setOnboardingInitialSection] = useState<OnboardingInitialSection>(null);
  const [activeOnboardingSection, setActiveOnboardingSection] = useState<OnboardingSectionId | null>(null);
  const [activeOnboardingStepId, setActiveOnboardingStepId] = useState<string | null>(null);
  const [composeGuideActivationSignal, setComposeGuideActivationSignal] = useState(0);
  const [kanbanDepthMode, setKanbanDepthMode] = useState<KanbanDepthMode>("leaves");
  const onboardingStepsBySection = useMemo(() => getOnboardingStepsBySection(isMobile), [isMobile]);

  const handleOpenGuide = useCallback(() => {
    const initialSectionForOpen: OnboardingInitialSection =
      isMobile && !ENABLE_MOBILE_GUIDE_SECTION_PICKER ? "all" : null;
    setOnboardingInitialSection(initialSectionForOpen);
    setActiveOnboardingSection(null);
    setIsOnboardingOpen(true);
  }, [isMobile]);

  useEffect(() => {
    const onboardingState = loadOnboardingState();
    if (!onboardingState.completed) {
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
  }, [channels, isMobile, relays, setCurrentView, setFocusedTaskId]);

  const forceShowComposeForGuide = shouldForceComposeForGuide({
    isOnboardingOpen,
    activeOnboardingSection,
    activeOnboardingStepId,
    isMobile,
  });

  const handleOnboardingActiveSectionChange = useCallback((section: OnboardingSectionId | null) => {
    setActiveOnboardingSection(section);
    if (section === "compose") {
      setComposeGuideActivationSignal((previous) => previous + 1);
    }
    if (!isMobile && section === "compose" && currentView !== "feed") {
      setCurrentView("feed");
    }
  }, [currentView, isMobile, setCurrentView]);

  const handleRelayToggle = (id: string) => {
    setActiveRelayIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    const relay = relays.find((r) => r.id === id);
    toast.success(`${relay?.name} relay filter ${activeRelayIds.has(id) ? "disabled" : "enabled"}`);
  };

  const handleRelayExclusive = (id: string) => {
    setActiveRelayIds(new Set([id]));
    const relay = relays.find((r) => r.id === id);
    toast.success(`Showing only ${relay?.name} relay`);
  };

  const handleToggleAllRelays = () => {
    if (activeRelayIds.size === relays.length) {
      setActiveRelayIds(new Set());
      toast.success("All relay filters cleared");
    } else {
      setActiveRelayIds(new Set(relays.map((r) => r.id)));
      toast.success("All relays selected");
    }
  };

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
    setChannelFilterStates(() => setExclusiveChannelFilter(channels, id));
    const channel = channelsWithState.find((c) => c.id === id);
    toast.success(`Showing only #${channel?.name}`);
  };

  const handleToggleAllChannels = () => {
    const allNeutral = Array.from(channelFilterStates.values()).every((s) => s === "neutral") || channelFilterStates.size === 0;
    setChannelFilterStates(() => setAllChannelFilters(channels, allNeutral ? "included" : "neutral"));
    toast.success(allNeutral ? "All channels included" : "All channels reset");
  };

  const handleHashtagExclusive = useCallback((tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag) return;

    setChannelFilterStates(() => {
      return setExclusiveChannelFilter(
        channels,
        channels.find((channel) => channel.name.toLowerCase() === normalizedTag)?.id || ""
      );
    });

    toast.success(`Showing only #${normalizedTag}`);
  }, [channels]);

  const handlePersonToggle = (id: string) => {
    setPeople((prev) =>
      prev.map((person) =>
        person.id === id ? { ...person, isSelected: !person.isSelected } : person
      )
    );
  };

  const handlePersonExclusive = (id: string) => {
    setPeople((prev) => mapPeopleSelection(prev, (person) => person.id === id));
    const person = people.find((p) => p.id === id);
    toast.success(`Showing only ${person?.displayName || person?.name || "selected user"}`);
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
    toast.success(`Showing only ${author.displayName || author.name} and tagging ${mention}`);
  }, [isMobile, upsertAndSelectPerson]);

  const handleToggleAllPeople = () => {
    if (sidebarPeople.length === 0) {
      toast.success("No frequent people to select");
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
    toast.success(shouldSelectAll ? "Frequent people selected" : "Frequent people deselected");
  };

  const resolveMentionPubkeys = useCallback((content: string): string[] => {
    return resolveMentionedPubkeys(content, people);
  }, [people]);

  const handleToggleComplete = (taskId: string) => {
    if (!user) {
      handleOpenAuthModal();
      toast.error("Sign in required to modify tasks");
      return;
    }

    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask) return;
    if (!canUserChangeTaskStatus(existingTask, currentUser)) {
      toast.error("Status updates are restricted to assigned users");
      return;
    }
    const nextStatus = cycleTaskStatus(existingTask.status || "todo");
    setLocalTasks((prev) =>
      applyTaskStatusUpdate(prev, allTasks, taskId, nextStatus, currentUser?.name)
    );
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
      ? relayUrlsOverride
      : (() => {
          const sourceTask = allTasks.find((task) => task.id === taskId);
          if (!sourceTask) return [];
          return relays
            .filter((relay) => sourceTask.relays.includes(relay.id))
            .map((relay) => relay.url)
            .filter((url): url is string => Boolean(url));
        })();

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
      toast.error("Failed to publish status update to relays");
      console.warn("Status publish failed", { taskId, status, relayUrls });
    }
  }, [allTasks, publishEvent, relays]);

  const handleStatusChange = (taskId: string, newStatus: "todo" | "in-progress" | "done") => {
    if (!user) {
      handleOpenAuthModal();
      toast.error("Sign in required to modify tasks");
      return;
    }

    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask) return;
    if (!canUserChangeTaskStatus(existingTask, currentUser)) {
      toast.error("Status updates are restricted to assigned users");
      return;
    }

    setLocalTasks((prev) =>
      applyTaskStatusUpdate(prev, allTasks, taskId, newStatus, currentUser?.name)
    );
    void publishTaskStateUpdate(taskId, newStatus);
  };

  const handleNewTask = async (
    content: string,
    extractedTags: string[],
    relayIds: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    parentId?: string,
    initialStatus?: TaskStatus,
    explicitMentionPubkeys: string[] = []
  ) => {
    if (!user) {
      handleOpenAuthModal();
      toast.error("Sign in required to post");
      return;
    }
    if (extractedTags.length === 0) {
      toast.error("Add at least one #channel before posting");
      return;
    }
    setPostedTags((prev) => Array.from(new Set([...prev, ...extractedTags.map((t) => t.toLowerCase())])));

    const requestedRelayIds = relayIds.length > 0 ? relayIds : [DEMO_RELAY_ID];
    const hasNonDemoRelay = requestedRelayIds.some((id) => id !== DEMO_RELAY_ID);
    
    const selectedRelayUrls = relays
      .filter((r) => requestedRelayIds.includes(r.id))
      .map((r) => r.url)
      .filter((url): url is string => Boolean(url));
    
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
      taskType === "task" && /^[a-f0-9]{64}$/i.test(user.pubkey)
        ? user.pubkey.toLowerCase()
        : undefined;
    const assigneePubkeys = taskType === "task"
      ? Array.from(
          new Set(
            mentionPubkeys.length > 0
              ? mentionPubkeys
              : [defaultAuthorAssignee].filter((value): value is string => Boolean(value))
          )
        )
      : [];
    
    let publishSuccess = false;
    let publishedEventId: string | undefined;
    if (shouldPublish) {
      console.log("Publishing event to relays:", selectedRelayUrls);
      const kind = taskType === "task" ? NostrEventKind.Task : NostrEventKind.TextNote;
      const validParentId = isNostrEventId(parentId) ? parentId : undefined;
      if (taskType === "task" && parentId && !validParentId) {
        toast.warning("Parent reference is local-only; publishing task without parent link");
      }
      const publishTags = taskType === "task"
        ? buildTaskPublishTags(validParentId, selectedRelayUrls[0], assigneePubkeys)
        : mentionPubkeys.map((pubkey) => ["p", pubkey]);
      const publishParentId = taskType === "comment" && validParentId ? validParentId : undefined;
      const result = await publishEvent(kind, content, publishTags, publishParentId, selectedRelayUrls);
      publishSuccess = result.success;
      publishedEventId = result.eventId;
      if (result.success && taskType === "task" && publishedEventId && initialStatus) {
        await publishTaskStateUpdate(publishedEventId, initialStatus, selectedRelayUrls);
      }
      if (result.success && taskType === "task" && publishedEventId && dueDate) {
        const calendarEvent = buildLinkedTaskCalendarEvent({
          taskEventId: publishedEventId,
          taskContent: content,
          dueDate,
          dueTime,
          relayUrl: selectedRelayUrls[0],
        });
        const calendarResult = await publishEvent(
          calendarEvent.kind,
          calendarEvent.content,
          calendarEvent.tags,
          undefined,
          selectedRelayUrls
        );
        if (!calendarResult.success) {
          toast.error("Failed to publish linked deadline event to relays");
          console.warn("Linked deadline publish failed", {
            taskEventId: publishedEventId,
            relayUrls: selectedRelayUrls,
          });
        }
      }
    }
    
    const effectiveRelayIds = selectedRelayUrls.length > 0
      ? selectedRelayUrls.map((url) => getRelayIdFromUrl(url))
      : requestedRelayIds;
    
    const newTask: Task = {
      id: publishedEventId || Date.now().toString(),
      author: (() => {
        if (currentUser) return currentUser;
        if (user?.pubkey) {
          return {
            id: user.pubkey,
            name: (user.profile?.name || user.profile?.displayName || user.npub.slice(0, 8)).trim(),
              displayName: (user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`).trim(),
              nip05: user.profile?.nip05?.trim().toLowerCase(),
              avatar: user.profile?.picture,
              isOnline: true,
              isSelected: false,
          };
        }
        return people[0];
      })(),
      content,
      tags: extractedTags,
      relays: effectiveRelayIds.length > 0 ? effectiveRelayIds : [DEMO_RELAY_ID],
      taskType: taskType as TaskType,
      timestamp: new Date(),
      status: taskType === "task" ? (initialStatus || "todo") : undefined,
      likes: 0,
      replies: 0,
      reposts: 0,
      dueDate,
      dueTime,
      parentId,
      mentions: Array.from(
        new Set([...extractAssignedMentionsFromContent(content), ...mentionPubkeys])
      ),
      assigneePubkeys: taskType === "task" ? assigneePubkeys : undefined,
    };
    setLocalTasks((prev) => [newTask, ...prev]);
    
    if (shouldPublish) {
      if (publishSuccess) {
        toast.success(`${taskType === "comment" ? "Comment" : "Task"} published to Nostr and added locally`);
      } else {
        toast.error("Failed to publish to Nostr; added locally");
      }
    } else {
      toast.success(`${taskType === "comment" ? "Comment" : "Task"} added locally (demo only)`);
    }
  };

  const effectiveActiveRelayIds = useMemo(
    () => getEffectiveActiveRelayIds(activeRelayIds, relays.map((relay) => relay.id)),
    [activeRelayIds, relays]
  );

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
      }),
    [allTasks, channelsWithState, effectiveActiveRelayIds, people]
  );

  const sidebarPeople = useMemo(() => {
    const postCountByAuthor = new Map<string, number>();
    for (const task of allTasks) {
      const authorId = task.author?.id?.trim().toLowerCase();
      if (!authorId) continue;
      postCountByAuthor.set(authorId, (postCountByAuthor.get(authorId) || 0) + 1);
    }

    return people.filter((person) => (postCountByAuthor.get(person.id.toLowerCase()) || 0) >= 6);
  }, [allTasks, people]);

  const viewProps = {
    tasks: filteredTasks,
    allTasks: allTasks,
    relays: relaysWithActiveState,
    channels: channelsWithState,
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
    mentionRequest,
    composeGuideActivationSignal,
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
        return <ListView {...viewProps} />;
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
          people={people}
          tasks={filteredTasks}
          allTasks={allTasks}
          searchQuery={searchQuery}
          focusedTaskId={focusedTaskId}
          currentUser={currentUser}
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
          onAddRelay={addRelay}
          onRemoveRelay={removeRelay}
          onSignInClick={handleOpenAuthModal}
          onGuideClick={handleOpenGuide}
          onHashtagClick={handleHashtagExclusive}
          forceComposeMode={forceShowComposeForGuide}
          onAuthorClick={handleAuthorClick}
          mentionRequest={mentionRequest}
        />
        <NostrAuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        <OnboardingGuide
          isOpen={isOnboardingOpen && !isAuthModalOpen}
          isMobile={isMobile}
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
          <ThemeModeToggle />
        </div>
      </div>
      <Sidebar
        relays={relaysWithActiveState}
        channels={channelsWithState}
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
        onToggleAllPeople={handleToggleAllPeople}
        onAddRelay={addRelay}
        onRemoveRelay={removeRelay}
        isFocused={isSidebarFocused}
        onFocusTasks={handleFocusTasks}
        onShortcutsClick={shortcutsHelp.open}
        onGuideClick={handleOpenGuide}
      />
      <div className="min-w-0 overflow-hidden flex flex-col" {...desktopSwipeHandlers}>
        <div className="min-h-0 flex-1 overflow-hidden">
          {renderView()}
        </div>
        <DesktopSearchDock
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showKanbanLevels={currentView === "kanban"}
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
