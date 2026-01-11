import { useState, useMemo } from "react";
import { Search, Plus, X, Circle, CircleDot, CheckCircle2, Calendar, Clock, ArrowUpDown } from "lucide-react";
import { Task, Relay, Tag, Person } from "@/types";
import { TaskComposer } from "./TaskComposer";
import { linkifyContent } from "@/lib/linkify";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ListViewProps {
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

type SortField = "content" | "status" | "dueDate" | "timestamp";
type SortDirection = "asc" | "desc";

export function ListView({
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
}: ListViewProps) {
  const [isComposing, setIsComposing] = useState(false);
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

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

  // Get only task-type items
  const listTasks = useMemo(() => {
    let filtered = allTasks.filter(task => {
      if (task.taskType !== "task") return false;

      // If focused on a task, only show descendants
      if (focusedTaskId) {
        const descendantIds = getDescendantIds(focusedTaskId);
        if (!descendantIds.has(task.id)) return false;
      }

      if (searchQuery && !task.content.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (includedTags.length > 0 && !task.tags.some(t => includedTags.includes(t))) {
        return false;
      }
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case "content":
          comparison = a.content.localeCompare(b.content);
          break;
        case "status":
          const statusOrder = { "in-progress": 0, "todo": 1, "done": 2 };
          comparison = (statusOrder[a.status || "todo"] || 1) - (statusOrder[b.status || "todo"] || 1);
          break;
        case "dueDate":
          if (!a.dueDate && !b.dueDate) comparison = 0;
          else if (!a.dueDate) comparison = 1;
          else if (!b.dueDate) comparison = -1;
          else comparison = a.dueDate.getTime() - b.dueDate.getTime();
          break;
        case "timestamp":
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
          break;
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [allTasks, searchQuery, includedTags, sortField, sortDirection, focusedTaskId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleNewTask = (content: string, taskTags: string[], taskRelays: string[], taskType: string, dueDate?: Date, dueTime?: string) => {
    onNewTask(content, taskTags, taskRelays, taskType, dueDate, dueTime, focusedTaskId || undefined);
    setIsComposing(false);
  };

  const canCompleteTask = (task: Task) => {
    if (!currentUser) return false;
    const mentionedPeople = task.content.match(/@(\w+)/g)?.map(m => m.slice(1)) || [];
    if (mentionedPeople.length === 0) return true;
    return mentionedPeople.includes(currentUser.name);
  };

  const focusedTask = focusedTaskId ? allTasks.find(t => t.id === focusedTaskId) : null;

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className={cn(
        "flex items-center gap-1 text-xs font-medium",
        sortField === field ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <main className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">List View</h2>
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
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search tasks..."
                className="w-full bg-muted/50 border border-border rounded-lg pl-9 pr-4 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <button
              onClick={() => setIsComposing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          </div>
        </div>
        {focusedTask && (
          <div className="mt-3 p-2 bg-muted/50 rounded-lg border border-border">
            <div className="text-xs text-muted-foreground mb-1">Viewing subitems of:</div>
            <div className="text-sm font-medium">{focusedTask.content.slice(0, 80)}{focusedTask.content.length > 80 ? "..." : ""}</div>
          </div>
        )}
      </div>

      {/* Task Composer */}
      {isComposing && (
        <div className="border-b border-border p-4 bg-card/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Creating new task</span>
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

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-background border-b border-border">
            <tr>
              <th className="text-left p-3 w-10">
                <span className="sr-only">Status</span>
              </th>
              <th className="text-left p-3">
                <SortButton field="content">Task</SortButton>
              </th>
              <th className="text-left p-3 w-32">
                <SortButton field="status">Status</SortButton>
              </th>
              <th className="text-left p-3 w-40">
                <SortButton field="dueDate">Due Date</SortButton>
              </th>
              <th className="text-left p-3 w-48">Tags</th>
            </tr>
          </thead>
          <tbody>
            {listTasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground py-8">
                  No tasks found
                </td>
              </tr>
            ) : (
              listTasks.map((task) => (
                <tr
                  key={task.id}
                  className={cn(
                    "border-b border-border hover:bg-muted/30 transition-colors",
                    task.status === "done" && "opacity-60"
                  )}
                >
                  <td className="p-3">
                    <button
                      onClick={() => canCompleteTask(task) && onToggleComplete(task.id)}
                      disabled={!canCompleteTask(task)}
                      className={cn(
                        "p-0.5 rounded transition-colors",
                        canCompleteTask(task) ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                      )}
                    >
                      {task.status === "done" ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : task.status === "in-progress" ? (
                        <CircleDot className="w-5 h-5 text-amber-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                  </td>
                  <td className="p-3">
                    <p
                      onClick={() => onFocusTask?.(task.id)}
                      className={cn(
                        "text-sm cursor-pointer hover:text-primary",
                        task.status === "done" && "line-through text-muted-foreground"
                      )}
                    >
                      {linkifyContent(task.content)}
                    </p>
                  </td>
                  <td className="p-3">
                    <span className={cn(
                      "text-xs px-2 py-1 rounded-full font-medium",
                      task.status === "done" ? "bg-primary/10 text-primary" :
                      task.status === "in-progress" ? "bg-amber-500/10 text-amber-600" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {task.status === "in-progress" ? "In Progress" : 
                       task.status === "done" ? "Done" : "To Do"}
                    </span>
                  </td>
                  <td className="p-3">
                    {task.dueDate ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{format(task.dueDate, "MMM d, yyyy")}</span>
                        {task.dueTime && (
                          <>
                            <Clock className="w-3.5 h-3.5" />
                            <span>{task.dueTime}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
