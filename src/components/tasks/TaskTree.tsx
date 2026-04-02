import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Task, Person, ComposeRestoreRequest } from "@/types";
import { TreeTaskItem } from "./TreeTaskItem";
import { SharedViewComposer } from "./SharedViewComposer";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import { FilteredEmptyState } from "@/components/tasks/FilteredEmptyState";
import { useFeedViewInteractionModel } from "@/features/feed-page/interactions/feed-view-interaction-context";
import {
  createTreeSelectors,
  useTaskViewSource,
} from "@/features/feed-page/controllers/use-task-view-states";
import { useTaskViewServices } from "./use-task-view-services";
import { TaskAuthorProfilesProvider } from "./task-author-profiles-context";

interface TaskTreeProps {
  tasks: Task[];
  allTasks: Task[];
  currentUser?: Person;
  focusedTaskId?: string | null;
  searchQueryOverride?: string;
  composeRestoreRequest?: ComposeRestoreRequest | null;
  isMobile?: boolean;
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  compactTaskCardsEnabled?: boolean;
  isPendingPublishTask?: (taskId: string) => boolean;
  onMentionRequestConsumed?: (requestId: number) => void;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  isInteractionBlocked?: boolean;
  isHydrating?: boolean;
}

export function TaskTree({
  tasks,
  allTasks,
  currentUser,
  searchQueryOverride,
  focusedTaskId,
  isMobile = false,
  forceShowComposer,
  composeGuideActivationSignal,
  compactTaskCardsEnabled = false,
  isPendingPublishTask,
  onMentionRequestConsumed,
  composeRestoreRequest = null,
  mentionRequest = null,
  isInteractionBlocked = false,
  isHydrating = false,
}: TaskTreeProps) {
  const interactionModel = useFeedViewInteractionModel();
  const { authPolicy, focusSidebar, focusTask } = useTaskViewServices();
  const effectiveForceShowComposer = forceShowComposer ?? interactionModel.forceShowComposer;
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const SHARED_COMPOSE_DRAFT_KEY = COMPOSE_DRAFT_STORAGE_KEY;
  const taskSource = useTaskViewSource({
    tasks,
    allTasks,
    focusedTaskId,
    searchQueryOverride,
  });
  const treeSelectors = useMemo(() => createTreeSelectors(taskSource), [taskSource]);
  const { activeRelays, childrenMap, currentContextId, searchQuery, sortContext } = taskSource;
  const currentContextTask = treeSelectors.getCurrentContextTask();
  const visibleTasks = treeSelectors.getVisibleTasks();
  const displayedTasks = treeSelectors.getDisplayedTasks({ useMobileFallback: isMobile });
  const getFilteredChildren = treeSelectors.getFilteredChildren;
  const isTaskDirectMatch = treeSelectors.isDirectMatch;
  const composerDefaultContent = treeSelectors.getComposerDefaultContent();
  const { shouldShowScopeFooterHint } =
    treeSelectors.getEmptyStateFlags({ isMobile });
  const hasActiveFilters = treeSelectors.hasActiveFilters();
  const handleGoUp = () => {
    if (!currentContextTask) {
      focusTask(null);
      return;
    }
    focusTask(currentContextTask.parentId || null);
  };

  // Flatten visible task IDs for keyboard navigation
  const flattenedTaskIds = useMemo(() => {
    const ids: string[] = [];
    visibleTasks.forEach(task => {
      if (task.taskType !== "comment") {
        ids.push(task.id);
      }
    });
    return ids;
  }, [visibleTasks]);

  // Task navigation with keyboard
  const { focusedTaskId: keyboardFocusedTaskId } = useTaskNavigation({
    taskIds: flattenedTaskIds,
    onSelectTask: focusTask,
    onGoBack: handleGoUp,
    onFocusSidebar: focusSidebar,
    enabled: !isMobile && !isComposerExpanded,
  });

  // Scroll focused task into view
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousRowPositionsRef = useRef<Map<string, number>>(new Map());
  const previousTopLevelOrderRef = useRef<string[]>([]);
  const prefersReducedMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      prefersReducedMotionRef.current = mediaQuery.matches;
    };
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);
  useEffect(() => {
    if (keyboardFocusedTaskId && scrollContainerRef.current) {
      const element = scrollContainerRef.current.querySelector(
        `[data-task-id="${keyboardFocusedTaskId}"]`
      );
      if (element) {
        element.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [keyboardFocusedTaskId]);

  // FLIP animation: animate row position changes instead of snapping on reorder.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const rows = Array.from(container.querySelectorAll<HTMLElement>(":scope > [data-task-id]"));
    const nextPositions = new Map<string, number>();
    const nextOrder: string[] = [];
    for (const row of rows) {
      const taskId = row.dataset.taskId;
      if (!taskId) continue;
      nextOrder.push(taskId);
      nextPositions.set(taskId, row.getBoundingClientRect().top);
    }

    const previousOrder = previousTopLevelOrderRef.current;
    const previousOrderSet = new Set(previousOrder);
    const hasSameTaskSet =
      previousOrder.length === nextOrder.length &&
      nextOrder.every((taskId) => previousOrderSet.has(taskId));
    const orderChanged = previousOrder.join("|") !== nextOrder.join("|");
    const shouldAnimateReorder =
      !prefersReducedMotionRef.current &&
      previousOrder.length > 0 &&
      hasSameTaskSet &&
      orderChanged;

    const cleanupTimeouts: number[] = [];
    if (shouldAnimateReorder) {
      for (const row of rows) {
        const taskId = row.dataset.taskId;
        if (!taskId) continue;
        const previousTop = previousRowPositionsRef.current.get(taskId);
        const currentTop = nextPositions.get(taskId);
        if (previousTop === undefined || currentTop === undefined) continue;
        const deltaY = previousTop - currentTop;
        if (Math.abs(deltaY) < 1) continue;

        row.style.transition = "none";
        row.style.transform = `translateY(${deltaY}px)`;
        row.style.willChange = "transform";

        requestAnimationFrame(() => {
          row.style.transition = "transform var(--motion-duration-normal) var(--motion-ease-standard)";
          row.style.transform = "translateY(0)";
          const cleanup = () => {
            row.style.transition = "";
            row.style.transform = "";
            row.style.willChange = "";
            row.removeEventListener("transitionend", cleanup);
          };
          row.addEventListener("transitionend", cleanup);
          // Fallback in case transitionend doesn't fire on mobile.
          const timeoutId = window.setTimeout(cleanup, 280);
          cleanupTimeouts.push(timeoutId);
        });
      }
    } else {
      // Prevent stale transforms when rows are inserted/removed.
      for (const row of rows) {
        row.style.transition = "";
        row.style.transform = "";
        row.style.willChange = "";
      }
    }

    previousRowPositionsRef.current = nextPositions;
    previousTopLevelOrderRef.current = nextOrder;
    return () => cleanupTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [visibleTasks]);

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      <SharedViewComposer
        visible={!isMobile && (authPolicy.canOpenCompose || effectiveForceShowComposer)}
        onCancel={() => setIsComposerExpanded(false)}
        draftStorageKey={SHARED_COMPOSE_DRAFT_KEY}
        parentId={currentContextId || undefined}
        forceExpanded={effectiveForceShowComposer}
        forceExpandSignal={composeGuideActivationSignal}
        onExpandedChange={setIsComposerExpanded}
        mentionRequest={mentionRequest}
        onMentionRequestConsumed={onMentionRequestConsumed}
        composeRestoreRequest={composeRestoreRequest}
        className="relative z-20 border-b border-border px-3 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0"
        defaultContent={composerDefaultContent}
        collapseOnSuccess
        allowComment={Boolean(currentContextId)}
      />

      {/* Task List */}
      <TaskAuthorProfilesProvider tasks={allTasks}>
        <div ref={scrollContainerRef} className="scrollbar-main-view flex-1 px-2 sm:px-3 py-4 space-y-1" data-onboarding="task-list">
          {displayedTasks.map((task) => (
            <TreeTaskItem
              key={task.id}
              task={task}
              filteredChildren={getFilteredChildren(task.id)}
              childrenMap={childrenMap}
              currentUser={currentUser}
              matchedByFilter={isTaskDirectMatch(task.id)}
              isDirectMatchFn={isTaskDirectMatch}
              getFilteredChildrenFn={getFilteredChildren}
              hasActiveFilters={hasActiveFilters}
              activeRelays={activeRelays}
              isKeyboardFocused={keyboardFocusedTaskId === task.id}
              compactView={compactTaskCardsEnabled}
              isPendingPublishTask={isPendingPublishTask}
              isInteractionBlocked={isInteractionBlocked}
              sortContext={sortContext}
            />
          ))}
          {shouldShowScopeFooterHint ? (
            <FilteredEmptyState
              isHydrating={isHydrating}
              searchQuery={searchQuery}
              contextTaskTitle={currentContextTask?.content}
              mode="footer"
            />
          ) : null}
        </div>
      </TaskAuthorProfilesProvider>

    </main>
  );
}
