import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar, SidebarHeader } from "@/components/layout/Sidebar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { KanbanView } from "@/components/tasks/KanbanView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { ListView } from "@/components/tasks/ListView";
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
import { derivePeopleFromKind0Events } from "@/lib/people-from-kind0";
import { loadOnboardingState, markOnboardingCompleted } from "@/lib/onboarding-state";
import { mockTasks, mockRelays as demoRelays } from "@/data/mockData";
import { Relay, Channel, Person, Task, TaskStatus, TaskType } from "@/types";
import { toast } from "sonner";
import { NDKEvent } from "@nostr-dev-kit/ndk";

const validViews: ViewType[] = ["tree", "feed", "kanban", "calendar", "list"];

// Default Nostr relays - these are managed by NDKProvider in App.tsx

// Demo relay constant
const DEMO_RELAY_ID = "demo";

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
      const hasTags = event.tags.some(tag => tag[0] === "t" && tag[1]) ||
        /#\w+/.test(event.content);
      if (!hasTags) return false;
      // Filter out spam
      if (isSpamContent(event.content)) return false;
      return true;
    });
  }, [nostrEvents]);

  useEffect(() => {
    setPeople((prev) => {
      let next = derivePeopleFromKind0Events(nostrEvents, prev);

      if (user?.pubkey && !next.some((person) => person.id === user.pubkey)) {
        next = [
          ...next,
          {
            id: user.pubkey,
            name: (user.profile?.name || user.profile?.displayName || user.npub.slice(0, 8)).trim(),
            displayName: (user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`).trim(),
            avatar: user.profile?.picture,
            isOnline: true,
            isSelected: prev.find((person) => person.id === user.pubkey)?.isSelected || false,
          },
        ];
      }

      return next.sort((a, b) => a.displayName.localeCompare(b.displayName));
    });
  }, [nostrEvents, user]);

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

  // Dynamically derive channels from tasks/events, always including tags posted by this user.
  const channels: Channel[] = useMemo(() => {
    return deriveChannels(localTasks, filteredNostrEvents, postedTags, 6);
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

  // Subscribe to Nostr events when connected
  useEffect(() => {
    if (!isNostrConnected) return;

    // Subscribe to notes, tasks, and task state updates.
    const subscription = subscribe(
      [{
        kinds: [
          NostrEventKind.TextNote as any,
          NostrEventKind.Task as any,
          NostrEventKind.Metadata as any,
          NostrEventKind.GitStatusOpen as any,
          NostrEventKind.GitStatusApplied as any,
          NostrEventKind.GitStatusClosed as any,
          NostrEventKind.GitStatusDraft as any,
          NostrEventKind.Procedure as any,
          NostrEventKind.CalendarDateBased as any,
          NostrEventKind.CalendarTimeBased as any,
        ],
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

  const handleOpenGuide = useCallback(() => {
    setOnboardingInitialSection(null);
    setActiveOnboardingSection(null);
    setIsOnboardingOpen(true);
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
  const onboardingStepsBySection = useMemo(() => getOnboardingStepsBySection(isMobile), [isMobile]);

  useEffect(() => {
    const onboardingState = loadOnboardingState();
    if (!onboardingState.completed) {
      setOnboardingInitialSection("all");
      setIsOnboardingOpen(true);
    }
  }, []);

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
    currentView,
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
    setChannelFilterStates((prev) => {
      const newMap = new Map<string, Channel["filterState"]>();
      channels.forEach((c) => {
        newMap.set(c.id, c.id === id ? "included" : "neutral");
      });
      return newMap;
    });
    const channel = channelsWithState.find((c) => c.id === id);
    toast.success(`Showing only #${channel?.name}`);
  };

  const handleToggleAllChannels = () => {
    const allNeutral = Array.from(channelFilterStates.values()).every((s) => s === "neutral") || channelFilterStates.size === 0;
    setChannelFilterStates((prev) => {
      const newMap = new Map<string, Channel["filterState"]>();
      channels.forEach((c) => {
        newMap.set(c.id, allNeutral ? "included" : "neutral");
      });
      return newMap;
    });
    toast.success(allNeutral ? "All channels included" : "All channels reset");
  };

  const handleHashtagExclusive = useCallback((tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag) return;

    setChannelFilterStates(() => {
      const next = new Map<string, Channel["filterState"]>();
      channels.forEach((channel) => {
        next.set(channel.id, channel.name.toLowerCase() === normalizedTag ? "included" : "neutral");
      });
      return next;
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
    setPeople((prev) =>
      prev.map((person) => ({
        ...person,
        isSelected: person.id === id,
      }))
    );
    const person = people.find((p) => p.id === id);
    toast.success(`Showing only ${person?.displayName || person?.name || "selected user"}`);
  };

  const getMentionHandle = useCallback((person: Person): string => {
    const candidates = [person.name, person.displayName, person.id];
    for (const candidate of candidates) {
      const trimmed = (candidate || "").trim();
      if (!trimmed) continue;
      if (/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        return trimmed;
      }
    }
    return person.id;
  }, []);

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
    const mention = `@${getMentionHandle(author)}`;
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
  }, [getMentionHandle, isMobile, upsertAndSelectPerson]);

  const handleToggleAllPeople = () => {
    const allSelected = people.every((p) => p.isSelected);
    setPeople((prev) => prev.map((person) => ({ ...person, isSelected: !allSelected })));
    toast.success(allSelected ? "All people deselected" : "All people selected");
  };

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
    initialStatus?: TaskStatus
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
        ? buildTaskPublishTags(validParentId, selectedRelayUrls[0])
        : [];
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
      mentions: taskType === "task" ? extractAssignedMentionsFromContent(content) : [],
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

  // Check if any channel filters are active
  const hasActiveChannelFilters = channelsWithState.some(c => c.filterState !== "neutral");

  // Filter tasks based on active filters
  const filteredTasks = allTasks.filter((task) => {
    // Relay filter - if any relay is selected, task must be in one of the selected relays
    if (effectiveActiveRelayIds.size > 0 && !task.relays.some(tr => effectiveActiveRelayIds.has(tr))) {
      return false;
    }

    // Filter out posts with more than 10 tags if no channel filters are active
    if (!hasActiveChannelFilters && task.tags.length > 10) {
      return false;
    }

    // Person filter - filter by selected people (task author must be one of selected people)
    const selectedPeopleIds = people.filter((p) => p.isSelected).map((p) => p.id);
    if (selectedPeopleIds.length > 0 && !selectedPeopleIds.includes(task.author.id)) {
      return false;
    }

    // Channel exclusion filter - exclude tasks that have any excluded channels
    const excludedChannelNames = channelsWithState.filter((c) => c.filterState === "excluded").map((c) => c.name.toLowerCase());
    if (excludedChannelNames.length > 0) {
      const taskTagsLower = task.tags.map(t => t.toLowerCase());
      if (taskTagsLower.some(t => excludedChannelNames.includes(t))) {
        return false;
      }
    }

    // Channel inclusion filter - AND logic: task must have ALL included channels
    const includedChannelNames = channelsWithState.filter((c) => c.filterState === "included").map((c) => c.name.toLowerCase());
    if (includedChannelNames.length > 0) {
      const taskTagsLower = task.tags.map(t => t.toLowerCase());
      // Check if ALL included channels are present in the task's tags
      if (!includedChannelNames.every(c => taskTagsLower.includes(c))) {
        return false;
      }
    }

    return true;
  });

  const viewProps = {
    tasks: filteredTasks,
    allTasks: allTasks,
    relays: relaysWithActiveState,
    channels: channelsWithState,
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
    forceShowComposer: isOnboardingOpen && activeOnboardingSection === "compose",
    onAuthorClick: handleAuthorClick,
    mentionRequest,
  };

  const renderView = () => {
    switch (currentView) {
      case "tree":
        return <TaskTree {...viewProps} />;
      case "feed":
        return <FeedView {...viewProps} />;
      case "kanban":
        return <KanbanView {...viewProps} />;
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
          forceComposeMode={isOnboardingOpen && activeOnboardingSection === "compose"}
          onAuthorClick={handleAuthorClick}
          mentionRequest={mentionRequest}
        />
        <NostrAuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        <OnboardingGuide
          isOpen={isOnboardingOpen && !isAuthModalOpen}
          isMobile={isMobile}
          initialSection={onboardingInitialSection}
          sections={onboardingSections}
          stepsBySection={onboardingStepsBySection}
          onClose={handleCloseGuide}
          onComplete={handleCompleteGuide}
          onActiveSectionChange={setActiveOnboardingSection}
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
        people={people}
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
      <div className="min-w-0 overflow-hidden" {...desktopSwipeHandlers}>
        {renderView()}
      </div>
      
      
      {/* Keyboard Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp isOpen={shortcutsHelp.isOpen} onClose={shortcutsHelp.close} />
      
      {/* Nostr Auth Modal */}
      <NostrAuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <OnboardingGuide
        isOpen={isOnboardingOpen && !isAuthModalOpen}
        isMobile={isMobile}
        initialSection={onboardingInitialSection}
        sections={onboardingSections}
        stepsBySection={onboardingStepsBySection}
        onClose={handleCloseGuide}
        onComplete={handleCompleteGuide}
        onActiveSectionChange={setActiveOnboardingSection}
      />
    </div>
  );
};

export default Index;
