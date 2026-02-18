import { useState, useCallback, useRef, useEffect } from "react";
import { MobileNav, MobileViewType } from "./MobileNav";
import { MobileFilters } from "./MobileFilters";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import { SwipeIndicator } from "./SwipeIndicator";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { FocusedTaskBreadcrumb } from "@/components/tasks/FocusedTaskBreadcrumb";
import { FailedPublishQueueBanner } from "@/components/tasks/FailedPublishQueueBanner";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useSwipeNavigation } from "@/hooks/use-swipe-navigation";
import type { FailedPublishDraft } from "@/lib/failed-publish-drafts";
import { Relay, Channel, Person, Task, TaskCreateResult, TaskDateType } from "@/types";
import { cn } from "@/lib/utils";
import { useNDK } from "@/lib/nostr/ndk-context";

interface MobileLayoutProps {
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  tasks: Task[];
  allTasks: Task[];
  searchQuery: string;
  focusedTaskId: string | null;
  currentUser?: Person;
  hasCachedCurrentUserProfileMetadata?: boolean;
  isSignedIn: boolean;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onSearchChange: (query: string) => void;
  onNewTask: (
    content: string,
    tags: string[],
    relays: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    parentId?: string,
    initialStatus?: "todo" | "in-progress" | "done",
    explicitMentionPubkeys?: string[],
    priority?: number
  ) => Promise<TaskCreateResult> | TaskCreateResult;
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
  onAuthorClick?: (author: Person) => void;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  failedPublishDrafts?: FailedPublishDraft[];
  onRetryFailedPublish?: (draftId: string) => void;
  onDismissFailedPublish?: (draftId: string) => void;
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
  hasCachedCurrentUserProfileMetadata = true,
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
  onAuthorClick,
  mentionRequest = null,
  failedPublishDrafts = [],
  onRetryFailedPublish,
  onDismissFailedPublish,
}: MobileLayoutProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(new Date());
  const [profileEditorOpenSignal, setProfileEditorOpenSignal] = useState(0);
  const [mobileView, setMobileView] = useState<MobileViewType>(
    isPrimaryMobileView(currentView) ? currentView : "tree"
  );
  const previousSignedInRef = useRef(isSignedIn);
  const { needsProfileSetup } = useNDK();

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
    onAuthorClick,
    mentionRequest,
  };

  const mobileCurrentView: MobileViewType = showFilters ? "filters" : mobileView;

  const handleMobileSubmit = useCallback((
    content: string,
    tags: string[],
    relayIds: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    explicitMentionPubkeys?: string[],
    priority?: number
  ): Promise<TaskCreateResult> => {
    return Promise.resolve(onNewTask(
      content,
      tags,
      relayIds,
      taskType,
      dueDate,
      dueTime,
      dateType,
      focusedTaskId || undefined,
      undefined,
      explicitMentionPubkeys,
      priority
    ));
  }, [onNewTask, focusedTaskId]);

  useEffect(() => {
    if (showFilters) return;
    setMobileView(isPrimaryMobileView(currentView) ? currentView : "tree");
  }, [currentView, showFilters]);

  useEffect(() => {
    const justSignedIn = !previousSignedInRef.current && isSignedIn;
    if (justSignedIn && (needsProfileSetup || !hasCachedCurrentUserProfileMetadata)) {
      setShowFilters(true);
      setMobileView("filters");
      setProfileEditorOpenSignal((previous) => previous + 1);
    }
    previousSignedInRef.current = isSignedIn;
  }, [isSignedIn, needsProfileSetup, hasCachedCurrentUserProfileMetadata]);

  const renderView = () => {
    if (showFilters) {
      return (
        <MobileFilters
          relays={relays}
          channels={channels}
          people={people}
          profileEditorOpenSignal={profileEditorOpenSignal}
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
        return <CalendarView {...viewProps} isMobile mobileView="upcoming" selectedDate={selectedCalendarDate} onSelectedDateChange={setSelectedCalendarDate} />;
      case "calendar":
        return <CalendarView {...viewProps} isMobile mobileView="calendar" selectedDate={selectedCalendarDate} onSelectedDateChange={setSelectedCalendarDate} />;
      default:
        return <TaskTree {...viewProps} isMobile />;
    }
  };

  return (
    <div className="flex flex-col h-screen h-[100svh] bg-background overflow-hidden">
      <MobileNav currentView={mobileCurrentView} onViewChange={handleMobileViewChange} />
      {onRetryFailedPublish && onDismissFailedPublish && (
        <FailedPublishQueueBanner
          drafts={failedPublishDrafts}
          onRetry={onRetryFailedPublish}
          onDismiss={onDismissFailedPublish}
          isMobile
        />
      )}
      
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
          {!showFilters && focusedTaskId && currentView !== "list" && currentView !== "calendar" && (
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
      
      {!showFilters && (
        <UnifiedBottomBar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          onSubmit={handleMobileSubmit}
          currentView={currentView}
          focusedTaskId={focusedTaskId}
          selectedCalendarDate={currentView === "calendar" ? selectedCalendarDate : null}
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
      )}
    </div>
  );
}
