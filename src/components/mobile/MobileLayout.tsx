import { Suspense, lazy, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { isPrimaryMobileView, MobileNav, MobileViewType } from "./MobileNav";
import { MobileFilters } from "./MobileFilters";
import { UnifiedBottomBar } from "./UnifiedBottomBar";

import { StatusView } from "@/components/tasks/status/StatusView";
import { TaskTree } from "@/components/tasks/TaskTree";
import { TaskViewStatusRow } from "@/components/tasks/TaskViewStatusRow";
import { FailedPublishQueueBannerContainer } from "@/features/feed-page/views/FailedPublishQueueBannerContainer";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useMobileFallbackNoticeState } from "@/features/feed-page/controllers/use-task-view-states";
import { useFocusedTaskId } from "@/features/feed-page/controllers/use-focused-task-id";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedViewState } from "@/features/feed-page/views/feed-view-state-context";
import { ViewLoadingFallback } from "@/features/feed-page/views/ViewLoadingFallback";
import { usePosts } from "@/features/feed-page/stores/posts-store";
import { useIsHydrating } from "@/features/feed-page/stores/hydration-status-store";
import {
  useComposeRestoreSignal,
  useOnboardingComposerSignal,
} from "@/features/feed-page/stores/composer-signals-store";
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

  const posts = usePosts();
  const focusedTaskId = useFocusedTaskId();
  const composeRestoreRequest = useComposeRestoreSignal();
  const forceComposeMode = useOnboardingComposerSignal();
  const isHydrating = useIsHydrating();

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
    posts,
    focusedTaskId,
    currentView: activePrimaryView,
    showFilters,
    isHydrating,
  });
  const hasMobileBreadcrumbOffset = !showFilters && !isHydrating && Boolean(mobileShellFocusedTaskId);

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
        return <StatusView posts={posts} />;
      case "tree":
        return <TaskTree posts={posts} searchQueryOverride={effectiveSearchQuery} />;
      case "feed":
        return <FeedView posts={posts} searchQueryOverride={effectiveSearchQuery} />;
      case "list":
        return <UpcomingView posts={posts} searchQueryOverride={effectiveSearchQuery} />;
      case "calendar":
        return <CalendarView posts={posts} searchQueryOverride="" selectedDate={selectedCalendarDate} onSelectedDateChange={setSelectedCalendarDate} />;
      default:
        return <TaskTree posts={posts} searchQueryOverride={effectiveSearchQuery} />;
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
              posts={posts}
              focusedTaskId={mobileShellFocusedTaskId}
              isHydrating={isHydrating}
              className="h-10 px-3 text-xs"
              visible={!showFilters}
            />
          </div>
          {shouldShowMobileFallbackNotice && (
            <div
              role="status"
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
