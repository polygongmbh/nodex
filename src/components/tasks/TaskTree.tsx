import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNDK } from "@/lib/nostr/ndk-context";
import { Task, Relay, Channel, Person } from "@/types";
import { TaskItem } from "./TaskItem";
import { TaskComposer } from "./TaskComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { sortTasks, buildChildrenMap, SortContext } from "@/lib/taskSorting";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { taskMatchesTextQuery } from "@/lib/task-text-filter";

interface TaskTreeProps {
  tasks: Task[];
  allTasks: Task[];
  relays: Relay[];
  channels: Channel[];
  composeChannels?: Channel[];
  people: Person[];
  currentUser?: Person;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewTask: (
    content: string,
    tags: string[],
    relays: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    parentId?: string,
    initialStatus?: "todo" | "in-progress" | "done",
    explicitMentionPubkeys?: string[]
  ) => void;
  onToggleComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
  onFocusSidebar?: () => void;
  isMobile?: boolean;
  onSignInClick?: () => void;
  onHashtagClick?: (tag: string) => void;
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  onAuthorClick?: (author: Person) => void;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
}

export function TaskTree({
  tasks,
  allTasks,
  relays,
  channels,
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
  mentionRequest = null,
}: TaskTreeProps) {
  const { user } = useNDK();
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const SHARED_COMPOSE_DRAFT_KEY = "nodex.compose-draft.feed-tree";

  const currentContextId = focusedTaskId || null;

  // Build a map of task ID to children
  const childrenMap = useMemo(() => buildChildrenMap(allTasks), [allTasks]);

  const sortContext: SortContext = useMemo(() => ({
    childrenMap,
    allTasks,
  }), [childrenMap, allTasks]);

  // Check if a task or any of its descendants matches the filter
  // AND logic: task must have ALL included channels
  const taskMatchesFilter = useCallback((task: Task, query: string, includedChannels: string[], excludedChannels: string[]): boolean => {
    const taskTagsLower = task.tags.map(t => t.toLowerCase());
    
    // Exclude tasks with excluded channels
    if (excludedChannels.length > 0 && taskTagsLower.some(t => excludedChannels.includes(t))) {
      return false;
    }
    
    const matchesQuery = taskMatchesTextQuery(task, query);
    // AND logic: all included channels must be present
    const matchesChannels = includedChannels.length === 0 || includedChannels.every(c => taskTagsLower.includes(c));
    return matchesQuery && matchesChannels;
  }, []);

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
      const task = allTasks.find(t => t.id === taskId);
      if (task?.parentId) {
        ancestors.add(task.parentId);
        findAncestors(task.parentId);
      }
    };
    
    matchingIds.forEach(id => findAncestors(id));
    return ancestors;
  }, [allTasks]);

  const includedChannels = channels.filter(c => c.filterState === "included").map(c => c.name.toLowerCase());
  const excludedChannels = channels.filter(c => c.filterState === "excluded").map(c => c.name.toLowerCase());
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

  const currentContextTask = currentContextId ? allTasks.find(t => t.id === currentContextId) : null;
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

  const handleNewTask = (
    content: string,
    taskTags: string[],
    taskRelays: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    explicitMentionPubkeys?: string[]
  ) => {
    onNewTask(
      content,
      taskTags,
      taskRelays,
      taskType,
      dueDate,
      dueTime,
      currentContextId,
      undefined,
      explicitMentionPubkeys
    );
    setIsComposerExpanded(false);
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

      {/* Top composer with context controls - hidden on mobile */}
      {!isMobile && (user || forceShowComposer) && (
        <div
          className="relative z-20 border-b border-border px-4 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0"
          data-onboarding="focused-compose"
        >
          <TaskComposer
            onSubmit={handleNewTask}
            relays={relays}
            channels={composeChannels || channels}
            people={people}
            onCancel={() => setIsComposerExpanded(false)}
            compact
            adaptiveSize
            draftStorageKey={SHARED_COMPOSE_DRAFT_KEY}
            onExpandedChange={setIsComposerExpanded}
            parentId={currentContextId}
            onSignInClick={onSignInClick}
            forceExpanded={forceShowComposer}
            forceExpandSignal={composeGuideActivationSignal}
            mentionRequest={mentionRequest}
            defaultContent={(() => {
              const prefillChannels = new Set<string>();
              channels.filter(c => c.filterState === "included").forEach(c => prefillChannels.add(c.name));
              if (currentContextTask) {
                currentContextTask.tags.forEach(t => prefillChannels.add(t));
              }
              if (prefillChannels.size === 0) return "";
              return Array.from(prefillChannels).map(c => `#${c}`).join(" ") + " ";
            })()}
          />
        </div>
      )}

      {/* Task List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1" data-onboarding="task-list">
        {visibleTasks.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {hasActiveFilters ? (
              <p>No tasks match your filters</p>
            ) : currentContextId ? (
              <p>No subtasks yet</p>
            ) : (
              <p>No tasks yet</p>
            )}
          </div>
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
            />
          ))
        )}
      </div>

    </main>
  );
}
