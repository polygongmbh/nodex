import { useState, useMemo, useCallback } from "react";
import { Search, ChevronUp, Plus, X } from "lucide-react";
import { Task, Relay, Tag, Person } from "@/types";
import { TaskItem } from "./TaskItem";
import { TaskComposer } from "./TaskComposer";
import { sortTasks, buildChildrenMap, SortContext } from "@/lib/taskSorting";

interface TaskTreeProps {
  tasks: Task[];
  allTasks: Task[];
  relays: Relay[];
  tags: Tag[];
  people: Person[];
  currentUser?: Person;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewTask: (content: string, tags: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string, parentId?: string) => void;
  onToggleComplete: (taskId: string) => void;
  isMobile?: boolean;
}

export function TaskTree({
  tasks,
  allTasks,
  relays,
  tags,
  people,
  currentUser,
  searchQuery,
  onSearchChange,
  onNewTask,
  onToggleComplete,
  isMobile = false,
}: TaskTreeProps) {
  const [contextStack, setContextStack] = useState<string[]>([]);
  const [isComposing, setIsComposing] = useState(false);

  const currentContextId = contextStack[contextStack.length - 1];

  // Build a map of task ID to children
  const childrenMap = useMemo(() => buildChildrenMap(allTasks), [allTasks]);

  const sortContext: SortContext = useMemo(() => ({
    childrenMap,
    allTasks,
  }), [childrenMap, allTasks]);

  // Check if a task or any of its descendants matches the filter
  const taskMatchesFilter = useCallback((task: Task, query: string, includedTags: string[], excludedTags: string[]): boolean => {
    const queryLower = query.toLowerCase();
    const taskTagsLower = task.tags.map(t => t.toLowerCase());
    
    // Exclude tasks with excluded tags
    if (excludedTags.length > 0 && taskTagsLower.some(t => excludedTags.includes(t))) {
      return false;
    }
    
    const matchesQuery = !query || task.content.toLowerCase().includes(queryLower);
    const matchesTags = includedTags.length === 0 || taskTagsLower.some(t => includedTags.includes(t));
    return matchesQuery && matchesTags;
  }, []);

  // Find all tasks that directly match the filter
  const getDirectlyMatchingTasks = useCallback((query: string, includedTags: string[], excludedTags: string[]): Set<string> => {
    const matching = new Set<string>();
    
    for (const task of allTasks) {
      if (taskMatchesFilter(task, query, includedTags, excludedTags)) {
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

  const includedTags = tags.filter(t => t.filterState === "included").map(t => t.name.toLowerCase());
  const excludedTags = tags.filter(t => t.filterState === "excluded").map(t => t.name.toLowerCase());
  const hasActiveFilters = searchQuery.trim() !== "" || includedTags.length > 0 || excludedTags.length > 0;

  // Compute matching tasks once
  const { directlyMatchingIds, ancestorIds, descendantIds, allVisibleIds } = useMemo(() => {
    if (!hasActiveFilters) {
      return { directlyMatchingIds: new Set<string>(), ancestorIds: new Set<string>(), descendantIds: new Set<string>(), allVisibleIds: new Set<string>() };
    }
    
    const directly = getDirectlyMatchingTasks(searchQuery, includedTags, excludedTags);
    const ancestors = getAncestors(directly);
    const descendants = getDescendants(directly);
    const allVisible = new Set([...directly, ...ancestors, ...descendants]);
    
    return { directlyMatchingIds: directly, ancestorIds: ancestors, descendantIds: descendants, allVisibleIds: allVisible };
  }, [hasActiveFilters, searchQuery, includedTags, excludedTags, getDirectlyMatchingTasks, getAncestors, getDescendants]);

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
    setContextStack(prev => [...prev, taskId]);
  };

  const handleGoUp = () => {
    setContextStack(prev => prev.slice(0, -1));
  };

  const handleNewTask = (content: string, taskTags: string[], taskRelays: string[], taskType: string, dueDate?: Date, dueTime?: string) => {
    onNewTask(content, taskTags, taskRelays, taskType, dueDate, dueTime, currentContextId);
    setIsComposing(false);
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

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      {/* Header with context navigation - hidden on mobile */}
      {!isMobile && (
        <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {contextStack.length > 0 && (
                <button
                  onClick={handleGoUp}
                  className="flex items-center gap-1 px-2 py-1 text-sm rounded-md hover:bg-muted transition-colors"
                >
                  <ChevronUp className="w-4 h-4" />
                  Up
                </button>
              )}
              <h2 className="text-lg font-semibold">
                {currentContextTask ? currentContextTask.content : "All Tasks"}
              </h2>
            </div>
            <button
              onClick={() => setIsComposing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              {currentContextId ? "Add Subtask" : "New Task"}
            </button>
          </div>

          {/* Breadcrumb */}
          {contextStack.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <button onClick={() => setContextStack([])} className="hover:text-foreground">
                All Tasks
              </button>
              {contextStack.map((id, index) => {
                const task = allTasks.find(t => t.id === id);
                return (
                  <span key={id} className="flex items-center gap-1">
                    <span>/</span>
                    <button 
                      onClick={() => setContextStack(prev => prev.slice(0, index + 1))}
                      className="hover:text-foreground truncate max-w-[150px]"
                    >
                      {task?.content.slice(0, 30)}...
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Task Composer */}
      {isComposing && (
        <div className="border-b border-border p-4 bg-card/30 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {currentContextId ? `Adding subtask to "${currentContextTask?.content.slice(0, 30)}..."` : "Creating new root task"}
            </span>
            <button
              onClick={() => setIsComposing(false)}
              className="p-1 rounded-full hover:bg-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <TaskComposer
            onSubmit={handleNewTask}
            relays={relays}
            tags={tags}
            people={people}
            onCancel={() => setIsComposing(false)}
            defaultContent={(() => {
              // Collect tags to prefill
              const prefillTags = new Set<string>();
              
              // Add included filter tags
              tags.filter(t => t.filterState === "included").forEach(t => prefillTags.add(t.name));
              
              // If in context (subtask), add parent task's tags
              if (currentContextTask) {
                currentContextTask.tags.forEach(t => prefillTags.add(t));
              }
              
              // Format as hashtags with trailing space
              if (prefillTags.size === 0) return "";
              return Array.from(prefillTags).map(t => `#${t}`).join(" ") + " ";
            })()}
          />
        </div>
      )}

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {visibleTasks.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {hasActiveFilters ? (
              <p>No tasks match your filters</p>
            ) : currentContextId ? (
              <div>
                <p className="mb-3">No subtasks yet</p>
                <button
                  onClick={() => setIsComposing(true)}
                  className="text-primary hover:underline"
                >
                  Add the first subtask
                </button>
              </div>
            ) : (
              <div>
                <p className="mb-3">No tasks yet</p>
                <button
                  onClick={() => setIsComposing(true)}
                  className="text-primary hover:underline"
                >
                  Create your first task
                </button>
              </div>
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
              matchedByFilter={isTaskDirectMatch(task.id)}
              isDirectMatchFn={isTaskDirectMatch}
              getFilteredChildrenFn={getFilteredChildren}
              hasActiveFilters={hasActiveFilters}
              activeRelays={relays.filter(r => r.isActive)}
            />
          ))
        )}
      </div>

      {/* Search Bar */}
      <div className="border-t border-border p-3 bg-background/95 backdrop-blur-sm flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks..."
            className="w-full bg-muted/50 border border-border rounded-lg pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>
    </main>
  );
}
