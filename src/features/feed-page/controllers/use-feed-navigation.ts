import { useRef, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useSwipeNavigation } from "@/hooks/use-swipe-navigation";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { isTaskOutsideSelectedRelayScope } from "@/domain/relays/relay-scope";
import type { Task, Relay } from "@/types";

const VALID_VIEWS: ViewType[] = ["feed", "tree", "kanban", "list", "calendar"];
const MOBILE_MANAGE_ROUTE = "manage";

interface UseFeedNavigationOptions {
  allTasks: Task[];
  isMobile: boolean;
  effectiveActiveRelayIds: Set<string>;
  relays: Relay[];
  onToggleChannelMatchMode?: () => void;
  onToggleRecentFilter?: () => void;
  onTogglePriorityFilter?: () => void;
  onToggleCompactView?: () => void;
}

export function useFeedNavigation({
  allTasks,
  isMobile,
  effectiveActiveRelayIds,
  relays,
  onToggleChannelMatchMode,
  onToggleRecentFilter,
  onTogglePriorityFilter,
  onToggleCompactView,
}: UseFeedNavigationOptions) {
  const { view: urlView, taskId: urlTaskId } = useParams<{ view: string; taskId: string }>();
  const navigate = useNavigate();
  const lastContentViewRef = useRef<ViewType>("feed");

  const isManageRouteActive = urlView === MOBILE_MANAGE_ROUTE;
  const resolvedUrlView = VALID_VIEWS.includes(urlView as ViewType)
    ? (urlView as ViewType)
    : null;

  if (resolvedUrlView !== null) {
    lastContentViewRef.current = resolvedUrlView;
  }

  const currentView: ViewType = resolvedUrlView ?? lastContentViewRef.current;

  const focusedTaskId = urlTaskId || null;

  const focusedTask = useMemo(
    () => (focusedTaskId ? allTasks.find((task) => task.id === focusedTaskId) ?? null : null),
    [allTasks, focusedTaskId]
  );

  // Captures the initial URL state for onboarding autostart suppression.
  const openedWithFocusedTaskRef = useRef(Boolean(urlTaskId));

  const setCurrentView = useCallback(
    (newView: ViewType) => {
      if (focusedTaskId) {
        navigate(`/${newView}/${focusedTaskId}`);
      } else {
        navigate(`/${newView}`);
      }
    },
    [navigate, focusedTaskId]
  );

  const setFocusedTaskId = useCallback(
    (taskId: string | null) => {
      if (taskId) {
        navigate(`/${currentView}/${taskId}`);
      } else {
        navigate(`/${currentView}`);
      }
    },
    [navigate, currentView]
  );

  const setManageRouteActive = useCallback(
    (isActive: boolean) => {
      if (isActive) {
        navigate(`/${MOBILE_MANAGE_ROUTE}`);
        return;
      }
      if (focusedTaskId) {
        navigate(`/${currentView}/${focusedTaskId}`);
        return;
      }
      navigate(`/${currentView}`);
    },
    [currentView, focusedTaskId, navigate]
  );

  const handleDesktopSwipeLeft = useCallback(() => {
    const currentIndex = VALID_VIEWS.indexOf(currentView);
    if (currentIndex < VALID_VIEWS.length - 1) {
      setCurrentView(VALID_VIEWS[currentIndex + 1]);
    }
  }, [currentView, setCurrentView]);

  const handleDesktopSwipeRight = useCallback(() => {
    const currentIndex = VALID_VIEWS.indexOf(currentView);
    if (currentIndex > 0) {
      setCurrentView(VALID_VIEWS[currentIndex - 1]);
    }
  }, [currentView, setCurrentView]);

  const desktopSwipeHandlers = useSwipeNavigation({
    onSwipeLeft: handleDesktopSwipeLeft,
    onSwipeRight: handleDesktopSwipeRight,
    threshold: 55,
    enableHaptics: false,
    enableWheelSwipe: !isMobile,
  });

  useKeyboardShortcuts({
    onViewChange: setCurrentView,
    onToggleChannelMatchMode,
    onToggleRecentFilter,
    onTogglePriorityFilter,
    onToggleCompactView,
    enabled: !isMobile,
  });

  // Clear the focused task when it leaves the active relay scope.
  useEffect(() => {
    if (!focusedTaskId || !focusedTask) return;
    if (
      !isTaskOutsideSelectedRelayScope(
        focusedTask,
        effectiveActiveRelayIds,
        relays.map((relay) => relay.id)
      )
    ) {
      return;
    }
    setFocusedTaskId(null);
  }, [effectiveActiveRelayIds, focusedTask, focusedTaskId, relays, setFocusedTaskId]);

  return {
    currentView,
    focusedTaskId,
    focusedTask,
    isManageRouteActive,
    setCurrentView,
    setFocusedTaskId,
    setManageRouteActive,
    desktopSwipeHandlers,
    openedWithFocusedTaskRef,
  };
}
