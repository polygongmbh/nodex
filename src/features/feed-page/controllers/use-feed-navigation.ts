import { useRef, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { VIEW_ORDER, type ViewType } from "@/components/tasks/ViewSwitcher";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { isTaskOutsideSelectedRelayScope } from "@/domain/relays/relay-scope";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import type { Post, Relay } from "@/types";

const VALID_VIEWS: readonly ViewType[] = VIEW_ORDER;
const MOBILE_MANAGE_ROUTE = "manage";

interface UseFeedNavigationOptions {
  allTasks: Post[];
  isMobile: boolean;
  effectiveActiveRelayIds: Set<string>;
  relays: Relay[];
  isHydrating?: boolean;
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
  isHydrating = false,
  onToggleChannelMatchMode,
  onToggleRecentFilter,
  onTogglePriorityFilter,
  onToggleCompactView,
}: UseFeedNavigationOptions) {
  const { t } = useTranslation("tasks");
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

  // After hydration completes, if the focused id from the URL is still not in
  // the loaded post set, the id is stale or wrong — drop focus and toast so
  // the user isn't stuck staring at an empty "No post yet" page.
  const reportedMissingFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedTaskId || focusedTask || isHydrating) return;
    if (reportedMissingFocusRef.current === focusedTaskId) return;
    reportedMissingFocusRef.current = focusedTaskId;
    nostrDevLog("feed", "Focused post id not found after hydration; clearing focus", {
      focusedTaskId,
    });
    toast(t("tasks.toasts.postNotFound", { id: shortenPostId(focusedTaskId) }));
    setFocusedTaskId(null);
  }, [focusedTaskId, focusedTask, isHydrating, setFocusedTaskId, t]);

  useEffect(() => {
    if (focusedTaskId && focusedTask) {
      reportedMissingFocusRef.current = null;
    }
  }, [focusedTaskId, focusedTask]);

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

function shortenPostId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}
