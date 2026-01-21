import { useState } from "react";
import { MobileNav, MobileViewType } from "./MobileNav";
import { MobileFilters } from "./MobileFilters";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { Relay, Channel, Person, Task } from "@/types";

interface MobileLayoutProps {
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  tasks: Task[];
  allTasks: Task[];
  searchQuery: string;
  focusedTaskId: string | null;
  currentUser?: Person;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onSearchChange: (query: string) => void;
  onNewTask: (content: string, tags: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string, parentId?: string) => void;
  onToggleComplete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  onFocusTask: (taskId: string | null) => void;
  onRelayToggle: (id: string) => void;
  onChannelToggle: (id: string) => void;
  onPersonToggle: (id: string) => void;
}

export function MobileLayout({
  relays,
  channels,
  people,
  tasks,
  allTasks,
  searchQuery,
  focusedTaskId,
  currentUser,
  currentView,
  onViewChange,
  onSearchChange,
  onNewTask,
  onToggleComplete,
  onStatusChange,
  onFocusTask,
  onRelayToggle,
  onChannelToggle,
  onPersonToggle,
}: MobileLayoutProps) {
  const [showFilters, setShowFilters] = useState(false);

  // Build default content from active channel filters
  const includedChannels = channels.filter(c => c.filterState === "included");
  const defaultContent = includedChannels.map(c => `#${c.name}`).join(" ");

  const viewProps = {
    tasks,
    allTasks,
    relays,
    channels,
    people,
    currentUser,
    searchQuery,
    onSearchChange,
    onNewTask,
    onToggleComplete,
    focusedTaskId,
    onFocusTask,
    onStatusChange,
  };

  const handleMobileViewChange = (view: MobileViewType) => {
    if (view === "filters") {
      setShowFilters(true);
    } else {
      setShowFilters(false);
      onViewChange(view);
    }
  };

  const mobileCurrentView: MobileViewType = showFilters ? "filters" : currentView;

  const renderView = () => {
    if (showFilters) {
      return (
        <MobileFilters
          relays={relays}
          channels={channels}
          people={people}
          onRelayToggle={onRelayToggle}
          onChannelToggle={onChannelToggle}
          onPersonToggle={onPersonToggle}
        />
      );
    }
    switch (currentView) {
      case "tree":
        return <TaskTree {...viewProps} isMobile />;
      case "feed":
        return <FeedView {...viewProps} isMobile />;
      case "calendar":
        return <CalendarView {...viewProps} isMobile />;
      default:
        return <TaskTree {...viewProps} isMobile />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <MobileNav currentView={mobileCurrentView} onViewChange={handleMobileViewChange} />
      
      <main className="flex-1 overflow-hidden">
        {renderView()}
      </main>
      
      <UnifiedBottomBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onSubmit={onNewTask}
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={onRelayToggle}
        onChannelToggle={onChannelToggle}
        onPersonToggle={onPersonToggle}
        defaultContent={defaultContent}
      />
    </div>
  );
}
