import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { KanbanView } from "@/components/tasks/KanbanView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { ListView } from "@/components/tasks/ListView";
import { ViewSwitcher, ViewType } from "@/components/tasks/ViewSwitcher";
import { RightSidebar } from "@/components/widgets/RightSidebar";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp, KeyboardShortcutsButton } from "@/components/KeyboardShortcutsHelp";
import { useNostr } from "@/hooks/use-nostr";
import { nostrEventToTask, eventHasTags, extractAllTags, getRelayIdFromUrl, getRelayNameFromUrl } from "@/lib/nostr/event-converter";
import { NostrEventKind } from "@/lib/nostr/types";
import { mockPeople, mockTasks, mockRelays as demoRelays } from "@/data/mockData";
import { Relay, Channel, Person, Task, TaskType } from "@/types";
import { toast } from "sonner";

const validViews: ViewType[] = ["tree", "feed", "kanban", "calendar", "list"];

// Default Nostr relays
const DEFAULT_NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
];

// Demo relay constant
const DEMO_RELAY_ID = "demo";

const Index = () => {
  const { view: urlView, taskId: urlTaskId } = useParams<{ view: string; taskId: string }>();
  const navigate = useNavigate();

  // Derive current view from URL
  const currentView: ViewType = validViews.includes(urlView as ViewType) 
    ? (urlView as ViewType) 
    : "tree";

  // Nostr integration
  const { 
    relays: nostrRelays, 
    events: nostrEvents, 
    isConnected: isNostrConnected,
    addRelay,
    removeRelay,
    subscribe,
  } = useNostr({ defaultRelays: DEFAULT_NOSTR_RELAYS });

  // Convert relay URLs to app Relay format - combine demo relay with nostr relays
  const relays: Relay[] = useMemo(() => {
    const nostrRelayItems = nostrRelays.map((r) => ({
      id: getRelayIdFromUrl(r.url),
      name: getRelayNameFromUrl(r.url),
      icon: "radio",
      isActive: r.status === "connected",
      postCount: undefined,
    }));
    
    // Include demo relay
    return [...demoRelays, ...nostrRelayItems];
  }, [nostrRelays]);

  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(new Set([DEMO_RELAY_ID]));
  const [people, setPeople] = useState<Person[]>(
    mockPeople.map((p) => ({ ...p, isSelected: false }))
  );
  const [localTasks, setLocalTasks] = useState<Task[]>(mockTasks);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarFocused, setIsSidebarFocused] = useState(false);

  // Filter nostr events - only keep those with tags
  const filteredNostrEvents = useMemo(() => {
    return nostrEvents.filter(eventHasTags);
  }, [nostrEvents]);

  // Convert filtered Nostr events to tasks
  const nostrTasks: Task[] = useMemo(() => {
    return filteredNostrEvents.map((event) => nostrEventToTask(event));
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
    const unsubscribe = subscribe([
      { kinds: [NostrEventKind.TextNote, NostrEventKind.Task], limit: 50 },
    ]);

    return unsubscribe;
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

  const handleNewTask = (content: string, extractedTags: string[], relayIds: string[], taskType: string, dueDate?: Date, dueTime?: string, parentId?: string) => {
    const newTask: Task = {
      id: Date.now().toString(),
      author: people.find((p) => p.id === "me") || people[0],
      content,
      tags: extractedTags,
      relays: relayIds.length > 0 ? relayIds : [DEMO_RELAY_ID],
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
    toast.success(taskType === "comment" ? "Comment added!" : "Task created!");
  };

  // Build relays with active state for sidebar display
  const relaysWithActiveState: Relay[] = useMemo(() => {
    return relays.map((r) => ({
      ...r,
      isActive: activeRelayIds.has(r.id),
    }));
  }, [relays, activeRelayIds]);

  // Filter tasks based on active filters
  const filteredTasks = allTasks.filter((task) => {
    // Relay filter - if any relay is selected, task must be in one of the selected relays
    if (activeRelayIds.size > 0 && !task.relays.some(tr => activeRelayIds.has(tr))) {
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
      />
    );
  }

  // Desktop layout
  return (
    <div className="flex h-screen overflow-hidden bg-background">
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
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* View Switcher Header - height matches sidebar logo */}
        <div className="h-14 border-b border-border px-4 bg-background/95 backdrop-blur-sm flex items-center justify-between flex-shrink-0">
          <div className="w-8" /> {/* Spacer for centering */}
          <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} />
          <KeyboardShortcutsButton onClick={shortcutsHelp.open} />
        </div>
        {/* Current View */}
        <div className="flex-1 overflow-hidden">
          {renderView()}
        </div>
      </div>
      
      {/* Right Sidebar with Relay Management */}
      <RightSidebar
        nostrRelays={nostrRelays}
        onAddRelay={addRelay}
        onRemoveRelay={removeRelay}
      />
      
      {/* Keyboard Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp isOpen={shortcutsHelp.isOpen} onClose={shortcutsHelp.close} />
    </div>
  );
};

export default Index;
