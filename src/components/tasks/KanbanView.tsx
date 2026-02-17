import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNDK } from "@/lib/nostr/ndk-context";
import { Plus, X, Circle, CircleDot, CheckCircle2, Calendar, Clock, Layers } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Task, Relay, Channel, Person, TaskStatus } from "@/types";
import { TaskComposer } from "./TaskComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { linkifyContent } from "@/lib/linkify";
import { TaskMentionChips } from "./TaskMentionChips";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDueDateColorClass, sortTasks, buildChildrenMap, SortContext } from "@/lib/taskSorting";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { canUserChangeTaskStatus } from "@/lib/task-permissions";
import { sortByLatestModified } from "@/lib/kanban-sorting";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import type { KanbanDepthMode } from "./DesktopSearchDock";

interface KanbanViewProps {
  tasks: Task[];
  allTasks: Task[];
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  currentUser?: Person;
  searchQuery: string;
  depthMode: KanbanDepthMode;
  onNewTask: (
    content: string,
    tags: string[],
    relays: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    parentId?: string,
    initialStatus?: TaskStatus,
    explicitMentionPubkeys?: string[]
  ) => void;
  onToggleComplete: (taskId: string) => void;
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void;
  onFocusSidebar?: () => void;
  onHashtagClick?: (tag: string) => void;
}

const columns: { id: TaskStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { id: "todo", label: "To Do", icon: <Circle className="w-4 h-4" />, color: "text-muted-foreground" },
  { id: "in-progress", label: "In Progress", icon: <CircleDot className="w-4 h-4" />, color: "text-amber-500" },
  { id: "done", label: "Done", icon: <CheckCircle2 className="w-4 h-4" />, color: "text-primary" },
];

export function KanbanView({
  tasks,
  allTasks,
  relays,
  channels,
  people,
  currentUser,
  searchQuery,
  depthMode,
  onNewTask,
  onToggleComplete,
  focusedTaskId,
  onFocusTask,
  onStatusChange,
  onFocusSidebar,
  onHashtagClick,
}: KanbanViewProps) {
  const { user } = useNDK();
  const [composingColumn, setComposingColumn] = useState<TaskStatus | null>(null);

  const includedChannels = channels.filter(c => c.filterState === "included").map(c => c.name.toLowerCase());
  const excludedChannels = channels.filter(c => c.filterState === "excluded").map(c => c.name.toLowerCase());

  // Build children map
  const childrenMap = useMemo(() => buildChildrenMap(allTasks), [allTasks]);

  const sortContext: SortContext = useMemo(() => ({
    childrenMap,
    allTasks,
  }), [childrenMap, allTasks]);

  // Get all descendants of a task
  const getDescendantIds = useCallback((taskId: string): Set<string> => {
    const ids = new Set<string>();
    const addDescendants = (id: string) => {
      (childrenMap.get(id) || []).forEach(child => {
        ids.add(child.id);
        addDescendants(child.id);
      });
    };
    addDescendants(taskId);
    return ids;
  }, [childrenMap]);

  // Check if task has children
  const hasChildren = useCallback((taskId: string): boolean => {
    const children = childrenMap.get(taskId) || [];
    return children.some(c => c.taskType === "task");
  }, [childrenMap]);

  // Get depth of task from root
  const getDepth = useCallback((taskId: string): number => {
    const task = allTasks.find(t => t.id === taskId);
    if (!task?.parentId) return 1;
    return 1 + getDepth(task.parentId);
  }, [allTasks]);

  // Get full ancestor chain for a task
  const getAncestorChain = useCallback((taskId: string): { id: string; text: string }[] => {
    const chain: { id: string; text: string }[] = [];
    let current = allTasks.find(t => t.id === taskId);
    
    while (current?.parentId) {
      const parent = allTasks.find(t => t.id === current!.parentId);
      if (parent) {
        chain.unshift({
          id: parent.id,
          text: parent.content.slice(0, 20) + (parent.content.length > 20 ? "..." : "")
        });
        current = parent;
      } else {
        break;
      }
    }
    
    return chain;
  }, [allTasks]);

  // Get only task-type items, filtered by depth mode
  // Use pre-filtered tasks from Index (relay/person filtering already applied)
  const filteredTaskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);
  
  const kanbanTasks = useMemo(() => {
    return allTasks.filter(task => {
      if (task.taskType !== "task") return false;

      // Must be in pre-filtered tasks (relay/person filtering already applied)
      if (!filteredTaskIds.has(task.id)) return false;

      // If focused on a task, only show descendants
      if (focusedTaskId) {
        const descendantIds = getDescendantIds(focusedTaskId);
        if (!descendantIds.has(task.id)) return false;
      }

      // Apply search filter
      if (searchQuery && !task.content.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      
      // Apply channel exclusion filter
      if (excludedChannels.length > 0) {
        const taskTagsLower = task.tags.map(t => t.toLowerCase());
        if (taskTagsLower.some(t => excludedChannels.includes(t))) {
          return false;
        }
      }
      
      // Apply channel inclusion filter - AND logic: must have ALL included channels
      if (includedChannels.length > 0) {
        const taskTagsLower = task.tags.map(t => t.toLowerCase());
        if (!includedChannels.every(c => taskTagsLower.includes(c))) {
          return false;
        }
      }
      
      // Apply depth mode
      const depth = focusedTaskId 
        ? getDepth(task.id) - getDepth(focusedTaskId)
        : getDepth(task.id);
      
      if (depthMode === "leaves") {
        // Only show leaf tasks (no children)
        return !hasChildren(task.id);
      } else if (depthMode !== "all") {
        const maxDepth = parseInt(depthMode);
        return depth <= maxDepth;
      }

      return true;
    });
  }, [allTasks, filteredTaskIds, searchQuery, includedChannels, excludedChannels, focusedTaskId, depthMode, getDescendantIds, getDepth, hasChildren]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      "todo": [],
      "in-progress": [],
      "done": [],
    };
    
    kanbanTasks.forEach(task => {
      const status = task.status || "todo";
      grouped[status].push(task);
    });

    // Sort each column by latest modification.
    grouped["todo"] = sortByLatestModified(sortTasks(grouped["todo"], sortContext));
    grouped["in-progress"] = sortByLatestModified(sortTasks(grouped["in-progress"], sortContext));
    grouped["done"] = sortByLatestModified(sortTasks(grouped["done"], sortContext));

    return grouped;
  }, [kanbanTasks, sortContext]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId as TaskStatus;
    const task = kanbanTasks.find((item) => item.id === taskId);
    if (!task || !canUserChangeTaskStatus(task, currentUser)) return;
    
    if (onStatusChange) {
      onStatusChange(taskId, newStatus);
    } else {
      // Fallback to toggle if no status change handler
      onToggleComplete(taskId);
    }
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
      focusedTaskId || undefined,
      composingColumn || undefined,
      explicitMentionPubkeys
    );
    setComposingColumn(null);
  };

  // Flatten all visible task IDs for keyboard navigation (across all columns)
  const allVisibleTaskIds = useMemo(() => {
    return [...tasksByStatus["todo"], ...tasksByStatus["in-progress"], ...tasksByStatus["done"]].map(t => t.id);
  }, [tasksByStatus]);

  // Column-aware task IDs for Kanban navigation
  const columnTaskIds = useMemo(() => [
    tasksByStatus["todo"].map(t => t.id),
    tasksByStatus["in-progress"].map(t => t.id),
    tasksByStatus["done"].map(t => t.id),
  ], [tasksByStatus]);

  // Track keyboard focus state
  const [keyboardFocusedTaskId, setKeyboardFocusedTaskId] = useState<string | null>(null);
  const keyboardFocusedTaskIdRef = useRef<string | null>(null);
  const pendingRefocusRef = useRef<string | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    keyboardFocusedTaskIdRef.current = keyboardFocusedTaskId;
  }, [keyboardFocusedTaskId]);

  // Handle moving task left (to previous column) - preserves focus
  const handleMoveLeft = useCallback(() => {
    const focusedId = keyboardFocusedTaskIdRef.current;
    if (!focusedId) return;
    const task = kanbanTasks.find(t => t.id === focusedId);
    if (!task) return;
    if (!canUserChangeTaskStatus(task, currentUser)) return;
    
    const currentStatus = task.status || "todo";
    let newStatus: TaskStatus;
    
    if (currentStatus === "done") newStatus = "in-progress";
    else if (currentStatus === "in-progress") newStatus = "todo";
    else return; // Already at leftmost
    
    pendingRefocusRef.current = focusedId;
    onStatusChange?.(focusedId, newStatus);
  }, [kanbanTasks, currentUser, onStatusChange]);

  // Handle moving task right (to next column) - preserves focus
  const handleMoveRight = useCallback(() => {
    const focusedId = keyboardFocusedTaskIdRef.current;
    if (!focusedId) return;
    const task = kanbanTasks.find(t => t.id === focusedId);
    if (!task) return;
    if (!canUserChangeTaskStatus(task, currentUser)) return;
    
    const currentStatus = task.status || "todo";
    let newStatus: TaskStatus;
    
    if (currentStatus === "todo") newStatus = "in-progress";
    else if (currentStatus === "in-progress") newStatus = "done";
    else return; // Already at rightmost
    
    pendingRefocusRef.current = focusedId;
    onStatusChange?.(focusedId, newStatus);
  }, [kanbanTasks, currentUser, onStatusChange]);

  // Keyboard navigation - Kanban mode: arrows navigate, Shift+arrows/HJKL move tasks
  const { focusedTaskId: navFocusedTaskId, setFocusByTaskId } = useTaskNavigation({
    taskIds: allVisibleTaskIds,
    onSelectTask: (id) => onFocusTask?.(id),
    onMoveLeft: handleMoveLeft,
    onMoveRight: handleMoveRight,
    onFocusSidebar,
    enabled: composingColumn === null,
    kanbanMode: true,
    columnTaskIds,
  });

  // Sync navigation focus with local state
  useEffect(() => {
    setKeyboardFocusedTaskId(navFocusedTaskId);
  }, [navFocusedTaskId]);

  // After tasksByStatus updates, re-apply focus if we have a pending refocus
  useEffect(() => {
    if (pendingRefocusRef.current) {
      const taskIdToFocus = pendingRefocusRef.current;
      pendingRefocusRef.current = null;
      // Use requestAnimationFrame to ensure the state has fully updated
      requestAnimationFrame(() => {
        setFocusByTaskId(taskIdToFocus);
      });
    }
  }, [tasksByStatus, setFocusByTaskId]);

  // Scroll focused task into view
  const columnsContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (keyboardFocusedTaskId && columnsContainerRef.current) {
      const element = columnsContainerRef.current.querySelector(
        `[data-task-id="${keyboardFocusedTaskId}"]`
      );
      if (element) {
        element.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [keyboardFocusedTaskId]);
  
  // Determine if we should show context (depth > 1 or leaves mode)
  const showContext = depthMode !== "1";

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden">
      {focusedTaskId && (
        <FocusedTaskBreadcrumb
          allTasks={allTasks}
          focusedTaskId={focusedTaskId}
          onFocusTask={onFocusTask}
        />
      )}

      {/* Kanban Columns */}
      <div ref={columnsContainerRef} className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full min-w-max">
            {columns.map((column) => (
              <div
                key={column.id}
                className="flex flex-col w-80 bg-muted/30 rounded-lg flex-shrink-0"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={column.color}>{column.icon}</span>
                    <span className="font-medium">{column.label}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {tasksByStatus[column.id].length}
                    </span>
                  </div>
                  {user && (
                    <button
                      onClick={() => setComposingColumn(column.id)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                    >
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                </div>

                {/* Task Composer */}
                {composingColumn === column.id && (
                  <div className="p-3 border-b border-border bg-card/50 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">New task in {column.label}</span>
                      <button
                        onClick={() => setComposingColumn(null)}
                        className="p-0.5 rounded hover:bg-muted"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <TaskComposer
                      onSubmit={handleNewTask}
                      relays={relays}
                      channels={channels}
                      people={people}
                      onCancel={() => setComposingColumn(null)}
                      compact
                      defaultContent={(() => {
                        const prefillChannels = new Set<string>();
                        channels.filter(c => c.filterState === "included").forEach(c => prefillChannels.add(c.name));
                        if (prefillChannels.size === 0) return "";
                        return Array.from(prefillChannels).map(c => `#${c}`).join(" ") + " ";
                      })()}
                    />
                  </div>
                )}

                {/* Column Content - Droppable */}
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <ScrollArea 
                      className={cn(
                        "flex-1 p-2",
                        snapshot.isDraggingOver && "bg-primary/5"
                      )}
                    >
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="space-y-2 min-h-[100px]"
                      >
                        {tasksByStatus[column.id].map((task, index) => {
                          const ancestorChain = showContext ? getAncestorChain(task.id) : [];
                          const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
                          const isKeyboardFocused = keyboardFocusedTaskId === task.id;
                          
                          return (
                            <Draggable
                              key={task.id}
                              draggableId={task.id}
                              index={index}
                              isDragDisabled={!canUserChangeTaskStatus(task, currentUser)}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  data-task-id={task.id}
                                  className={cn(
                                    "bg-card border border-border rounded-lg p-3 shadow-sm transition-shadow cursor-grab active:cursor-grabbing",
                                    snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : "hover:shadow-md",
                                    task.status === "done" && "opacity-70",
                                    isKeyboardFocused && !snapshot.isDragging && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                                  )}
                                >
                                  {/* Parent chain for context */}
                                  {ancestorChain.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground mb-2">
                                      {ancestorChain.map((ancestor, i) => (
                                        <span key={ancestor.id} className="flex items-center gap-1">
                                          {i > 0 && <span className="text-muted-foreground/50">›</span>}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onFocusTask?.(ancestor.id);
                                            }}
                                            className={`${TASK_INTERACTION_STYLES.hoverLinkText} truncate max-w-[80px]`}
                                            title={`Focus task: ${ancestor.text}`}
                                            aria-label={`Focus task: ${ancestor.text}`}
                                          >
                                            {ancestor.text}
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Content - clickable to focus */}
                                  <p
                                    onClick={() => onFocusTask?.(task.id)}
                                    className={cn(
                                      `text-sm leading-relaxed cursor-pointer ${TASK_INTERACTION_STYLES.hoverText}`,
                                      task.status === "done" && "line-through text-muted-foreground"
                                    )}
                                    title="Focus this task"
                                  >
                                    {linkifyContent(task.content, onHashtagClick, {
                                      plainHashtags: task.status === "done",
                                      people,
                                    })}
                                  </p>
                                  <TaskMentionChips task={task} people={people} className="mt-2" />

                                  {/* Children indicator */}
                                  {hasChildren(task.id) && (
                                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                                      <Layers className="w-3 h-3" />
                                      <span>Has subtasks</span>
                                    </div>
                                  )}

                                  {/* Due date with color coding */}
                                  {task.dueDate && (
                                    <div className={cn("flex items-center gap-1.5 text-xs mt-2", dueDateColor)}>
                                      <Calendar className="w-3 h-3" />
                                      <span>{format(task.dueDate, "MMM d")}</span>
                                      {task.dueTime && (
                                        <>
                                          <Clock className="w-3 h-3" />
                                          <span>{task.dueTime}</span>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {/* Tags */}
                                  {task.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {task.tags.slice(0, 3).map((tag) => (
                                        <button
                                          key={tag}
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            onHashtagClick?.(tag);
                                          }}
                                          className={`px-1.5 py-0.5 rounded text-xs font-medium ${TASK_INTERACTION_STYLES.hashtagChip}`}
                                          aria-label={`Filter to #${tag}`}
                                          title={`Filter to #${tag}`}
                                        >
                                          #{tag}
                                        </button>
                                      ))}
                                      {task.tags.length > 3 && (
                                        <span className="text-xs text-muted-foreground">
                                          +{task.tags.length - 3}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    </ScrollArea>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      </div>

    </main>
  );
}
