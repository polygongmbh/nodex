import { useState, useMemo } from "react";
import { Plus, X, Circle, CircleDot, CheckCircle2, Calendar, Clock } from "lucide-react";
import { Task, Relay, Tag, Person, TaskStatus } from "@/types";
import { TaskComposer } from "./TaskComposer";
import { linkifyContent } from "@/lib/linkify";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface KanbanViewProps {
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
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
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
  tags,
  people,
  currentUser,
  searchQuery,
  onSearchChange,
  onNewTask,
  onToggleComplete,
  focusedTaskId,
  onFocusTask,
}: KanbanViewProps) {
  const [composingColumn, setComposingColumn] = useState<TaskStatus | null>(null);

  const includedTags = tags.filter(t => t.filterState === "included").map(t => t.name);

  // Get all descendants of a task
  const getDescendantIds = (taskId: string): Set<string> => {
    const ids = new Set<string>();
    const addDescendants = (id: string) => {
      allTasks.filter(t => t.parentId === id).forEach(child => {
        ids.add(child.id);
        addDescendants(child.id);
      });
    };
    addDescendants(taskId);
    return ids;
  };

  // Get only task-type items (not comments), filtered
  const kanbanTasks = useMemo(() => {
    return allTasks.filter(task => {
      if (task.taskType !== "task") return false;

      // If focused on a task, only show descendants
      if (focusedTaskId) {
        const descendantIds = getDescendantIds(focusedTaskId);
        if (!descendantIds.has(task.id)) return false;
      }

      // Apply search filter
      if (searchQuery && !task.content.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Apply tag filter
      if (includedTags.length > 0 && !task.tags.some(t => includedTags.includes(t))) {
        return false;
      }
      // Check if in filtered tasks or descendant
      return tasks.some(t => t.id === task.id) || tasks.some(t => {
        let current = task;
        while (current.parentId) {
          if (tasks.some(ft => ft.id === current.parentId)) return true;
          current = allTasks.find(t => t.id === current.parentId) || current;
          if (!current.parentId) break;
        }
        return false;
      });
    });
  }, [allTasks, tasks, searchQuery, includedTags, focusedTaskId]);

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

    return grouped;
  }, [kanbanTasks]);

  const handleNewTask = (content: string, taskTags: string[], taskRelays: string[], taskType: string, dueDate?: Date, dueTime?: string) => {
    onNewTask(content, taskTags, taskRelays, taskType, dueDate, dueTime, focusedTaskId || undefined);
    setComposingColumn(null);
  };

  const canCompleteTask = (task: Task) => {
    if (!currentUser) return false;
    const mentionedPeople = task.content.match(/@(\w+)/g)?.map(m => m.slice(1)) || [];
    if (mentionedPeople.length === 0) return true;
    return mentionedPeople.includes(currentUser.name);
  };

  const getParentName = (task: Task): { id: string; text: string } | null => {
    if (!task.parentId) return null;
    const parent = allTasks.find(t => t.id === task.parentId);
    return parent ? { id: parent.id, text: parent.content.slice(0, 25) + (parent.content.length > 25 ? "..." : "") } : null;
  };

  const focusedTask = focusedTaskId ? allTasks.find(t => t.id === focusedTaskId) : null;

  return (
    <main className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm">
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
        {focusedTask && (
          <div className="mt-3 p-2 bg-muted/50 rounded-lg border border-border">
            <div className="text-xs text-muted-foreground mb-1">Viewing subitems of:</div>
            <div className="text-sm font-medium">{focusedTask.content.slice(0, 80)}{focusedTask.content.length > 80 ? "..." : ""}</div>
          </div>
        )}
      </div>

      {/* Kanban Columns */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {columns.map((column) => (
            <div
              key={column.id}
              className="flex flex-col w-80 bg-muted/30 rounded-lg"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between p-3 border-b border-border">
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
                <div className="p-3 border-b border-border bg-card/50">
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
                    tags={tags}
                    people={people}
                    onCancel={() => setComposingColumn(null)}
                    compact
                  />
                </div>
              )}

              {/* Column Content */}
              <ScrollArea className="flex-1 p-2">
                <div className="space-y-2">
                  {tasksByStatus[column.id].map((task) => {
                    const parentInfo = getParentName(task);
                    
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "bg-card border border-border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow",
                          task.status === "done" && "opacity-70"
                        )}
                      >
                        {/* Parent reference - clickable */}
                        {parentInfo && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onFocusTask?.(parentInfo.id);
                            }}
                            className="text-xs text-muted-foreground mb-1.5 truncate block w-full text-left hover:text-primary hover:underline"
                          >
                            ↳ {parentInfo.text}
                          </button>
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

                        {/* Due date */}
                        {task.dueDate && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
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

                        {/* Status toggle */}
                        <div className="flex items-center justify-end mt-2 pt-2 border-t border-border">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canCompleteTask(task)) onToggleComplete(task.id);
                            }}
                            disabled={!canCompleteTask(task)}
                            className={cn(
                              "p-1 rounded transition-colors",
                              canCompleteTask(task) ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                            )}
                          >
                            {task.status === "done" ? (
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            ) : task.status === "in-progress" ? (
                              <CircleDot className="w-4 h-4 text-amber-500" />
                            ) : (
                              <Circle className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {tasksByStatus[column.id].length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-8">
                      No tasks
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
