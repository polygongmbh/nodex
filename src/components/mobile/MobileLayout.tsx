import { Suspense, lazy, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { MobileNav, MobileViewType } from "./MobileNav";
import { MobileFilters } from "./MobileFilters";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import { SwipeIndicator } from "./SwipeIndicator";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FocusedTaskBreadcrumb } from "@/components/tasks/FocusedTaskBreadcrumb";
import { HydrationStatusRow } from "@/components/tasks/HydrationStatusRow";
import { FailedPublishQueueBanner } from "@/components/tasks/FailedPublishQueueBanner";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useSwipeNavigation } from "@/hooks/use-swipe-navigation";
import type { FailedPublishDraft } from "@/infrastructure/preferences/failed-publish-drafts-storage";
import {
  Relay,
  Channel,
  ChannelMatchMode,
  Person,
  TaskCreateResult,
  TaskDateType,
  ComposeRestoreRequest,
  PublishedAttachment,
  Nip99Metadata,
} from "@/types";
import { cn } from "@/lib/utils";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { taskMatchesTextQuery } from "@/domain/content/task-text-filter";
import { useTranslation } from "react-i18next";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

export interface MobileLayoutViewState {
  relays: Relay[];
  channels: Channel[];
  channelMatchMode?: ChannelMatchMode;
  people: Person[];
  hasCachedCurrentUserProfileMetadata?: boolean;
  isSignedIn: boolean;
  currentView: ViewType;
  isOnboardingOpen?: boolean;
  activeOnboardingStepId?: string | null;
  isManageRouteActive?: boolean;
}

export interface MobileLayoutActions {
  onViewChange: (view: ViewType) => void;
  onManageRouteChange?: (isActive: boolean) => void;
}

export interface MobileLayoutComposerState {
  forceComposeMode?: boolean;
  composeRestoreRequest?: ComposeRestoreRequest | null;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
}

export interface MobileLayoutPublishState {
  isPendingPublishTask?: (taskId: string) => boolean;
  failedPublishDrafts?: FailedPublishDraft[];
  visibleFailedPublishDrafts?: FailedPublishDraft[];
  selectedPublishableRelayIds?: string[];
}

interface MobileLayoutProps {
  viewState: MobileLayoutViewState;
  actions?: MobileLayoutActions;
  composerState?: MobileLayoutComposerState;
  publishState?: MobileLayoutPublishState;
}

// Mobile view order for swipe navigation
const mobileViews: MobileViewType[] = ["feed", "tree", "list", "calendar"];

const isPrimaryMobileView = (view: ViewType): view is "feed" | "tree" | "list" | "calendar" => {
  return view === "feed" || view === "tree" || view === "list" || view === "calendar";
};

const FeedView = lazy(() =>
  import("@/components/tasks/FeedView").then((module) => ({ default: module.FeedView }))
);
const CalendarView = lazy(() =>
  import("@/components/tasks/CalendarView").then((module) => ({ default: module.CalendarView }))
);

export function MobileLayout({
  viewState,
  actions,
  composerState,
  publishState,
}: MobileLayoutProps) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const {
    relays,
    channels,
    channelMatchMode = "and",
    people,
    hasCachedCurrentUserProfileMetadata = true,
    isSignedIn,
    currentView,
    isOnboardingOpen = false,
    activeOnboardingStepId = null,
    isManageRouteActive = false,
  } = viewState;
  const dispatchViewChange = useCallback((view: ViewType) => {
    void dispatchFeedInteraction({ type: "ui.view.change", view });
  }, [dispatchFeedInteraction]);
  const dispatchManageRouteChange = useCallback((isActive: boolean) => {
    void dispatchFeedInteraction({ type: "ui.manageRoute.change", isActive });
  }, [dispatchFeedInteraction]);
  const onViewChange = useMemo(
    () => actions?.onViewChange ?? dispatchViewChange,
    [actions?.onViewChange, dispatchViewChange]
  );
  const onManageRouteChange = useMemo(
    () => actions?.onManageRouteChange ?? dispatchManageRouteChange,
    [actions?.onManageRouteChange, dispatchManageRouteChange]
  );
  const feedTaskViewModel = useFeedTaskViewModel();
  const {
    tasks,
    allTasks,
    searchQuery,
    focusedTaskId = null,
    onNewTask,
    onFocusTask,
    composeRestoreRequest: contextComposeRestoreRequest = null,
    mentionRequest: contextMentionRequest = null,
    forceShowComposer: contextForceShowComposer = false,
    isPendingPublishTask: contextIsPendingPublishTask,
    isHydrating = false,
  } = feedTaskViewModel;
  const {
    forceComposeMode = contextForceShowComposer,
    composeRestoreRequest = contextComposeRestoreRequest,
    mentionRequest = contextMentionRequest,
  } = composerState ?? {};
  const {
    isPendingPublishTask = contextIsPendingPublishTask,
    failedPublishDrafts = [],
    visibleFailedPublishDrafts,
    selectedPublishableRelayIds = [],
  } = publishState ?? {};
  const { t } = useTranslation();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(new Date());
  const [profileEditorOpenSignal, setProfileEditorOpenSignal] = useState(0);
  const previousSignedInRef = useRef(isSignedIn);
  const lastHandledGuideStepIdRef = useRef<string | null>(null);
  const { needsProfileSetup } = useNDK();
  const activePrimaryView: MobileViewType = isPrimaryMobileView(currentView) ? currentView : "feed";

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

  const mobileCurrentView: MobileViewType = showFilters ? "filters" : activePrimaryView;
  const hasSearchQuery = searchQuery.trim().length > 0;
  const viewFallback = <div className="h-full" aria-hidden="true" />;
  const hasQuickFilterMatch = useMemo(() => {
    if (!hasSearchQuery) return true;
    return tasks.some((task) => taskMatchesTextQuery(task, searchQuery, people));
  }, [hasSearchQuery, tasks, searchQuery, people]);
  const isQuickFilterFallbackActive = !showFilters && hasSearchQuery && !hasQuickFilterMatch;
  const effectiveSearchQuery = isQuickFilterFallbackActive ? "" : searchQuery;
  const effectiveTaskViewModel = useMemo(
    () => ({
      ...feedTaskViewModel,
      searchQuery: effectiveSearchQuery,
      composeRestoreRequest,
      mentionRequest,
      forceShowComposer: forceComposeMode,
      isPendingPublishTask,
    }),
    [
      feedTaskViewModel,
      effectiveSearchQuery,
      composeRestoreRequest,
      mentionRequest,
      forceComposeMode,
      isPendingPublishTask,
    ]
  );

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
    if (showFilters) {
      return (
        <MobileFilters
          relays={relays}
          channels={channels}
          channelMatchMode={channelMatchMode}
          people={people}
          profileEditorOpenSignal={profileEditorOpenSignal}
        />
      );
    }
    switch (activePrimaryView) {
      case "tree":
        return <TaskTree {...effectiveTaskViewModel} isMobile />;
      case "feed":
        return <FeedView {...effectiveTaskViewModel} isMobile />;
      case "list":
        return <CalendarView {...effectiveTaskViewModel} isMobile mobileView="upcoming" selectedDate={selectedCalendarDate} onSelectedDateChange={setSelectedCalendarDate} />;
      case "calendar":
        return <CalendarView {...effectiveTaskViewModel} isMobile mobileView="calendar" selectedDate={selectedCalendarDate} onSelectedDateChange={setSelectedCalendarDate} />;
      default:
        return <TaskTree {...effectiveTaskViewModel} isMobile />;
    }
  };

  return (
    <div className="flex flex-col app-shell-height bg-background overflow-hidden">
      <MobileNav currentView={mobileCurrentView} onViewChange={handleMobileViewChange} />
      <FailedPublishQueueBanner
        drafts={failedPublishDrafts}
        selectedFeedDrafts={visibleFailedPublishDrafts}
        selectedRelayIds={selectedPublishableRelayIds}
        isMobile
      />
      
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
            <div
              role="status"
              aria-live="polite"
              className="px-3 pt-2 pb-1 text-xs leading-none text-muted-foreground"
            >
              {t("tasks.empty.mobileQuickFilterFallback")}
            </div>
          )}
          {!showFilters && (
            isHydrating ? (
              <HydrationStatusRow className="h-10 px-3 text-xs" />
            ) : focusedTaskId && activePrimaryView !== "list" && activePrimaryView !== "calendar" ? (
              <FocusedTaskBreadcrumb
                allTasks={allTasks}
                focusedTaskId={focusedTaskId}
                onFocusTask={onFocusTask}
                className="h-10 px-3 text-xs"
              />
            ) : null
          )}
          <div 
            className={cn(
              "flex-1 min-h-0 w-full transition-transform duration-150 ease-out",
              isAnimating && swipeDirection === "left" && "-translate-x-4 opacity-80",
              isAnimating && swipeDirection === "right" && "translate-x-4 opacity-80"
            )}
          >
            <Suspense fallback={viewFallback}>
              {renderView()}
            </Suspense>
          </div>
        </div>
      </main>
      
      <div hidden={showFilters}>
        <UnifiedBottomBar
          searchQuery={searchQuery}
          onSubmit={handleMobileSubmit}
          currentView={activePrimaryView}
          focusedTaskId={focusedTaskId}
          selectedCalendarDate={activePrimaryView === "calendar" ? selectedCalendarDate : null}
          relays={relays}
          channels={channels}
          people={people}
          defaultContent={defaultContent}
          isSignedIn={isSignedIn}
          forceComposeMode={forceComposeMode}
          composeRestoreRequest={composeRestoreRequest}
        />
      </div>
    </div>
  );
}
