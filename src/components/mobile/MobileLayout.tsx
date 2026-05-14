import { Suspense, lazy, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { isPrimaryMobileView, MobileNav, MobileViewType } from "./MobileNav";
import { MobileFilters } from "./MobileFilters";
import { UnifiedBottomBar } from "./UnifiedBottomBar";

import { StatusView } from "@/components/tasks/status/StatusView";
import { TaskTree } from "@/components/tasks/TaskTree";
import { TaskViewStatusRow } from "@/components/tasks/TaskViewStatusRow";
import { FailedPublishQueueBannerContainer } from "@/features/feed-page/views/FailedPublishQueueBannerContainer";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useMobileFallbackNoticeState } from "@/features/feed-page/controllers/use-task-view-states";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedViewState } from "@/features/feed-page/views/feed-view-state-context";
import { ViewLoadingFallback } from "@/features/feed-page/views/ViewLoadingFallback";
import { useMobileToastOffset } from "./use-mobile-toast-offset";

const FeedView = lazy(() =>
  import("@/components/tasks/FeedView").then((module) => ({ default: module.FeedView }))
);
const CalendarView = lazy(() =>
  import("@/components/tasks/CalendarView").then((module) => ({ default: module.CalendarView }))
);
const UpcomingView = lazy(() =>
  import("@/components/tasks/UpcomingView").then((module) => ({ default: module.UpcomingView }))
);

export function MobileLayout() {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const surface = useFeedSurfaceState();
  const channels = surface.visibleChannels ?? surface.channels;
  const {
    canCreateContent,
    profileCompletionPromptSignal,
    currentView,
    isOnboardingOpen,
    activeOnboardingStepId,
    isManageRouteActive,
  } = useFeedViewState();

  const dispatchManageRouteChange = useCallback((isActive: boolean) => {
    void dispatchFeedInteraction({ type: "ui.manageRoute.change", isActive });
  }, [dispatchFeedInteraction]);

  const feedTaskViewModel = useFeedTaskViewModel();
  const {
    tasks,
    allTasks,
    focusedTaskId,
    composeRestoreRequest = null,
    mentionRequest = null,
    forceShowComposer: forceComposeMode = false,
    isPendingPublishTask,
    isHydrating = false,
  } = feedTaskViewModel;

  const [showFilters, setShowFilters] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(new Date());
  const [profileEditorOpenSignal, setProfileEditorOpenSignal] = useState(0);
  const lastHandledProfilePromptSignalRef = useRef(0);
  const lastHandledGuideStepIdRef = useRef<string | null>(null);
  const activePrimaryView: MobileViewType = isPrimaryMobileView(currentView) ? currentView : "status";

  // Build default content from active channel filters
  const includedChannels = channels.filter(c => c.filterState === "included");
  const defaultContent = includedChannels.map(c => `#${c.name}`).join(" ");

  const openManageView = useCallback(() => {
    setShowFilters(true);
    dispatchManageRouteChange(true);
  }, [dispatchManageRouteChange]);

  const closeManageView = useCallback((nextView?: ViewType) => {
    setShowFilters(false);
    if (nextView) {
      void dispatchFeedInteraction({ type: "ui.view.change", view: nextView });
      return;
    }
    dispatchManageRouteChange(false);
  }, [dispatchFeedInteraction, dispatchManageRouteChange]);

  const handleMobileViewChange = useCallback((view: MobileViewType) => {
    if (showFilters) {
      closeManageView(view);
      return;
    }
    void dispatchFeedInteraction({ type: "ui.view.change", view });
  }, [closeManageView, dispatchFeedInteraction, showFilters]);

  const mobileCurrentView: MobileViewType = activePrimaryView;
  const viewFallback = <ViewLoadingFallback />;
  const {
    effectiveSearchQuery,
    mobileFallbackMessage,
    shouldShowMobileFallbackNotice,
    mobileShellFocusedTaskId,
  } = useMobileFallbackNoticeState({
    tasks,
    allTasks,
    focusedTaskId,
    currentView: activePrimaryView,
    showFilters,
    isHydrating,
  });
  const hasMobileBreadcrumbOffset = !showFilters && !isHydrating && Boolean(mobileShellFocusedTaskId);
  const effectiveTaskViewModel = useMemo(
    () => ({
      ...feedTaskViewModel,
      searchQueryOverride: effectiveSearchQuery,
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

    if (activeOnboardingStepId === "mobile-compose-combobox") {
      closeManageView("feed");
    }
  }, [activeOnboardingStepId, isOnboardingOpen, closeManageView, openManageView]);

  // Profile completion prompt is now handled globally by ProfileCompletionDialog,
  // which pops a profile editor dialog on mobile and desktop without changing route.
  useEffect(() => {
    if (profileCompletionPromptSignal <= 0) return;
    if (profileCompletionPromptSignal === lastHandledProfilePromptSignalRef.current) return;
    lastHandledProfilePromptSignalRef.current = profileCompletionPromptSignal;
  }, [profileCompletionPromptSignal]);

  useMobileToastOffset({ hasBreadcrumbOffset: hasMobileBreadcrumbOffset });

  const renderView = () => {
    if (showFilters) {
      return (
        <MobileFilters profileEditorOpenSignal={profileEditorOpenSignal} />
      );
    }
    switch (activePrimaryView) {
      case "status":
        return <StatusView />;
      case "tree":
        return <TaskTree {...effectiveTaskViewModel} isMobile />;
      case "feed":
        return <FeedView {...effectiveTaskViewModel} isMobile />;
      case "list":
        return <UpcomingView {...effectiveTaskViewModel} />;
      case "calendar":
        return <CalendarView {...effectiveTaskViewModel} searchQueryOverride="" isMobile selectedDate={selectedCalendarDate} onSelectedDateChange={setSelectedCalendarDate} />;
      default:
        return <TaskTree {...effectiveTaskViewModel} isMobile />;
    }
  };

  return (
    <div className="flex flex-col app-shell-height bg-background overflow-hidden">
      <div>
        <MobileNav currentView={mobileCurrentView} onViewChange={handleMobileViewChange} onManageOpen={openManageView} isManageActive={showFilters} />
      </div>
      <FailedPublishQueueBannerContainer isMobile />

      <main className="flex-1 overflow-hidden relative">
        <div className="h-full flex flex-col">
          <div>
            <TaskViewStatusRow
              allTasks={allTasks}
              focusedTaskId={mobileShellFocusedTaskId}
              isHydrating={isHydrating}
              className="h-10 px-3 text-xs"
              visible={!showFilters}
            />
          </div>
          {shouldShowMobileFallbackNotice && (
            <div
              role="status"
              aria-live="polite"
              className="w-full px-3 pt-2 pb-1 text-center text-xs leading-none text-muted-foreground"
            >
              {mobileFallbackMessage}
            </div>
          )}
          <div className="flex-1 min-h-0 w-full">
            <Suspense fallback={viewFallback}>
              {renderView()}
            </Suspense>
          </div>
        </div>
      </main>

      <div hidden={showFilters || activePrimaryView === "calendar" || activePrimaryView === "status"}>
        <UnifiedBottomBar
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
