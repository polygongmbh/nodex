import { Suspense, lazy, useState, useCallback, useRef, useEffect } from "react";
import { isPrimaryMobileView, MobileNav, MOBILE_VIEW_ORDER, MobileViewType } from "./MobileNav";
import { isSingleViewMode } from "@/components/tasks/ViewSwitcher";
import { MobileChannelChips } from "./MobileChannelChips";
import { MobileSpaceSelector } from "./MobileSpaceSelector";
import { MobileFilters } from "./MobileFilters";
import { UnifiedBottomBar } from "./UnifiedBottomBar";

import { StatusView } from "@/components/tasks/status/StatusView";
import { TaskTree } from "@/components/tasks/TaskTree";
import { TaskViewStatusRow } from "@/components/tasks/TaskViewStatusRow";
import { FailedPublishQueueBannerContainer } from "@/features/feed-page/views/FailedPublishQueueBannerContainer";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useMobileFallbackNoticeState } from "@/features/feed-page/controllers/use-task-view-states";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedViewState } from "@/features/feed-page/views/feed-view-state-context";
import { ViewLoadingFallback } from "@/features/feed-page/views/ViewLoadingFallback";
import { useIsHydrating } from "@/features/feed-page/stores/hydration-status-store";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import {
  setAllChannelFilters,
  setExclusiveChannelFilter,
  shouldToggleOffExclusiveChannel,
} from "@/domain/content/filter-state-utils";
import type { Post } from "@/types";
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

export function MobileLayout({
  posts,
  focusedTaskId,
}: {
  posts: Post[];
  focusedTaskId: string | null;
}) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const surface = useFeedSurfaceState();
  const channels = surface.visibleChannels ?? surface.channels;
  const setChannelFilterStates = useFilterStore((s) => s.setChannelFilterStates);
  const channelFilterStates = useFilterStore((s) => s.channelFilterStates);
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

  const composeRestoreRequest = useComposeRestoreSignal();
  const forceComposeMode = useOnboardingComposerSignal();
  const isHydrating = useIsHydrating();

  const [showFilters, setShowFilters] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(new Date());
  const [profileEditorOpenSignal, setProfileEditorOpenSignal] = useState(0);
  const lastHandledProfilePromptSignalRef = useRef(0);
  const lastHandledGuideStepIdRef = useRef<string | null>(null);
  const activePrimaryView: MobileViewType = isPrimaryMobileView(currentView)
    ? currentView
    : (MOBILE_VIEW_ORDER[0] ?? "status");

  // Build default content from active channel filters
  const includedChannels = channels.filter(c => c.filterState === "included");
  const defaultContent = includedChannels.map(c => `#${c.name}`).join(" ");

  // Chip row source mirrors the mobile sidebar: pinned channels first, then the
  // other visible channels in the same banded order.
  const allChannels = surface.channels;
  const chipChannels = channels;

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

  // Burger acts as a toggle: tapping it while the manage pane is open closes it.
  const toggleManageView = useCallback(() => {
    if (showFilters) {
      closeManageView();
      return;
    }
    openManageView();
  }, [closeManageView, openManageView, showFilters]);

  const handleMobileViewChange = useCallback((view: MobileViewType) => {
    if (showFilters) {
      closeManageView(view);
      return;
    }
    void dispatchFeedInteraction({ type: "ui.view.change", view });
  }, [closeManageView, dispatchFeedInteraction, showFilters]);

  // Chip taps write the channel filter directly (no undo toast — the chip row is
  // the always-visible affordance for reverting). Home clears to neutral.
  const handleSelectHome = useCallback(() => {
    if (showFilters) closeManageView();
    setChannelFilterStates(() => setAllChannelFilters(allChannels, "neutral"));
  }, [allChannels, closeManageView, setChannelFilterStates, showFilters]);

  const handleSelectChannel = useCallback((channelId: string) => {
    if (showFilters) closeManageView();
    // A tap overwrites any current channel scope with just this channel; tapping
    // the channel while it is the only one included clears back to the home
    // filter. Read straight off the live filter map — no parallel active-id state.
    setChannelFilterStates(() =>
      shouldToggleOffExclusiveChannel(allChannels, channelFilterStates, channelId)
        ? setAllChannelFilters(allChannels, "neutral")
        : setExclusiveChannelFilter(allChannels, channelId)
    );
  }, [allChannels, channelFilterStates, closeManageView, setChannelFilterStates, showFilters]);

  const handleToggleChannelPin = useCallback((channelId: string, isPinned: boolean) => {
    void dispatchFeedInteraction(
      isPinned
        ? { type: "sidebar.channel.unpin", channelId }
        : { type: "sidebar.channel.pin", channelId }
    );
  }, [dispatchFeedInteraction]);

  const mobileCurrentView: MobileViewType = activePrimaryView;
  const viewFallback = <ViewLoadingFallback />;
  const {
    mobileFallbackMessage,
    shouldShowMobileFallbackNotice,
  } = useMobileFallbackNoticeState({
    posts,
    focusedTaskId,
    currentView: activePrimaryView,
    showFilters,
    isHydrating,
  });
  const hasMobileBreadcrumbOffset = !showFilters && !isHydrating && Boolean(focusedTaskId);

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
        return <StatusView posts={posts} focusedTaskId={focusedTaskId} />;
      case "tree":
        return <TaskTree posts={posts} focusedTaskId={focusedTaskId} />;
      case "feed":
        return <FeedView posts={posts} focusedTaskId={focusedTaskId} scope="home" />;
      case "list":
        return <UpcomingView posts={posts} focusedTaskId={focusedTaskId} />;
      case "calendar":
        return <CalendarView posts={posts} focusedTaskId={focusedTaskId} selectedDate={selectedCalendarDate} onSelectedDateChange={setSelectedCalendarDate} />;
      default:
        return <TaskTree posts={posts} focusedTaskId={focusedTaskId} />;
    }
  };

  return (
    <div className="flex flex-col app-shell-height bg-background overflow-hidden">
      {/* App-wide top spacing (safe-area + margin) so the top row never sits
          flush against the status bar — independent of whether the nav shows. */}
      <div className="safe-area-top mt-2">
        {!isSingleViewMode && (
          <MobileNav currentView={mobileCurrentView} onViewChange={handleMobileViewChange} isManageActive={showFilters} />
        )}
        <MobileChannelChips
          channels={chipChannels}
          isManageActive={showFilters}
          onManageToggle={toggleManageView}
          onSelectHome={handleSelectHome}
          onSelectChannel={handleSelectChannel}
          onTogglePin={handleToggleChannelPin}
          leading={<MobileSpaceSelector />}
        />
      </div>
      <FailedPublishQueueBannerContainer isMobile />

      <main className="flex-1 overflow-hidden relative">
        <div className="h-full flex flex-col">
          <div>
            <TaskViewStatusRow
              posts={posts}
              focusedTaskId={focusedTaskId}
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
