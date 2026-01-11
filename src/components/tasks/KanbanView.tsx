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
}: KanbanViewProps) {
  const [composingColumn, setComposingColumn] = useState<TaskStatus | null>(null);

  const includedTags = tags.filter(t => t.filterState === "included").map(t => t.name);

  // Get only task-type items (not comments), filtered
  const kanbanTasks = useMemo(() => {
    return allTasks.filter(task => {
      if (task.taskType !== "task") return false;
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
  }, [allTasks, tasks, searchQuery, includedTags]);

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
    onNewTask(content, taskTags, taskRelays, taskType, dueDate, dueTime);
    setComposingColumn(null);
  };

  const canCompleteTask = (task: Task) => {
    if (!currentUser) return false;
    const mentionedPeople = task.content.match(/@(\w+)/g)?.map(m => m.slice(1)) || [];
    if (mentionedPeople.length === 0) return true;
    return mentionedPeople.includes(currentUser.name);
  };

  const getParentName = (task: Task): string | null => {
    if (!task.parentId) return null;
    const parent = allTasks.find(t => t.id === task.parentId);
    return parent ? parent.content.slice(0, 25) + (parent.content.length > 25 ? "..." : "") : null;
  };

  return (
    <main className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Kanban Board</h2>
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
                    const parentName = getParentName(task);
                    
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "bg-card border border-border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer",
                          task.status === "done" && "opacity-70"
                        )}
                        onClick={() => canCompleteTask(task) && onToggleComplete(task.id)}
                      >
                        {/* Parent reference */}
                        {parentName && (
                          <div className="text-xs text-muted-foreground mb-1.5 truncate">
                            ↳ {parentName}
                          </div>
                        )}

                        {/* Content */}
                        <p className={cn(
                          "text-sm leading-relaxed",
                          task.status === "done" && "line-through text-muted-foreground"
                        )}>
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