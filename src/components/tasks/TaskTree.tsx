import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { Task, TaskCreateResult, TaskDateType, ComposeRestoreRequest, PublishedAttachment, SharedTaskViewContext, Nip99Metadata, TaskStatus } from "@/types";
import { TaskItem } from "./TaskItem";
import { SharedViewComposer } from "./SharedViewComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { sortTasks, buildChildrenMap, SortContext } from "@/domain/content/task-sorting";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { taskMatchesTextQuery } from "@/domain/content/task-text-filter";
import { buildComposePrefillFromFiltersAndContext } from "@/lib/compose-prefill";
import { getIncludedExcludedChannelNames, taskMatchesChannelFilters } from "@/domain/content/channel-filtering";
import { useTaskMediaPreview } from "@/hooks/use-task-media-preview";
import { TaskMediaLightbox } from "@/components/tasks/TaskMediaLightbox";
import { useNostrProfiles } from "@/infrastructure/nostr/use-nostr-profiles";
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import { FilteredEmptyState } from "@/components/tasks/FilteredEmptyState";

interface TaskTreeProps extends SharedTaskViewContext {
  onToggleComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onFocusSidebar?: () => void;
  isMobile?: boolean;
  onSignInClick?: () => void;
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  onUndoPendingPublish?: (taskId: string) => void;
  isPendingPublishTask?: (taskId: string) => boolean;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  isInteractionBlocked?: boolean;
}

export function TaskTree({
  tasks,
  allTasks,
  relays,
  channels,
  channelMatchMode = "and",
  composeChannels,
  people,
  currentUser,
  searchQuery,
  onNewTask,
  onToggleComplete,
  onStatusChange,
  focusedTaskId,
  onFocusTask,
  onFocusSidebar,
  isMobile = false,
  onSignInClick,
  onHashtagClick,
  forceShowComposer = false,
  composeGuideActivationSignal,
  onAuthorClick,
  onClearChannelFilter,
  onClearPersonFilter,
  onUndoPendingPublish,
  isPendingPublishTask,
  composeRestoreRequest = null,
  mentionRequest = null,
  isInteractionBlocked = false,
}: TaskTreeProps) {
  const { user } = useNDK();
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const SHARED_COMPOSE_DRAFT_KEY = COMPOSE_DRAFT_STORAGE_KEY;
  const {
    mediaItems,
    activeMediaIndex,
    activeMediaItem,
    activePostMediaIndex,
    activePostMediaCount,
    openTaskMedia,
    goToPreviousMedia,
    goToNextMedia,
    goToPreviousPost,
    goToNextPost,
    closeMediaPreview,
  } = useTaskMediaPreview(tasks);

  const currentContextId = focusedTaskId || null;

  // Build a map of task ID to children
  const childrenMap = useMemo(() => buildChildrenMap(allTasks), [allTasks]);
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);

  const sortContext: SortContext = useMemo(() => ({
    childrenMap,
    allTasks,
    taskById,
  }), [childrenMap, allTasks, taskById]);

  const { included: includedChannels, excluded: excludedChannels } = useMemo(
    () => getIncludedExcludedChannelNames(channels),
    [channels]
  );

  // Check if a task or any of its descendants matches the filter
  const taskMatchesFilter = useCallback((task: Task, query: string, included: string[], excluded: string[]): boolean => {
    const matchesQuery = taskMatchesTextQuery(task, query, people);
    const matchesChannels = taskMatchesChannelFilters(task.tags, included, excluded, channelMatchMode);
    return matchesQuery && matchesChannels;
  }, [channelMatchMode, people]);

  // Find all tasks that directly match the filter
  const getDirectlyMatchingTasks = useCallback((query: string, includedChannels: string[], excludedChannels: string[]): Set<string> => {
    const matching = new Set<string>();
    
    for (const task of allTasks) {
      if (taskMatchesFilter(task, query, includedChannels, excludedChannels)) {
        matching.add(task.id);
      }
    }
    
    return matching;
  }, [allTasks, taskMatchesFilter]);

  // Get all descendants of given task IDs
  const getDescendants = useCallback((taskIds: Set<string>): Set<string> => {
    const descendants = new Set<string>();
    
    const addDescendants = (parentId: string) => {
      const children = childrenMap.get(parentId) || [];
      for (const child of children) {
        descendants.add(child.id);
        addDescendants(child.id);
      }
    };
    
    taskIds.forEach(id => addDescendants(id));
    return descendants;
  }, [childrenMap]);

  // Get ancestors of matching tasks to keep them visible
  const getAncestors = useCallback((matchingIds: Set<string>): Set<string> => {
    const ancestors = new Set<string>();
    
    const findAncestors = (taskId: string) => {
      const task = taskById.get(taskId);
      if (task?.parentId) {
        ancestors.add(task.parentId);
        findAncestors(task.parentId);
      }
    };
    
    matchingIds.forEach(id => findAncestors(id));
    return ancestors;
  }, [taskById]);

  const hasActiveFilters = searchQuery.trim() !== "" || includedChannels.length > 0 || excludedChannels.length > 0;

  // Compute matching tasks once
  const { directlyMatchingIds, ancestorIds, descendantIds, allVisibleIds } = useMemo(() => {
    if (!hasActiveFilters) {
      return { directlyMatchingIds: new Set<string>(), ancestorIds: new Set<string>(), descendantIds: new Set<string>(), allVisibleIds: new Set<string>() };
    }
    
    const directly = getDirectlyMatchingTasks(searchQuery, includedChannels, excludedChannels);
    const ancestors = getAncestors(directly);
    const descendants = getDescendants(directly);
    const allVisible = new Set([...directly, ...ancestors, ...descendants]);
    
    return { directlyMatchingIds: directly, ancestorIds: ancestors, descendantIds: descendants, allVisibleIds: allVisible };
  }, [hasActiveFilters, searchQuery, includedChannels, excludedChannels, getDirectlyMatchingTasks, getAncestors, getDescendants]);

  // Get visible tasks based on context and filters, sorted with priority system
  const visibleTasks = useMemo(() => {
    let rootTasks: Task[];
    
    if (currentContextId) {
      // Show children of current context
      rootTasks = childrenMap.get(currentContextId) || [];
    } else {
      // Show root-level tasks (no parent) - hide top-level comments
      rootTasks = (childrenMap.get(undefined) || []).filter(task => task.taskType !== "comment");
    }

    // Filter by pre-filtered tasks from Index (relay/person filtering)
    const filteredTaskIds = new Set(tasks.map(t => t.id));
    rootTasks = rootTasks.filter(task => filteredTaskIds.has(task.id));

    if (hasActiveFilters) {
      // Filter to show tasks that match, are ancestors, or are descendants of matches
      rootTasks = rootTasks.filter(task => allVisibleIds.has(task.id));
    }

    // Sort using the new priority system
    return sortTasks(rootTasks, sortContext);
  }, [currentContextId, childrenMap, hasActiveFilters, allVisibleIds, sortContext, tasks]);

  const currentContextTask = currentContextId ? taskById.get(currentContextId) || null : null;
  const handleSelectTask = (taskId: string) => {
    onFocusTask?.(taskId);
  };

  const handleGoUp = () => {
    if (!currentContextTask) {
      onFocusTask?.(null);
      return;
    }
    onFocusTask?.(currentContextTask.parentId || null);
  };

  const handleNewTask = async (
    content: string,
    taskTags: string[],
    taskRelays: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    explicitMentionPubkeys?: string[],
    priority?: number,
    attachments?: PublishedAttachment[],
    nip99?: Nip99Metadata
  ): Promise<TaskCreateResult> => {
    const result = await Promise.resolve(onNewTask(
      content,
      taskTags,
      taskRelays,
      taskType,
      dueDate,
      dueTime,
      dateType,
      currentContextId,
      undefined,
      explicitMentionPubkeys,
      priority,
      attachments,
      nip99
    ));
    if (result.ok) {
      setIsComposerExpanded(false);
    }
    return result;
  };

  const getFilteredChildren = useCallback((parentId: string): Task[] => {
    let children = childrenMap.get(parentId) || [];
    
    // Filter by pre-filtered tasks from Index (relay/person filtering)
    const filteredTaskIds = new Set(tasks.map(t => t.id));
    children = children.filter(child => filteredTaskIds.has(child.id));
    
    if (hasActiveFilters) {
      // Show children that are in the visible set (matching, ancestors, or descendants)
      children = children.filter(child => allVisibleIds.has(child.id));
    }

    // Sort using the new priority system
    return sortTasks(children, sortContext);
  }, [childrenMap, hasActiveFilters, allVisibleIds, sortContext, tasks]);

  // Check if a task directly matches the filter (for determining fold state)
  const isTaskDirectMatch = useCallback((taskId: string): boolean => {
    if (!hasActiveFilters) return true;
    return directlyMatchingIds.has(taskId);
  }, [hasActiveFilters, directlyMatchingIds]);

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

  const visibleAuthorPubkeys = useMemo(() => {
    const pubkeys = allTasks
      .map((task) => task.author.id)
      .filter((authorId) => authorId.length === 64 && /^[a-f0-9]+$/i.test(authorId));
    return Array.from(new Set(pubkeys));
  }, [allTasks]);
  const { profiles: authorProfiles } = useNostrProfiles(visibleAuthorPubkeys);

  // Task navigation with keyboard
  const { focusedTaskId: keyboardFocusedTaskId } = useTaskNavigation({
    taskIds: flattenedTaskIds,
    onSelectTask: handleSelectTask,
    onGoBack: handleGoUp,
    onFocusSidebar,
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
      {/* Top composer with context controls - hidden on mobile */}
      {!isMobile && currentContextId && (
        <FocusedTaskBreadcrumb
          allTasks={allTasks}
          focusedTaskId={currentContextId}
          onFocusTask={onFocusTask}
        />
      )}

      <SharedViewComposer
        visible={!isMobile && (Boolean(user) || forceShowComposer)}
        onSubmit={handleNewTask}
        relays={relays}
        channels={channels}
        composeChannels={composeChannels}
        people={people}
        onCancel={() => setIsComposerExpanded(false)}
        draftStorageKey={SHARED_COMPOSE_DRAFT_KEY}
        parentId={currentContextId || undefined}
        onSignInClick={onSignInClick}
        onClearChannelFilter={onClearChannelFilter}
        onClearPersonFilter={onClearPersonFilter}
        forceExpanded={forceShowComposer}
        forceExpandSignal={composeGuideActivationSignal}
        onExpandedChange={setIsComposerExpanded}
        mentionRequest={mentionRequest}
        composeRestoreRequest={composeRestoreRequest}
        className="relative z-20 border-b border-border px-4 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0"
        defaultContent={buildComposePrefillFromFiltersAndContext(channels, currentContextTask?.tags)}
        allowComment={Boolean(currentContextId)}
      />

      {/* Task List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1" data-onboarding="task-list">
        {visibleTasks.length === 0 ? (
          <FilteredEmptyState
            variant="collection"
            relays={relays}
            channels={channels}
            people={people}
            searchQuery={searchQuery}
          />
        ) : (
          visibleTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              filteredChildren={getFilteredChildren(task.id)}
              allTasks={allTasks}
              people={people}
              currentUser={currentUser}
              onSelect={handleSelectTask}
              onToggleComplete={onToggleComplete}
              onStatusChange={onStatusChange}
              matchedByFilter={isTaskDirectMatch(task.id)}
              isDirectMatchFn={isTaskDirectMatch}
              getFilteredChildrenFn={getFilteredChildren}
              hasActiveFilters={hasActiveFilters}
              activeRelays={relays.filter(r => r.isActive)}
              isKeyboardFocused={keyboardFocusedTaskId === task.id}
              onHashtagClick={onHashtagClick}
              onAuthorClick={onAuthorClick}
              onUndoPendingPublish={onUndoPendingPublish}
              isPendingPublishTask={isPendingPublishTask}
              isInteractionBlocked={isInteractionBlocked}
              onMediaClick={openTaskMedia}
              sortContext={sortContext}
              authorProfiles={authorProfiles}
            />
          ))
        )}
      </div>
      <TaskMediaLightbox
        open={activeMediaIndex !== null}
        mediaItem={activeMediaItem}
        mediaCount={mediaItems.length}
        mediaIndex={activeMediaIndex ?? 0}
        postMediaIndex={activePostMediaIndex}
        postMediaCount={activePostMediaCount}
        onOpenChange={(open) => {
          if (!open) closeMediaPreview();
        }}
        onPrevious={goToPreviousMedia}
        onNext={goToNextMedia}
        onPreviousPost={goToPreviousPost}
        onNextPost={goToNextPost}
        onOpenTask={(taskId) => onFocusTask?.(taskId)}
      />

    </main>
  );
}
