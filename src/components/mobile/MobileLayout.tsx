import { Suspense, lazy, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { MobileNav, MobileViewType } from "./MobileNav";
import { MobileFilters } from "./MobileFilters";
import { UnifiedBottomBar } from "./UnifiedBottomBar";

import { TaskTree } from "@/components/tasks/TaskTree";
import { TaskViewStatusRow } from "@/components/tasks/TaskViewStatusRow";
import { FailedPublishQueueBanner } from "@/components/tasks/FailedPublishQueueBanner";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useSwipeNavigation } from "@/hooks/use-swipe-navigation";
import type { FailedPublishDraft } from "@/infrastructure/preferences/failed-publish-drafts-storage";
import {
  Relay,
  Channel,
  ChannelMatchMode,
  Person,
  Task,
  TaskCreateResult,
  TaskDateType,
  ComposeRestoreRequest,
  PublishedAttachment,
  Nip99Metadata,
} from "@/types";
import { cn } from "@/lib/utils";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import { buildTaskViewFilterIndex, filterTasksForView } from "@/domain/content/task-view-filtering";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { useTranslation } from "react-i18next";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedTaskCommands } from "@/features/feed-page/views/feed-task-command-context";
import { resolveMobileFallbackNoticeType } from "@/domain/content/mobile-fallback-notice";
import { useEmptyScopeModel } from "@/features/feed-page/controllers/use-empty-scope-model";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";

export interface MobileLayoutViewState {
  relays?: Relay[];
  channels?: Channel[];
  channelMatchMode?: ChannelMatchMode;
  people?: Person[];
  canCreateContent: boolean;
  profileCompletionPromptSignal?: number;
  currentView: ViewType;
  isOnboardingOpen?: boolean;
  activeOnboardingStepId?: string | null;
  isManageRouteActive?: boolean;
}

export interface MobileLayoutActions {
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
  const { onNewTask } = useFeedTaskCommands();
  const surface = useFeedSurfaceState();
  const {
    relays: relaysProp,
    channels: channelsProp,
    channelMatchMode: channelMatchModeProp,
    people: peopleProp,
    canCreateContent,
    profileCompletionPromptSignal = 0,
    currentView,
    isOnboardingOpen = false,
    activeOnboardingStepId = null,
    isManageRouteActive = false,
  } = viewState;
  const relays = relaysProp ?? surface.relays;
  const channels = channelsProp ?? surface.channels;
  const people = peopleProp ?? surface.people;
  const channelMatchMode = channelMatchModeProp ?? surface.channelMatchMode ?? "and";
  const dispatchManageRouteChange = useCallback((isActive: boolean) => {
    void dispatchFeedInteraction({ type: "ui.manageRoute.change", isActive });
  }, [dispatchFeedInteraction]);
  const onManageRouteChange = useMemo(
    () => actions?.onManageRouteChange ?? dispatchManageRouteChange,
    [actions?.onManageRouteChange, dispatchManageRouteChange]
  );
  const feedTaskViewModel = useFeedTaskViewModel();
  const {
    tasks,
    allTasks,
    focusedTaskId = null,
    searchQuery: viewModelSearchQuery,
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
  const searchQuery = viewModelSearchQuery ?? surface.searchQuery;
  const { t } = useTranslation();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(new Date());
  const [profileEditorOpenSignal, setProfileEditorOpenSignal] = useState(0);
  const lastHandledProfilePromptSignalRef = useRef(0);
  const lastHandledGuideStepIdRef = useRef<string | null>(null);
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
      void dispatchFeedInteraction({ type: "ui.view.change", view: nextView });
    }
    onManageRouteChange(false);
  }, [dispatchFeedInteraction, onManageRouteChange]);

  const handleMobileViewChange = useCallback((view: MobileViewType) => {
    if (view === "filters") {
      openManageView();
      return;
    }
    if (showFilters) {
      closeManageView(view);
      return;
    }
    void dispatchFeedInteraction({ type: "ui.view.change", view });
  }, [closeManageView, dispatchFeedInteraction, openManageView, showFilters]);

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
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const prefilteredTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const taskFilterIndex = useMemo(() => buildTaskViewFilterIndex(allTasks, people), [allTasks, people]);
  const { included: includedChannelNames, excluded: excludedChannelNames } = useMemo(
    () => getIncludedExcludedChannelNames(channels),
    [channels]
  );
  const activeViewTaskPredicate = useMemo(() => {
    if (activePrimaryView !== "list" && activePrimaryView !== "calendar") {
      return undefined;
    }
    return (task: Task) =>
      task.taskType === "task" && Boolean(task.dueDate) && !isTaskTerminalStatus(task.status);
  }, [activePrimaryView]);
  const includeFocusedTaskForActiveView = activePrimaryView === "feed";
  const hideClosedForActiveView = activePrimaryView === "feed";
  const scopedMatchesWithSearch = useMemo(
    () =>
      filterTasksForView({
        allTasks,
        filterIndex: taskFilterIndex,
        prefilteredTaskIds,
        focusedTaskId,
        includeFocusedTask: includeFocusedTaskForActiveView,
        hideClosedTasks: hideClosedForActiveView,
        searchQuery,
        people,
        includedChannels: includedChannelNames,
        excludedChannels: excludedChannelNames,
        channelMatchMode,
        taskPredicate: activeViewTaskPredicate,
      }),
    [
      allTasks,
      taskFilterIndex,
      prefilteredTaskIds,
      focusedTaskId,
      includeFocusedTaskForActiveView,
      hideClosedForActiveView,
      searchQuery,
      people,
      includedChannelNames,
      excludedChannelNames,
      channelMatchMode,
      activeViewTaskPredicate,
    ]
  );
  const scopedMatchesWithoutSearch = useMemo(
    () =>
      filterTasksForView({
        allTasks,
        filterIndex: taskFilterIndex,
        prefilteredTaskIds,
        focusedTaskId,
        includeFocusedTask: includeFocusedTaskForActiveView,
        hideClosedTasks: hideClosedForActiveView,
        searchQuery: "",
        people,
        includedChannels: includedChannelNames,
        excludedChannels: excludedChannelNames,
        channelMatchMode,
        taskPredicate: activeViewTaskPredicate,
      }),
    [
      allTasks,
      taskFilterIndex,
      prefilteredTaskIds,
      focusedTaskId,
      includeFocusedTaskForActiveView,
      hideClosedForActiveView,
      people,
      includedChannelNames,
      excludedChannelNames,
      channelMatchMode,
      activeViewTaskPredicate,
    ]
  );
  const sourceMatchesWithoutScope = useMemo(
    () =>
      filterTasksForView({
        allTasks,
        filterIndex: taskFilterIndex,
        prefilteredTaskIds,
        focusedTaskId,
        includeFocusedTask: includeFocusedTaskForActiveView,
        hideClosedTasks: hideClosedForActiveView,
        searchQuery: "",
        people,
        includedChannels: [],
        excludedChannels: [],
        channelMatchMode,
        taskPredicate: activeViewTaskPredicate,
      }),
    [
      allTasks,
      taskFilterIndex,
      prefilteredTaskIds,
      focusedTaskId,
      includeFocusedTaskForActiveView,
      hideClosedForActiveView,
      people,
      channelMatchMode,
      activeViewTaskPredicate,
    ]
  );
  const hasScopedMatchesWithSearch = scopedMatchesWithSearch.length > 0;
  const hasScopedMatchesWithoutSearch = scopedMatchesWithoutSearch.length > 0;
  const hasSourceContent = sourceMatchesWithoutScope.length > 0;
  const shouldOmitSearchQuery = !showFilters && hasSearchQuery && !hasScopedMatchesWithSearch && hasSourceContent;
  const effectiveSearchQuery = shouldOmitSearchQuery ? "" : searchQuery;
  const scopeModelWithoutQuickSearch = useEmptyScopeModel({
    relays,
    channels,
    people,
    searchQuery: "",
    focusedTaskId,
    taskById,
  });
  const quickFilterFallbackMessage = scopeModelWithoutQuickSearch.scopeDescription
    ? t("tasks.empty.mobileQuickFilterFallbackScoped", { scope: scopeModelWithoutQuickSearch.scopeDescription })
    : t("tasks.empty.mobileQuickFilterFallback");
  const mobileFallbackNoticeType = resolveMobileFallbackNoticeType({
    hasSourceContent,
    hasScopeFilters: scopeModelWithoutQuickSearch.hasActiveFilters,
    hasScopedMatchesWithSearch,
    hasScopedMatchesWithoutSearch,
    hasSearchQuery,
  });
  const mobileFallbackMessage = mobileFallbackNoticeType === "scope"
    ? scopeModelWithoutQuickSearch.mobileFallbackHint
    : mobileFallbackNoticeType === "quick"
      ? quickFilterFallbackMessage
      : null;
  const shouldShowMobileFallbackNotice = !showFilters && !isHydrating && Boolean(mobileFallbackMessage);
  const mobileShellFocusedTaskId =
    activePrimaryView !== "list" && activePrimaryView !== "calendar"
      ? focusedTaskId
      : null;
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
    return Promise.resolve(
      onNewTask(
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
      )
    );
  }, [focusedTaskId, onNewTask]);

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
    if (profileCompletionPromptSignal <= 0) return;
    if (profileCompletionPromptSignal === lastHandledProfilePromptSignalRef.current) return;
    lastHandledProfilePromptSignalRef.current = profileCompletionPromptSignal;
    openManageView();
    setProfileEditorOpenSignal((previous) => previous + 1);
  }, [openManageView, profileCompletionPromptSignal]);

  const renderView = () => {
    if (showFilters) {
      return (
        <MobileFilters profileEditorOpenSignal={profileEditorOpenSignal} />
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
          <TaskViewStatusRow
            allTasks={allTasks}
            focusedTaskId={mobileShellFocusedTaskId}
            isHydrating={isHydrating}
            className="h-10 px-3 text-xs"
            visible={!showFilters}
          />
          {shouldShowMobileFallbackNotice && (
            <div
              role="status"
              aria-live="polite"
              className="w-full px-3 pt-2 pb-1 text-center text-xs leading-none text-muted-foreground"
            >
              {mobileFallbackMessage}
            </div>
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
          onSubmit={handleMobileSubmit}
          currentView={activePrimaryView}
          focusedTaskId={focusedTaskId}
          selectedCalendarDate={activePrimaryView === "calendar" ? selectedCalendarDate : null}
          defaultContent={defaultContent}
          canCreateContent={canCreateContent}
          forceComposeMode={forceComposeMode}
          composeRestoreRequest={composeRestoreRequest}
        />
      </div>
    </div>
  );
}
