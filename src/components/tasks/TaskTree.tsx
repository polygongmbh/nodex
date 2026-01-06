import { useState, useMemo, useCallback } from "react";
import { Search, ChevronUp, Plus, X } from "lucide-react";
import { Task, Relay, Tag, Person } from "@/types";
import { TaskItem } from "./TaskItem";
import { TaskComposer } from "./TaskComposer";

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
}: TaskTreeProps) {
  const [contextStack, setContextStack] = useState<string[]>([]);
  const [isComposing, setIsComposing] = useState(false);

  const currentContextId = contextStack[contextStack.length - 1];

  // Build a map of task ID to children
  const childrenMap = useMemo(() => {
    const map = new Map<string | undefined, Task[]>();
    allTasks.forEach(task => {
      const parentId = task.parentId;
      if (!map.has(parentId)) {
        map.set(parentId, []);
      }
      map.get(parentId)!.push(task);
    });
    return map;
  }, [allTasks]);

  // Check if a task or any of its descendants matches the filter
  const taskMatchesFilter = useCallback((task: Task, query: string, includedTags: string[]): boolean => {
    const queryLower = query.toLowerCase();
    const matchesQuery = !query || task.content.toLowerCase().includes(queryLower);
    const matchesTags = includedTags.length === 0 || task.tags.some(t => includedTags.includes(t));
    return matchesQuery && matchesTags;
  }, []);

  // Find all tasks that match or have matching descendants
  const getMatchingTasks = useCallback((taskId: string | undefined, query: string, includedTags: string[]): Set<string> => {
    const matching = new Set<string>();
    
    const checkTask = (id: string | undefined): boolean => {
      const children = childrenMap.get(id) || [];
      let hasMatchingChild = false;
      
      for (const child of children) {
        const childMatches = checkTask(child.id);
        if (childMatches) {
          hasMatchingChild = true;
          matching.add(child.id);
        }
      }
      
      if (id) {
        const task = allTasks.find(t => t.id === id);
        if (task && taskMatchesFilter(task, query, includedTags)) {
          matching.add(id);
          return true;
        }
      }
      
      return hasMatchingChild;
    };
    
    checkTask(taskId);
    return matching;
  }, [allTasks, childrenMap, taskMatchesFilter]);

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

  const includedTags = tags.filter(t => t.filterState === "included").map(t => t.name);
  const hasActiveFilters = searchQuery.trim() !== "" || includedTags.length > 0;

  // Get visible tasks based on context and filters
  const visibleTasks = useMemo(() => {
    let rootTasks: Task[];
    
    if (currentContextId) {
      // Show children of current context
      rootTasks = childrenMap.get(currentContextId) || [];
    } else {
      // Show root-level tasks (no parent)
      rootTasks = childrenMap.get(undefined) || [];
    }

    if (!hasActiveFilters) {
      return rootTasks;
    }

    // Apply filtering
    const matchingIds = getMatchingTasks(currentContextId, searchQuery, includedTags);
    const ancestorIds = getAncestors(matchingIds);
    
    // Filter to show tasks that match or are ancestors of matches
    return rootTasks.filter(task => 
      matchingIds.has(task.id) || ancestorIds.has(task.id)
    );
  }, [currentContextId, childrenMap, hasActiveFilters, searchQuery, includedTags, getMatchingTasks, getAncestors]);

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
    const children = childrenMap.get(parentId) || [];
    
    if (!hasActiveFilters) {
      return children;
    }

    const matchingIds = getMatchingTasks(currentContextId, searchQuery, includedTags);
    const ancestorIds = getAncestors(matchingIds);
    
    return children.filter(child => 
      matchingIds.has(child.id) || ancestorIds.has(child.id)
    );
  }, [childrenMap, hasActiveFilters, currentContextId, searchQuery, includedTags, getMatchingTasks, getAncestors]);

  return (
    <main className="flex-1 flex flex-col h-screen max-w-3xl">
      {/* Header with context navigation */}
      <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm">
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

      {/* Task Composer */}
      {isComposing && (
        <div className="border-b border-border p-4 bg-card/30">
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
              children={getFilteredChildren(task.id)}
              allTasks={allTasks}
              currentUser={currentUser}
              onSelect={handleSelectTask}
              onToggleComplete={onToggleComplete}
            />
          ))
        )}
      </div>

      {/* Search Bar */}
      <div className="border-t border-border p-3 bg-background/95 backdrop-blur-sm">
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
