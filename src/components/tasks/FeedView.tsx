import { Search, Circle, CircleDot, CheckCircle2, MessageSquare, Calendar, Clock } from "lucide-react";
import { Task, Relay, Tag, Person } from "@/types";
import { TaskComposer } from "./TaskComposer";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { linkifyContent } from "@/lib/linkify";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

interface FeedViewProps {
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

export function FeedView({
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
}: FeedViewProps) {
  const includedTags = tags.filter(t => t.filterState === "included").map(t => t.name.toLowerCase());
  const excludedTags = tags.filter(t => t.filterState === "excluded").map(t => t.name.toLowerCase());

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

  // Flatten and filter all tasks chronologically
  const feedTasks = allTasks
    .filter(task => {
      // If focused on a task, only show that task and its descendants
      if (focusedTaskId) {
        if (task.id !== focusedTaskId) {
          const descendantIds = getDescendantIds(focusedTaskId);
          if (!descendantIds.has(task.id)) return false;
        }
      }

      // Apply search filter
      if (searchQuery && !task.content.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Apply tag exclusion filter
      if (excludedTags.length > 0) {
        const taskTagsLower = task.tags.map(t => t.toLowerCase());
        if (taskTagsLower.some(t => excludedTags.includes(t))) {
          return false;
        }
      }
      // Apply tag inclusion filter
      if (includedTags.length > 0 && !task.tags.some(t => includedTags.includes(t.toLowerCase()))) {
        return false;
      }
      // Only show tasks that passed relay/excluded tag filters
      return tasks.some(t => t.id === task.id) || tasks.some(t => {
        // Check if this is a descendant of a filtered task
        let current = task;
        while (current.parentId) {
          if (tasks.some(ft => ft.id === current.parentId)) return true;
          current = allTasks.find(t => t.id === current.parentId) || current;
          if (!current.parentId) break;
        }
        return false;
      });
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const handleNewTask = (content: string, taskTags: string[], taskRelays: string[], taskType: string, dueDate?: Date, dueTime?: string) => {
    onNewTask(content, taskTags, taskRelays, taskType, dueDate, dueTime, focusedTaskId || undefined);
  };

  const canCompleteTask = (task: Task) => {
    if (task.taskType !== "task") return false;
    if (!currentUser) return false;
    const mentionedPeople = task.content.match(/@(\w+)/g)?.map(m => m.slice(1)) || [];
    if (mentionedPeople.length === 0) return true;
    return mentionedPeople.includes(currentUser.name);
  };

  const getParentBreadcrumb = (task: Task): { id: string; text: string }[] => {
    const breadcrumb: { id: string; text: string }[] = [];
    let current = task;
    while (current.parentId) {
      const parent = allTasks.find(t => t.id === current.parentId);
      if (parent) {
        breadcrumb.unshift({
          id: parent.id,
          text: parent.content.slice(0, 20) + (parent.content.length > 20 ? "..." : "")
        });
        current = parent;
      } else {
        break;
      }
    }
    return breadcrumb;
  };

  const focusedTask = focusedTaskId ? allTasks.find(t => t.id === focusedTaskId) : null;

  return (
    <main className="flex-1 flex flex-col h-full w-full max-w-3xl mx-auto overflow-hidden">
      {/* Header with Composer */}
      <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Feed</h2>
          {focusedTaskId && (
            <button
              onClick={() => onFocusTask?.(null)}
              className="text-xs text-primary hover:underline"
            >
              ← Back to all
            </button>
          )}
        </div>
        {focusedTask && (
          <div className="mb-3 p-2 bg-muted/50 rounded-lg border border-border">
            <div className="text-xs text-muted-foreground mb-1">Viewing subitems of:</div>
            <div className="text-sm font-medium">{focusedTask.content.slice(0, 60)}{focusedTask.content.length > 60 ? "..." : ""}</div>
          </div>
        )}
        <TaskComposer
          onSubmit={handleNewTask}
          relays={relays}
          tags={tags}
          people={people}
          onCancel={() => {}}
        />
      </div>

      {/* Feed List */}
      <div className="flex-1 overflow-y-auto">
        {feedTasks.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>No tasks to show</p>
          </div>
        ) : (
          feedTasks.map((task) => {
            const timeAgo = formatDistanceToNow(task.timestamp, { addSuffix: true });
            const isComment = task.taskType === "comment";
            const breadcrumb = getParentBreadcrumb(task);

            return (
              <div
                key={task.id}
                className={cn(
                  "border-b border-border p-4 hover:bg-card/50 transition-colors",
                  task.status === "done" && "opacity-60"
                )}
              >
                {/* Parent breadcrumb - clickable */}
                {breadcrumb.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    {breadcrumb.map((crumb, i) => (
                      <span key={crumb.id} className="flex items-center gap-1">
                        {i > 0 && <span>/</span>}
                        <button
                          onClick={() => onFocusTask?.(crumb.id)}
                          className="hover:text-primary hover:underline cursor-pointer"
                        >
                          {crumb.text}
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {/* Status toggle or comment icon */}
                  {!isComment ? (
                    <button
                      onClick={() => canCompleteTask(task) && onToggleComplete(task.id)}
                      disabled={!canCompleteTask(task)}
                      className={cn(
                        "flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors",
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
                  ) : (
                    <MessageSquare className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  )}

                  {/* Avatar */}
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    {task.author.avatar ? (
                      <AvatarImage src={task.author.avatar} alt={task.author.displayName} />
                    ) : null}
                    <AvatarFallback className="bg-gradient-to-br from-primary/30 to-accent/30 text-foreground text-xs">
                      {task.author.displayName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <span className="font-medium text-foreground">{task.author.displayName}</span>
                      <span>·</span>
                      <span>{timeAgo}</span>
                      {isComment && (
                        <>
                          <span>·</span>
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">comment</span>
                        </>
                      )}
                    </div>

                    {/* Clickable content to focus */}
                    <p
                      onClick={() => task.taskType === "task" && onFocusTask?.(task.id)}
                      className={cn(
                        "text-sm leading-relaxed",
                        task.status === "done" && "line-through text-muted-foreground",
                        task.taskType === "task" && "cursor-pointer hover:text-primary"
                      )}
                    >
                      {linkifyContent(task.content)}
                    </p>

                    {/* Due date */}
                    {task.dueDate && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                        <Calendar className="w-3 h-3" />
                        <span>{format(task.dueDate, "MMM d, yyyy")}</span>
                        {task.dueTime && (
                          <>
                            <Clock className="w-3 h-3 ml-1" />
                            <span>{task.dueTime}</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Tags */}
                    {task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {task.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
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
