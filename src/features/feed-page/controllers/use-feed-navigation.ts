import { useRef, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { VIEW_ORDER, type ViewType } from "@/components/tasks/ViewSwitcher";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { isTaskOutsideSelectedRelayScope } from "@/domain/relays/relay-scope";
import type { Task, Relay } from "@/types";

const VALID_VIEWS: readonly ViewType[] = VIEW_ORDER;
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
  const location = useLocation();
  const lastContentViewRef = useRef<ViewType>("status");

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

  // Always preserve the current search/hash when navigating to keep filter URL state intact
  // and avoid bouncing between the path-only URL and the synced filter params.
  const navigateToPath = useCallback(
    (pathname: string) => {
      if (pathname === location.pathname) return;
      navigate({ pathname, search: location.search, hash: location.hash });
    },
    [navigate, location.pathname, location.search, location.hash]
  );

  const setCurrentView = useCallback(
    (newView: ViewType) => {
      const pathname = focusedTaskId ? `/${newView}/${focusedTaskId}` : `/${newView}`;
      navigateToPath(pathname);
    },
    [navigateToPath, focusedTaskId]
  );

  const setFocusedTaskId = useCallback(
    (taskId: string | null, view?: ViewType) => {
      const targetView = view ?? currentView;
      const pathname = taskId ? `/${targetView}/${taskId}` : `/${targetView}`;
      navigateToPath(pathname);
    },
    [navigateToPath, currentView]
  );

  const setManageRouteActive = useCallback(
    (isActive: boolean) => {
      if (isActive) {
        navigateToPath(`/${MOBILE_MANAGE_ROUTE}`);
        return;
      }
      const pathname = focusedTaskId ? `/${currentView}/${focusedTaskId}` : `/${currentView}`;
      navigateToPath(pathname);
    },
    [currentView, focusedTaskId, navigateToPath]
  );

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
    openedWithFocusedTaskRef,
  };
}
