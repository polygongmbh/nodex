import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Search, ChevronUp } from "lucide-react";
import { Task, Relay, Channel, Person } from "@/types";
import { TaskItem } from "./TaskItem";
import { TaskComposer } from "./TaskComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { sortTasks, buildChildrenMap, SortContext } from "@/lib/taskSorting";
import { useTaskNavigation } from "@/hooks/use-task-navigation";

interface TaskTreeProps {
  tasks: Task[];
  allTasks: Task[];
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  currentUser?: Person;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewTask: (content: string, tags: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string, parentId?: string) => void;
  onToggleComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
  onFocusSidebar?: () => void;
  isMobile?: boolean;
  onSignInClick?: () => void;
}

export function TaskTree({
  tasks,
  allTasks,
  relays,
  channels,
  people,
  currentUser,
  searchQuery,
  onSearchChange,
  onNewTask,
  onToggleComplete,
  onStatusChange,
  focusedTaskId,
  onFocusTask,
  onFocusSidebar,
  isMobile = false,
  onSignInClick,
}: TaskTreeProps) {
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
    const queryLower = query.toLowerCase();
    const taskTagsLower = task.tags.map(t => t.toLowerCase());
    
    // Exclude tasks with excluded channels
    if (excludedChannels.length > 0 && taskTagsLower.some(t => excludedChannels.includes(t))) {
      return false;
    }
    
    const matchesQuery = !query || task.content.toLowerCase().includes(queryLower);
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

  const handleNewTask = (content: string, taskTags: string[], taskRelays: string[], taskType: string, dueDate?: Date, dueTime?: string) => {
    onNewTask(content, taskTags, taskRelays, taskType, dueDate, dueTime, currentContextId);
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
      {!isMobile && (
        <div className="border-b border-border px-4 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0">
          <FocusedTaskBreadcrumb
            allTasks={allTasks}
            focusedTaskId={currentContextId}
            onFocusTask={onFocusTask}
            className="mb-3 -mx-4 -mt-3"
          />
          <div className="flex items-center justify-end w-full mb-3">
            <div className="flex items-center gap-2 mr-auto">
              {currentContextId && (
                <button
                  onClick={handleGoUp}
                  className="flex items-center gap-1 px-2 py-1 text-sm rounded-md hover:bg-muted transition-colors"
                >
                  <ChevronUp className="w-4 h-4" />
                  Up
                </button>
              )}
            </div>
          </div>
          <TaskComposer
            onSubmit={handleNewTask}
            relays={relays}
            channels={channels}
            people={people}
            onCancel={() => setIsComposerExpanded(false)}
            compact
            adaptiveSize
            draftStorageKey={SHARED_COMPOSE_DRAFT_KEY}
            onExpandedChange={setIsComposerExpanded}
            parentId={currentContextId}
            onSignInClick={onSignInClick}
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1">
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
            />
          ))
        )}
      </div>

      {/* Bottom search dock - hidden on mobile */}
      {!isMobile && (
        <div className="relative flex-shrink-0 border-t border-border bg-background/80 backdrop-blur-md">
          {/* Gradient fade overlay */}
          <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />
          <div className="px-4 py-3 flex items-center">
            <div className="relative w-full max-w-xl mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search tasks..."
                className="w-full bg-muted/60 border border-border/50 rounded-xl pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/30 shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
