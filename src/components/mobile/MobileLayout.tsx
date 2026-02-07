import { useState, useCallback, useRef } from "react";
import { MobileNav, MobileViewType } from "./MobileNav";
import { MobileFilters } from "./MobileFilters";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import { SwipeIndicator } from "./SwipeIndicator";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useSwipeNavigation } from "@/hooks/use-swipe-navigation";
import { Relay, Channel, Person, Task } from "@/types";
import { cn } from "@/lib/utils";

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
  onSignInClick: () => void;
}

// Mobile view order for swipe navigation
const mobileViews: ViewType[] = ["tree", "feed", "calendar"];

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
  onSignInClick,
}: MobileLayoutProps) {
  const [showFilters, setShowFilters] = useState(false);

  // Build default content from active channel filters
  const includedChannels = channels.filter(c => c.filterState === "included");
  const defaultContent = includedChannels.map(c => `#${c.name}`).join(" ");

  // Swipe navigation handlers
  const handleSwipeLeft = useCallback(() => {
    if (showFilters) {
      setShowFilters(false);
      return;
    }
    const currentIndex = mobileViews.indexOf(currentView);
    if (currentIndex < mobileViews.length - 1) {
      onViewChange(mobileViews[currentIndex + 1]);
    }
  }, [currentView, onViewChange, showFilters]);

  const handleSwipeRight = useCallback(() => {
    const currentIndex = mobileViews.indexOf(currentView);
    if (currentIndex > 0) {
      onViewChange(mobileViews[currentIndex - 1]);
    } else if (currentIndex === 0) {
      setShowFilters(true);
    }
  }, [currentView, onViewChange]);

  // Swipe animation state
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const animatedSwipeLeft = useCallback(() => {
    setSwipeDirection("left");
    setIsAnimating(true);
    setTimeout(() => {
      handleSwipeLeft();
      setIsAnimating(false);
      setSwipeDirection(null);
    }, 150);
  }, [handleSwipeLeft]);

  const animatedSwipeRight = useCallback(() => {
    setSwipeDirection("right");
    setIsAnimating(true);
    setTimeout(() => {
      handleSwipeRight();
      setIsAnimating(false);
      setSwipeDirection(null);
    }, 150);
  }, [handleSwipeRight]);

  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: animatedSwipeLeft,
    onSwipeRight: animatedSwipeRight,
    threshold: 60,
    enableHaptics: true,
  });

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
      
      {/* Swipe indicator */}
      <SwipeIndicator 
        views={mobileViews} 
        currentView={currentView} 
        showFilters={showFilters} 
      />
      
      <main 
        className="flex-1 overflow-hidden relative"
        {...swipeHandlers}
      >
        <div 
          className={cn(
            "h-full w-full transition-transform duration-150 ease-out",
            isAnimating && swipeDirection === "left" && "-translate-x-4 opacity-80",
            isAnimating && swipeDirection === "right" && "translate-x-4 opacity-80"
          )}
        >
          {renderView()}
        </div>
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
        isSignedIn={Boolean(currentUser)}
        onSignInClick={onSignInClick}
      />
    </div>
  );
}
