import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
import {
  Relay,
  Channel,
  ChannelMatchMode,
  Person,
  Task,
  TaskCreateResult,
  OnNewTask,
  TaskDateType,
  ComposeRestoreRequest,
  PublishedAttachment,
  Nip99Metadata,
} from "@/types";
import { cn } from "@/lib/utils";
import { useNDK } from "@/lib/nostr/ndk-context";
import { taskMatchesTextQuery } from "@/lib/task-text-filter";
import { useTranslation } from "react-i18next";

interface MobileLayoutProps {
  relays: Relay[];
  channels: Channel[];
  channelMatchMode?: ChannelMatchMode;
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
  onNewTask: OnNewTask;
  onToggleComplete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  onFocusTask: (taskId: string | null) => void;
  onRelayToggle: (id: string) => void;
  onChannelToggle: (id: string) => void;
  onPersonToggle: (id: string) => void;
  onChannelMatchModeChange?: (mode: ChannelMatchMode) => void;
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
  onSignInClick: () => void;
  onGuideClick: () => void;
  completionSoundEnabled?: boolean;
  onToggleCompletionSound?: () => void;
  onHashtagClick: (tag: string) => void;
  forceComposeMode?: boolean;
  onAuthorClick?: (author: Person) => void;
  onUndoPendingPublish?: (taskId: string) => void;
  isPendingPublishTask?: (taskId: string) => boolean;
  composeRestoreRequest?: ComposeRestoreRequest | null;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  failedPublishDrafts?: FailedPublishDraft[];
  onRetryFailedPublish?: (draftId: string) => void;
  onDismissFailedPublish?: (draftId: string) => void;
  isInteractionBlocked?: boolean;
  onInteractionBlocked?: () => void;
  isOnboardingOpen?: boolean;
  activeOnboardingStepId?: string | null;
  isManageRouteActive?: boolean;
  onManageRouteChange?: (isActive: boolean) => void;
}

// Mobile view order for swipe navigation
const mobileViews: MobileViewType[] = ["tree", "feed", "list", "calendar"];

const isPrimaryMobileView = (view: ViewType): view is "tree" | "feed" | "list" | "calendar" => {
  return view === "tree" || view === "feed" || view === "list" || view === "calendar";
};

export function MobileLayout({
  relays,
  channels,
  channelMatchMode = "and",
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
  onChannelMatchModeChange = () => {},
  onAddRelay,
  onRemoveRelay,
  onSignInClick,
  onGuideClick,
  completionSoundEnabled = true,
  onToggleCompletionSound = () => {},
  onHashtagClick,
  forceComposeMode = false,
  onAuthorClick,
  onUndoPendingPublish,
  isPendingPublishTask,
  composeRestoreRequest = null,
  mentionRequest = null,
  failedPublishDrafts = [],
  onRetryFailedPublish,
  onDismissFailedPublish,
  isInteractionBlocked = false,
  onInteractionBlocked,
  isOnboardingOpen = false,
  activeOnboardingStepId = null,
  isManageRouteActive = false,
  onManageRouteChange = () => {},
}: MobileLayoutProps) {
  const { t } = useTranslation();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(new Date());
  const [profileEditorOpenSignal, setProfileEditorOpenSignal] = useState(0);
  const previousSignedInRef = useRef(isSignedIn);
  const lastHandledGuideStepIdRef = useRef<string | null>(null);
  const { needsProfileSetup } = useNDK();
  const activePrimaryView: MobileViewType = isPrimaryMobileView(currentView) ? currentView : "tree";

  // Build default content from active channel filters
  const includedChannels = channels.filter(c => c.filterState === "included");
  const defaultContent = includedChannels.map(c => `#${c.name}`).join(" ");

  const openManageView = useCallback(() => {
    setShowFilters(true);
    onManageRouteChange(true);
  }, [onManageRouteChange]);

  const closeManageView = useCallback((nextView?: ViewType) => {
    setShowFilters(false);
    if (nextView) {
      onViewChange(nextView);
    }
    onManageRouteChange(false);
  }, [onManageRouteChange, onViewChange]);

  const handleMobileViewChange = useCallback((view: MobileViewType) => {
    if (view === "filters") {
      openManageView();
      return;
    }
    if (showFilters) {
      closeManageView(view);
      return;
    }
    onViewChange(view);
  }, [closeManageView, onViewChange, openManageView, showFilters]);

  // Swipe navigation handlers
  const handleSwipeLeft = useCallback(() => {
    if (showFilters) {
      closeManageView();
      return;
    }
    const currentIndex = mobileViews.indexOf(activePrimaryView);
    if (currentIndex < mobileViews.length - 1) {
      const nextView = mobileViews[currentIndex + 1];
      handleMobileViewChange(nextView);
    }
  }, [activePrimaryView, showFilters, handleMobileViewChange, closeManageView]);

  const handleSwipeRight = useCallback(() => {
    const currentIndex = mobileViews.indexOf(activePrimaryView);
    if (currentIndex > 0) {
      const prevView = mobileViews[currentIndex - 1];
      handleMobileViewChange(prevView);
    } else if (currentIndex === 0) {
      openManageView();
    }
  }, [activePrimaryView, handleMobileViewChange, openManageView]);

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
    channelMatchMode,
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
    onUndoPendingPublish,
    isPendingPublishTask,
    mentionRequest,
    isInteractionBlocked,
    onInteractionBlocked,
  };

  const mobileCurrentView: MobileViewType = showFilters ? "filters" : activePrimaryView;
  const hasSearchQuery = searchQuery.trim().length > 0;
  const hasQuickFilterMatch = useMemo(() => {
    if (!hasSearchQuery) return true;
    return tasks.some((task) => taskMatchesTextQuery(task, searchQuery, people));
  }, [hasSearchQuery, tasks, searchQuery, people]);
  const isQuickFilterFallbackActive = !showFilters && hasSearchQuery && !hasQuickFilterMatch;
  const effectiveSearchQuery = isQuickFilterFallbackActive ? "" : searchQuery;

  const handleMobileSubmit = useCallback((
    content: string,
    tags: string[],
    relayIds: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    explicitMentionPubkeys?: string[],
    priority?: number,
    attachments?: PublishedAttachment[],
    nip99?: Nip99Metadata,
    locationGeohash?: string
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
      priority,
      attachments,
      nip99,
      locationGeohash
    ));
  }, [onNewTask, focusedTaskId]);

  useEffect(() => {
    if (isManageRouteActive) {
      setShowFilters(true);
      return;
    }
    setShowFilters(false);
  }, [isManageRouteActive]);

  useEffect(() => {
    if (!isOnboardingOpen || !activeOnboardingStepId) {
      lastHandledGuideStepIdRef.current = null;
      return;
    }
    if (lastHandledGuideStepIdRef.current === activeOnboardingStepId) {
      return;
    }
    lastHandledGuideStepIdRef.current = activeOnboardingStepId;

    if (activeOnboardingStepId === "mobile-filters-properties") {
      openManageView();
      setProfileEditorOpenSignal((previous) => previous + 1);
      return;
    }

    if (activeOnboardingStepId === "mobile-compose-combobox") {
      closeManageView("feed");
    }
  }, [activeOnboardingStepId, isOnboardingOpen, closeManageView, openManageView]);

  useEffect(() => {
    const justSignedIn = !previousSignedInRef.current && isSignedIn;
    if (justSignedIn && (needsProfileSetup || !hasCachedCurrentUserProfileMetadata)) {
      openManageView();
      setProfileEditorOpenSignal((previous) => previous + 1);
    }
    previousSignedInRef.current = isSignedIn;
  }, [isSignedIn, needsProfileSetup, hasCachedCurrentUserProfileMetadata, openManageView]);

  const renderView = () => {
    const effectiveViewProps = {
      ...viewProps,
      searchQuery: effectiveSearchQuery,
    };
    if (showFilters) {
      return (
        <MobileFilters
          relays={relays}
          channels={channels}
          channelMatchMode={channelMatchMode}
          people={people}
          profileEditorOpenSignal={profileEditorOpenSignal}
          onRelayToggle={onRelayToggle}
          onChannelToggle={onChannelToggle}
          onPersonToggle={onPersonToggle}
          onChannelMatchModeChange={onChannelMatchModeChange}
          onAddRelay={onAddRelay}
          onRemoveRelay={onRemoveRelay}
          onSignInClick={onSignInClick}
          onGuideClick={onGuideClick}
          completionSoundEnabled={completionSoundEnabled}
          onToggleCompletionSound={onToggleCompletionSound}
        />
      );
    }
    switch (activePrimaryView) {
      case "tree":
        return <TaskTree {...effectiveViewProps} isMobile />;
      case "feed":
        return <FeedView {...effectiveViewProps} isMobile />;
      case "list":
        return <CalendarView {...effectiveViewProps} isMobile mobileView="upcoming" selectedDate={selectedCalendarDate} onSelectedDateChange={setSelectedCalendarDate} />;
      case "calendar":
        return <CalendarView {...effectiveViewProps} isMobile mobileView="calendar" selectedDate={selectedCalendarDate} onSelectedDateChange={setSelectedCalendarDate} />;
      default:
        return <TaskTree {...effectiveViewProps} isMobile />;
    }
  };

  return (
    <div className="flex flex-col app-shell-height bg-background overflow-hidden">
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
          {isQuickFilterFallbackActive && (
            <div className="px-3 pt-2 pb-1 text-xs leading-none text-muted-foreground" data-testid="mobile-quick-filter-fallback">
              {t("tasks.empty.mobileQuickFilterFallback")}
            </div>
          )}
          {!showFilters && focusedTaskId && activePrimaryView !== "list" && activePrimaryView !== "calendar" && (
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
      
      <div hidden={showFilters} data-testid="mobile-compose-bar">
        <UnifiedBottomBar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          onSubmit={handleMobileSubmit}
          currentView={activePrimaryView}
          focusedTaskId={focusedTaskId}
          selectedCalendarDate={activePrimaryView === "calendar" ? selectedCalendarDate : null}
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
          composeRestoreRequest={composeRestoreRequest}
        />
      </div>
    </div>
  );
}
