import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { KanbanView } from "@/components/tasks/KanbanView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { ListView } from "@/components/tasks/ListView";
import { ViewSwitcher, ViewType } from "@/components/tasks/ViewSwitcher";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp, KeyboardShortcutsButton } from "@/components/KeyboardShortcutsHelp";
import { mockRelays, mockChannels, mockPeople, mockTasks } from "@/data/mockData";
import { Relay, Channel, Person, Task, TaskType } from "@/types";
import { toast } from "sonner";

const validViews: ViewType[] = ["tree", "feed", "kanban", "calendar", "list"];

const Index = () => {
  const { view: urlView, taskId: urlTaskId } = useParams<{ view: string; taskId: string }>();
  const navigate = useNavigate();

  // Derive current view from URL
  const currentView: ViewType = validViews.includes(urlView as ViewType) 
    ? (urlView as ViewType) 
    : "tree";

  const [relays, setRelays] = useState<Relay[]>(
    mockRelays.map((r) => ({ ...r, isActive: false }))
  );
  const [channels, setChannels] = useState<Channel[]>(
    mockChannels.map((c) => ({ ...c, filterState: "neutral" as const }))
  );
  const [people, setPeople] = useState<Person[]>(
    mockPeople.map((p) => ({ ...p, isSelected: false }))
  );
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [searchQuery, setSearchQuery] = useState("");

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
    setRelays((prev) =>
      prev.map((relay) =>
        relay.id === id ? { ...relay, isActive: !relay.isActive } : relay
      )
    );
    const relay = relays.find((r) => r.id === id);
    toast.success(`${relay?.name} relay ${relay?.isActive ? "disabled" : "enabled"}`);
  };

  const handleRelayExclusive = (id: string) => {
    setRelays((prev) =>
      prev.map((relay) => ({
        ...relay,
        isActive: relay.id === id,
      }))
    );
    const relay = relays.find((r) => r.id === id);
    toast.success(`Showing only ${relay?.name} relay`);
  };

  const handleToggleAllRelays = () => {
    const allActive = relays.every((r) => r.isActive);
    setRelays((prev) => prev.map((relay) => ({ ...relay, isActive: !allActive })));
    toast.success(allActive ? "All relays disabled" : "All relays enabled");
  };

  const handleChannelToggle = (id: string) => {
    setChannels((prev) =>
      prev.map((channel) => {
        if (channel.id !== id) return channel;
        const states: Channel["filterState"][] = ["neutral", "included", "excluded"];
        const currentIndex = states.indexOf(channel.filterState);
        const nextState = states[(currentIndex + 1) % states.length];
        return { ...channel, filterState: nextState };
      })
    );
  };

  const handleChannelExclusive = (id: string) => {
    setChannels((prev) =>
      prev.map((channel) => ({
        ...channel,
        filterState: channel.id === id ? "included" : "neutral",
      }))
    );
    const channel = channels.find((c) => c.id === id);
    toast.success(`Showing only #${channel?.name}`);
  };

  const handleToggleAllChannels = () => {
    const allNeutral = channels.every((c) => c.filterState === "neutral");
    setChannels((prev) =>
      prev.map((channel) => ({
        ...channel,
        filterState: allNeutral ? "included" : "neutral",
      }))
    );
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
    setTasks((prev) =>
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
    setTasks((prev) =>
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
      relays: relayIds.length > 0 ? relayIds : [relays[0]?.id].filter(Boolean),
      taskType: taskType as TaskType,
      timestamp: new Date(),
      likes: 0,
      replies: 0,
      reposts: 0,
      dueDate,
      dueTime,
      parentId,
    };
    setTasks((prev) => [newTask, ...prev]);
    toast.success(taskType === "comment" ? "Comment added!" : "Task created!");
  };

  // Filter tasks based on active filters
  const filteredTasks = tasks.filter((task) => {
    // Relay filter
    const activeRelayIds = relays.filter((r) => r.isActive).map((r) => r.id);
    if (activeRelayIds.length > 0 && !task.relays.some(tr => activeRelayIds.includes(tr))) {
      return false;
    }

    // Person filter - filter by selected people (task author must be one of selected people)
    const selectedPeopleIds = people.filter((p) => p.isSelected).map((p) => p.id);
    if (selectedPeopleIds.length > 0 && !selectedPeopleIds.includes(task.author.id)) {
      return false;
    }

    // Channel exclusion filter - exclude tasks that have any excluded channels
    const excludedChannelNames = channels.filter((c) => c.filterState === "excluded").map((c) => c.name.toLowerCase());
    if (excludedChannelNames.length > 0) {
      const taskTagsLower = task.tags.map(t => t.toLowerCase());
      if (taskTagsLower.some(t => excludedChannelNames.includes(t))) {
        return false;
      }
    }

    // Channel inclusion filter - AND logic: task must have ALL included channels
    const includedChannelNames = channels.filter((c) => c.filterState === "included").map((c) => c.name.toLowerCase());
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
    allTasks: tasks,
    relays,
    channels,
    people,
    currentUser,
    searchQuery,
    onSearchChange: setSearchQuery,
    onNewTask: handleNewTask,
    onToggleComplete: handleToggleComplete,
    focusedTaskId,
    onFocusTask: setFocusedTaskId,
    onStatusChange: handleStatusChange,
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
        relays={relays}
        channels={channels}
        people={people}
        tasks={filteredTasks}
        allTasks={tasks}
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
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={handleRelayToggle}
        onRelayExclusive={handleRelayExclusive}
        onChannelToggle={handleChannelToggle}
        onChannelExclusive={handleChannelExclusive}
        onPersonToggle={handlePersonToggle}
        onToggleAllRelays={handleToggleAllRelays}
        onToggleAllChannels={handleToggleAllChannels}
        onToggleAllPeople={handleToggleAllPeople}
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
      
      {/* Keyboard Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp isOpen={shortcutsHelp.isOpen} onClose={shortcutsHelp.close} />
    </div>
  );
};

export default Index;
