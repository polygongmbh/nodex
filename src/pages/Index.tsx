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
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useNDK } from "@/lib/nostr/ndk-context";
import { NostrAuthModal, NostrUserMenu } from "@/components/auth/NostrAuthModal";
import { nostrEventToTask, eventHasTags, getRelayIdFromUrl, getRelayNameFromUrl, isSpamContent } from "@/lib/nostr/event-converter";
import { NostrEventKind } from "@/lib/nostr/types";
import { mockPeople, mockTasks, mockRelays as demoRelays } from "@/data/mockData";
import { Relay, Channel, Person, Task, TaskType } from "@/types";
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

  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(new Set([DEMO_RELAY_ID]));
  const [people, setPeople] = useState<Person[]>(
    mockPeople.map((p) => ({ ...p, isSelected: false }))
  );
  const [localTasks, setLocalTasks] = useState<Task[]>(mockTasks);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarFocused, setIsSidebarFocused] = useState(false);

  // Filter nostr events - only keep those with tags and not spam
  const filteredNostrEvents = useMemo(() => {
    return nostrEvents.filter(event => {
      // Convert NDKEvent to check tags
      const hasTags = event.tags.some(tag => tag[0] === "t" && tag[1]) ||
        /#\w+/.test(event.content);
      if (!hasTags) return false;
      // Filter out spam
      if (isSpamContent(event.content)) return false;
      return true;
    });
  }, [nostrEvents]);

  // Convert filtered Nostr events to tasks
  const nostrTasks: Task[] = useMemo(() => {
    return filteredNostrEvents.map((event) => {
      // Convert NDKEvent to a format nostrEventToTask expects
      const nostrEvent = {
        id: event.id || "",
        pubkey: event.pubkey,
        created_at: event.created_at || Math.floor(Date.now() / 1000),
        kind: event.kind as NostrEventKind,
        tags: event.tags,
        content: event.content,
        sig: event.sig || "",
        relayUrl: event.relay?.url || "unknown",
      };
      return nostrEventToTask(nostrEvent);
    });
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

  // Dynamically derive channels from all tasks - only show tags that appear 6+ times
  const channels: Channel[] = useMemo(() => {
    const tagCounts = new Map<string, number>();
    
    // Count tags from local tasks
    localTasks.forEach((task) => {
      task.tags.forEach((tag) => {
        const lower = tag.toLowerCase();
        tagCounts.set(lower, (tagCounts.get(lower) || 0) + 1);
      });
    });
    
    // Count tags from nostr events
    filteredNostrEvents.forEach((event) => {
      // Extract t tags
      event.tags
        .filter((tag) => tag[0] === "t" && tag[1])
        .forEach((tag) => {
          const lower = tag[1].toLowerCase();
          tagCounts.set(lower, (tagCounts.get(lower) || 0) + 1);
        });
      // Extract hashtags from content
      const hashtagRegex = /#(\w+)/g;
      let match;
      while ((match = hashtagRegex.exec(event.content)) !== null) {
        const lower = match[1].toLowerCase();
        tagCounts.set(lower, (tagCounts.get(lower) || 0) + 1);
      }
    });
    
    // Filter to only include tags appearing 6+ times, then sort
    return Array.from(tagCounts.entries())
      .filter(([_, count]) => count >= 6)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name]) => ({
        id: name,
        name,
        filterState: "neutral" as const,
      }));
  }, [localTasks, filteredNostrEvents]);

  // Maintain channel filter states across dynamic updates
  const [channelFilterStates, setChannelFilterStates] = useState<Map<string, Channel["filterState"]>>(new Map());

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

    // Subscribe to text notes (kind 1) and tasks (kind 1621)
    const subscription = subscribe(
      [{ kinds: [1, 1621 as any], limit: 50 }],
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

  const handleFocusSidebar = useCallback(() => {
    setIsSidebarFocused(true);
  }, []);

  const handleFocusTasks = useCallback(() => {
    setIsSidebarFocused(false);
  }, []);

  // Derive focused task from URL
  const focusedTaskId = urlTaskId || null;

  const isMobile = useIsMobile();
  const currentUser = people.find(p => p.id === "me");
  const shortcutsHelp = useKeyboardShortcutsHelp();

  // Handle view change - update URL
  const setCurrentView = useCallback((newView: ViewType) => {
    if (focusedTaskId) {
      navigate(`/${newView}/${focusedTaskId}`);
    } else {
      navigate(`/${newView}`);
    }
  }, [navigate, focusedTaskId]);

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

  const handlePersonToggle = (id: string) => {
    setPeople((prev) =>
      prev.map((person) =>
        person.id === id ? { ...person, isSelected: !person.isSelected } : person
      )
    );
  };

  const handleToggleAllPeople = () => {
    const allSelected = people.every((p) => p.isSelected);
    setPeople((prev) => prev.map((person) => ({ ...person, isSelected: !allSelected })));
    toast.success(allSelected ? "All people deselected" : "All people selected");
  };

  const handleToggleComplete = (taskId: string) => {
    if (!user) {
      setIsAuthModalOpen(true);
      toast.error("Sign in required to modify tasks");
      return;
    }

    setLocalTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;
        
        const currentStatus = task.status || "todo";
        let nextStatus: "todo" | "in-progress" | "done";
        let completedBy: string | undefined = task.completedBy;
        
        if (currentStatus === "todo") {
          nextStatus = "in-progress";
        } else if (currentStatus === "in-progress") {
          nextStatus = "done";
          completedBy = currentUser?.name;
        } else {
          nextStatus = "todo";
          completedBy = undefined;
        }
        
        return { ...task, status: nextStatus, completedBy };
      })
    );
  };

  const handleStatusChange = (taskId: string, newStatus: "todo" | "in-progress" | "done") => {
    if (!user) {
      setIsAuthModalOpen(true);
      toast.error("Sign in required to modify tasks");
      return;
    }

    setLocalTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;
        return { 
          ...task, 
          status: newStatus, 
          completedBy: newStatus === "done" ? currentUser?.name : undefined 
        };
      })
    );
  };

  const handleNewTask = async (content: string, extractedTags: string[], relayIds: string[], taskType: string, dueDate?: Date, dueTime?: string, parentId?: string) => {
    if (!user) {
      setIsAuthModalOpen(true);
      toast.error("Sign in required to post");
      return;
    }

    const requestedRelayIds = relayIds.length > 0 ? relayIds : [DEMO_RELAY_ID];
    const hasNonDemoRelay = requestedRelayIds.some((id) => id !== DEMO_RELAY_ID);
    
    const selectedRelayUrls = relays
      .filter((r) => requestedRelayIds.includes(r.id))
      .map((r) => r.url)
      .filter((url): url is string => Boolean(url));
    
    const shouldPublish = hasNonDemoRelay && selectedRelayUrls.length > 0;
    
    let publishSuccess = false;
    if (shouldPublish) {
      console.log("Publishing event to relays:", selectedRelayUrls);
      const kind = taskType === "task" ? NostrEventKind.Task : NostrEventKind.TextNote;
      publishSuccess = await publishEvent(kind, content, [], parentId, selectedRelayUrls);
    }
    
    const effectiveRelayIds = selectedRelayUrls.length > 0
      ? selectedRelayUrls.map((url) => getRelayIdFromUrl(url))
      : requestedRelayIds;
    
    const newTask: Task = {
      id: Date.now().toString(),
      author: people.find((p) => p.id === "me") || people[0],
      content,
      tags: extractedTags,
      relays: effectiveRelayIds.length > 0 ? effectiveRelayIds : [DEMO_RELAY_ID],
      taskType: taskType as TaskType,
      timestamp: new Date(),
      likes: 0,
      replies: 0,
      reposts: 0,
      dueDate,
      dueTime,
      parentId,
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

  // Build relays with active state for sidebar display
  const relaysWithActiveState: Relay[] = useMemo(() => {
    return relays.map((r) => ({
      ...r,
      isActive: activeRelayIds.has(r.id),
    }));
  }, [relays, activeRelayIds]);

  // Check if any channel filters are active
  const hasActiveChannelFilters = channelsWithState.some(c => c.filterState !== "neutral");

  // Filter tasks based on active filters
  const filteredTasks = allTasks.filter((task) => {
    // Relay filter - if any relay is selected, task must be in one of the selected relays
    if (activeRelayIds.size > 0 && !task.relays.some(tr => activeRelayIds.has(tr))) {
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
    onSignInClick: () => setIsAuthModalOpen(true),
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
          onSignInClick={() => setIsAuthModalOpen(true)}
        />
        <NostrAuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
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
        <div className="h-full flex items-stretch justify-end w-24 sm:w-36 lg:w-40">
          <NostrUserMenu onSignInClick={() => setIsAuthModalOpen(true)} />
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
        onToggleAllRelays={handleToggleAllRelays}
        onToggleAllChannels={handleToggleAllChannels}
        onToggleAllPeople={handleToggleAllPeople}
        onAddRelay={addRelay}
        onRemoveRelay={removeRelay}
        isFocused={isSidebarFocused}
        onFocusTasks={handleFocusTasks}
        onShortcutsClick={shortcutsHelp.open}
      />
      <div className="min-w-0 overflow-hidden">
        {renderView()}
      </div>
      
      
      {/* Keyboard Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp isOpen={shortcutsHelp.isOpen} onClose={shortcutsHelp.close} />
      
      {/* Nostr Auth Modal */}
      <NostrAuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
};

export default Index;
