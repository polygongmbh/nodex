import { useState, useCallback, useRef, useEffect } from "react";
import { MobileNav, MobileViewType } from "./MobileNav";
import { MobileFilters } from "./MobileFilters";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import { SwipeIndicator } from "./SwipeIndicator";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { FocusedTaskBreadcrumb } from "@/components/tasks/FocusedTaskBreadcrumb";
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
  isSignedIn: boolean;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onSearchChange: (query: string) => void;
  onNewTask: (content: string, tags: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string, parentId?: string, initialStatus?: "todo" | "in-progress" | "done") => void;
  onToggleComplete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  onFocusTask: (taskId: string | null) => void;
  onRelayToggle: (id: string) => void;
  onChannelToggle: (id: string) => void;
  onPersonToggle: (id: string) => void;
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
  onSignInClick: () => void;
  onGuideClick: () => void;
  onHashtagClick: (tag: string) => void;
  forceComposeMode?: boolean;
}

// Mobile view order for swipe navigation
const mobileViews: MobileViewType[] = ["tree", "feed", "list", "calendar"];

const isPrimaryMobileView = (view: ViewType): view is "tree" | "feed" | "list" | "calendar" => {
  return view === "tree" || view === "feed" || view === "list" || view === "calendar";
};

export function MobileLayout({
  relays,
  channels,
  people,
  tasks,
  allTasks,
  searchQuery,
  focusedTaskId,
  currentUser,
  isSignedIn,
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
  onAddRelay,
  onRemoveRelay,
  onSignInClick,
  onGuideClick,
  onHashtagClick,
  forceComposeMode = false,
}: MobileLayoutProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [mobileView, setMobileView] = useState<MobileViewType>(
    isPrimaryMobileView(currentView) ? currentView : "tree"
  );

  // Build default content from active channel filters
  const includedChannels = channels.filter(c => c.filterState === "included");
  const defaultContent = includedChannels.map(c => `#${c.name}`).join(" ");

  const handleMobileViewChange = useCallback((view: MobileViewType) => {
    if (view === "filters") {
      setShowFilters(true);
      setMobileView("filters");
      return;
    }

    setShowFilters(false);
    setMobileView(view);
    onViewChange(view);
  }, [onViewChange]);

  // Swipe navigation handlers
  const handleSwipeLeft = useCallback(() => {
    if (showFilters) {
      setShowFilters(false);
      return;
    }
    const currentIndex = mobileViews.indexOf(mobileView);
    if (currentIndex < mobileViews.length - 1) {
      const nextView = mobileViews[currentIndex + 1];
      handleMobileViewChange(nextView);
    }
  }, [mobileView, showFilters, handleMobileViewChange]);

  const handleSwipeRight = useCallback(() => {
    const currentIndex = mobileViews.indexOf(mobileView);
    if (currentIndex > 0) {
      const prevView = mobileViews[currentIndex - 1];
      handleMobileViewChange(prevView);
    } else if (currentIndex === 0) {
      setShowFilters(true);
    }
  }, [mobileView, handleMobileViewChange]);

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
    onHashtagClick,
  };

  const mobileCurrentView: MobileViewType = showFilters ? "filters" : mobileView;

  useEffect(() => {
    if (showFilters) return;
    setMobileView(isPrimaryMobileView(currentView) ? currentView : "tree");
  }, [currentView, showFilters]);

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
          onAddRelay={onAddRelay}
          onRemoveRelay={onRemoveRelay}
          onSignInClick={onSignInClick}
          onGuideClick={onGuideClick}
        />
      );
    }
    switch (currentView) {
      case "tree":
        return <TaskTree {...viewProps} isMobile />;
      case "feed":
        return <FeedView {...viewProps} isMobile />;
      case "list":
        return <CalendarView {...viewProps} isMobile mobileView="upcoming" />;
      case "calendar":
        return <CalendarView {...viewProps} isMobile mobileView="calendar" />;
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
        currentView={mobileCurrentView} 
        showFilters={showFilters} 
      />
      
      <main 
        className="flex-1 overflow-hidden relative"
        {...swipeHandlers}
      >
        <div className="h-full flex flex-col">
          {!showFilters && focusedTaskId && (
            <FocusedTaskBreadcrumb
              allTasks={allTasks}
              focusedTaskId={focusedTaskId}
              onFocusTask={onFocusTask}
              className="h-10 px-3 text-xs"
            />
          )}
          <div 
            className={cn(
              "flex-1 min-h-0 w-full transition-transform duration-150 ease-out",
              isAnimating && swipeDirection === "left" && "-translate-x-4 opacity-80",
              isAnimating && swipeDirection === "right" && "translate-x-4 opacity-80"
            )}
          >
            {renderView()}
          </div>
        </div>
      </main>
      
      <UnifiedBottomBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onSubmit={onNewTask}
        currentView={currentView}
        focusedTaskId={focusedTaskId}
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={onRelayToggle}
        onChannelToggle={onChannelToggle}
        onPersonToggle={onPersonToggle}
        defaultContent={defaultContent}
        isSignedIn={isSignedIn}
        onSignInClick={onSignInClick}
        forceComposeMode={forceComposeMode}
      />
    </div>
  );
}
