import { useState } from "react";
import { MobileNav, MobileViewType } from "./MobileNav";
import { MobileFilters } from "./MobileFilters";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { Relay, Tag, Person, Task } from "@/types";

interface MobileLayoutProps {
  relays: Relay[];
  tags: Tag[];
  people: Person[];
  tasks: Task[];
  allTasks: Task[];
  searchQuery: string;
  focusedTaskId: string | null;
  currentUser?: Person;
  onSearchChange: (query: string) => void;
  onNewTask: (content: string, tags: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string, parentId?: string) => void;
  onToggleComplete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  onFocusTask: (taskId: string | null) => void;
  onRelayToggle: (id: string) => void;
  onTagToggle: (id: string) => void;
  onPersonToggle: (id: string) => void;
}

export function MobileLayout({
  relays,
  tags,
  people,
  tasks,
  allTasks,
  searchQuery,
  focusedTaskId,
  currentUser,
  onSearchChange,
  onNewTask,
  onToggleComplete,
  onStatusChange,
  onFocusTask,
  onRelayToggle,
  onTagToggle,
  onPersonToggle,
}: MobileLayoutProps) {
  const [currentView, setCurrentView] = useState<MobileViewType>("tree");

  // Build default content from active tag filters
  const includedTags = tags.filter(t => t.filterState === "included");
  const defaultContent = includedTags.map(t => `#${t.name}`).join(" ");

  const viewProps = {
    tasks,
    allTasks,
    relays,
    tags,
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

  const renderView = () => {
    switch (currentView) {
      case "filters":
        return (
          <MobileFilters
            relays={relays}
            tags={tags}
            people={people}
            onRelayToggle={onRelayToggle}
            onTagToggle={onTagToggle}
            onPersonToggle={onPersonToggle}
          />
        );
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
      <MobileNav currentView={currentView} onViewChange={setCurrentView} />
      
      <main className="flex-1 overflow-hidden">
        {renderView()}
      </main>
      
      <UnifiedBottomBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onSubmit={onNewTask}
        relays={relays}
        tags={tags}
        people={people}
        onRelayToggle={onRelayToggle}
        onTagToggle={onTagToggle}
        onPersonToggle={onPersonToggle}
        defaultContent={defaultContent}
      />
    </div>
  );
}
