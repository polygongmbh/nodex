import { useState, useMemo, useCallback } from "react";
import { Plus, X, Circle, CircleDot, CheckCircle2, Calendar, Clock, Layers, Leaf } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Task, Relay, Channel, Person, TaskStatus } from "@/types";
import { TaskComposer } from "./TaskComposer";
import { linkifyContent } from "@/lib/linkify";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDueDateColorClass, sortTasks, buildChildrenMap, SortContext } from "@/lib/taskSorting";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface KanbanViewProps {
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
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void;
}

const columns: { id: TaskStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { id: "todo", label: "To Do", icon: <Circle className="w-4 h-4" />, color: "text-muted-foreground" },
  { id: "in-progress", label: "In Progress", icon: <CircleDot className="w-4 h-4" />, color: "text-amber-500" },
  { id: "done", label: "Done", icon: <CheckCircle2 className="w-4 h-4" />, color: "text-primary" },
];

type DepthMode = "1" | "2" | "3" | "all" | "leaves";

export function KanbanView({
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
  focusedTaskId,
  onFocusTask,
  onStatusChange,
}: KanbanViewProps) {
  const [composingColumn, setComposingColumn] = useState<TaskStatus | null>(null);
  const [depthMode, setDepthMode] = useState<DepthMode>("1");

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

    // Sort each column
    grouped["todo"] = sortTasks(grouped["todo"], sortContext);
    grouped["in-progress"] = sortTasks(grouped["in-progress"], sortContext);
    grouped["done"] = sortTasks(grouped["done"], sortContext);

    return grouped;
  }, [kanbanTasks, sortContext]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId as TaskStatus;
    
    if (onStatusChange) {
      onStatusChange(taskId, newStatus);
    } else {
      // Fallback to toggle if no status change handler
      onToggleComplete(taskId);
    }
  };

  const handleNewTask = (content: string, taskTags: string[], taskRelays: string[], taskType: string, dueDate?: Date, dueTime?: string) => {
    onNewTask(content, taskTags, taskRelays, taskType, dueDate, dueTime, focusedTaskId || undefined);
    setComposingColumn(null);
  };

  const focusedTask = focusedTaskId ? allTasks.find(t => t.id === focusedTaskId) : null;
  
  // Determine if we should show context (depth > 1 or leaves mode)
  const showContext = depthMode !== "1";

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Kanban Board</h2>
            {focusedTaskId && (
              <button
                onClick={() => onFocusTask?.(null)}
                className="text-xs text-primary hover:underline"
              >
                ← Back to all
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <Select value={depthMode} onValueChange={(v) => setDepthMode(v as DepthMode)}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Top-level only</SelectItem>
                  <SelectItem value="2">2 levels deep</SelectItem>
                  <SelectItem value="3">3 levels deep</SelectItem>
                  <SelectItem value="all">All levels</SelectItem>
                  <SelectItem value="leaves">
                    <span className="flex items-center gap-1">
                      <Leaf className="w-3 h-3" />
                      Leaf tasks only
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search tasks..."
                className="w-full bg-muted/50 border border-border rounded-lg pl-3 pr-4 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>
        {focusedTask && (
          <div className="mt-3 p-2 bg-muted/50 rounded-lg border border-border">
            <div className="text-xs text-muted-foreground mb-1">Viewing subitems of:</div>
            <div className="text-sm font-medium">{focusedTask.content.slice(0, 80)}{focusedTask.content.length > 80 ? "..." : ""}</div>
          </div>
        )}
      </div>

      {/* Kanban Columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
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
                  <button
                    onClick={() => setComposingColumn(column.id)}
                    className="p-1 rounded hover:bg-muted transition-colors"
                  >
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </button>
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
                          
                          return (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={cn(
                                    "bg-card border border-border rounded-lg p-3 shadow-sm transition-shadow cursor-grab active:cursor-grabbing",
                                    snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : "hover:shadow-md",
                                    task.status === "done" && "opacity-70"
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
                                            className="hover:text-primary hover:underline truncate max-w-[80px]"
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
                                      "text-sm leading-relaxed cursor-pointer hover:text-primary",
                                      task.status === "done" && "line-through text-muted-foreground"
                                    )}
                                  >
                                    {linkifyContent(task.content)}
                                  </p>

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
                                        <span
                                          key={tag}
                                          className="px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary"
                                        >
                                          #{tag}
                                        </span>
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
