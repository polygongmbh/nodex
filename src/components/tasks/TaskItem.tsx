import { useState, useEffect, useRef } from "react";
import { ChevronRight, ChevronDown, MessageSquare, CheckSquare, MoreHorizontal, Calendar, Clock, Circle, CircleDot, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Task, Person, TaskStatus } from "@/types";
import { formatDistanceToNow, format } from "date-fns";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { linkifyContent } from "@/lib/linkify";

interface TaskItemProps {
  task: Task;
  children: Task[];
  allTasks: Task[];
  currentUser?: Person;
  depth?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onSelect?: (taskId: string) => void;
  onToggleComplete?: (taskId: string) => void;
  matchedByFilter?: boolean;
  isDirectMatchFn?: (taskId: string) => boolean;
}

export function TaskItem({
  task,
  children,
  allTasks,
  currentUser,
  depth = 0,
  isExpanded,
  onToggleExpand,
  onSelect,
  onToggleComplete,
  matchedByFilter = true,
  isDirectMatchFn,
}: TaskItemProps) {
  // Start collapsed if not directly matched by filter
  const [localExpanded, setLocalExpanded] = useState(isExpanded ?? matchedByFilter);
  const prevStatusRef = useRef(task.status);
  const timeAgo = formatDistanceToNow(task.timestamp, { addSuffix: true });

  // Auto-expand when marked in-progress, auto-collapse when marked done
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = task.status;
    
    if (prevStatus !== currentStatus) {
      if (currentStatus === "in-progress") {
        setLocalExpanded(true);
      } else if (currentStatus === "done") {
        setLocalExpanded(false);
      }
      prevStatusRef.current = currentStatus;
    }
  }, [task.status]);

  const hasChildren = children.length > 0;
  const isComment = task.taskType === "comment";
  const taskChildren = children.filter(c => c.taskType === "task");
  const commentChildren = children.filter(c => c.taskType === "comment");

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalExpanded(!localExpanded);
    onToggleExpand?.();
  };

  const handleSelect = () => {
    if (task.taskType === "task") {
      onSelect?.(task.id);
    }
  };

  const canCompleteTask = () => {
    if (task.taskType !== "task") return false;
    if (!currentUser) return false;
    const mentionedPeople = task.content.match(/@(\w+)/g)?.map(m => m.slice(1)) || [];
    if (mentionedPeople.length === 0) return true;
    return mentionedPeople.includes(currentUser.name);
  };

  return (
    <div className={cn("animate-fade-in", !matchedByFilter && "opacity-50")}>
      <div
        className={cn(
          "group flex items-start gap-2 py-2 px-3 rounded-lg transition-colors",
          isComment 
            ? "bg-muted/30 hover:bg-muted/50" 
            : "hover:bg-card/80 cursor-pointer",
          task.status === "done" && "opacity-60",
          depth > 0 && "ml-6 border-l-2 border-border pl-4"
        )}
        onClick={handleSelect}
      >
        {/* Expand/Collapse Toggle */}
        {hasChildren && !isComment ? (
          <button
            onClick={handleToggleExpand}
            className="flex-shrink-0 p-0.5 rounded hover:bg-muted mt-1"
          >
            {localExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="w-5 flex-shrink-0" />
        )}

        {/* Status toggle for tasks - tri-state: todo -> in-progress -> done */}
        {!isComment && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (canCompleteTask()) {
                onToggleComplete?.(task.id);
              }
            }}
            disabled={!canCompleteTask()}
            className={cn(
              "flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors",
              canCompleteTask() ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
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
        )}

        {/* Comment icon for comments */}
        {isComment && (
          <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
        )}

        {/* Avatar - only show for comments */}
        {isComment && (
          <Avatar className="w-6 h-6 flex-shrink-0">
            {task.author.avatar ? (
              <AvatarImage src={task.author.avatar} alt={task.author.displayName} />
            ) : null}
            <AvatarFallback className="bg-gradient-to-br from-primary/30 to-accent/30 text-foreground text-xs">
              {task.author.displayName.charAt(0)}
            </AvatarFallback>
          </Avatar>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Meta info - author/time only for comments, counts only for tasks */}
          {(isComment || taskChildren.length > 0 || commentChildren.length > 0) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
              {isComment && (
                <>
                  <span className="font-medium text-foreground/80">{task.author.displayName}</span>
                  <span>·</span>
                  <span>{timeAgo}</span>
                </>
              )}
              {!isComment && taskChildren.length > 0 && (
                <>
                  <span className="flex items-center gap-1">
                    <CheckSquare className="w-3 h-3" />
                    {taskChildren.filter(c => c.status === "done").length}/{taskChildren.length}
                  </span>
                </>
              )}
              {commentChildren.length > 0 && (
                <>
                  {!isComment && taskChildren.length > 0 && <span>·</span>}
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {commentChildren.length}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Task content */}
          <p className={cn(
            "text-sm leading-relaxed",
            task.status === "done" && "line-through text-muted-foreground"
          )}>
            {linkifyContent(task.content)}
          </p>

          {/* Due date */}
          {task.dueDate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
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
            <div className="flex flex-wrap gap-1 mt-1.5">
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

          {/* Completed indicator */}
          {task.status === "done" && task.completedBy && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <CheckSquare className="w-3 h-3" />
              <span>Completed by @{task.completedBy}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <button
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
        >
          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Children - comments first, then subtasks */}
      {localExpanded && hasChildren && (
        <div className="space-y-1">
          {/* Comments first */}
          {commentChildren.map((child) => {
            const grandchildren = allTasks.filter(t => t.parentId === child.id);
            const childMatched = isDirectMatchFn ? isDirectMatchFn(child.id) : true;
            return (
              <TaskItem
                key={child.id}
                task={child}
                children={grandchildren}
                allTasks={allTasks}
                currentUser={currentUser}
                depth={depth + 1}
                onSelect={onSelect}
                onToggleComplete={onToggleComplete}
                matchedByFilter={childMatched}
                isDirectMatchFn={isDirectMatchFn}
              />
            );
          })}
          {/* Subtasks after */}
          {taskChildren.map((child) => {
            const grandchildren = allTasks.filter(t => t.parentId === child.id);
            const childMatched = isDirectMatchFn ? isDirectMatchFn(child.id) : true;
            return (
              <TaskItem
                key={child.id}
                task={child}
                children={grandchildren}
                allTasks={allTasks}
                currentUser={currentUser}
                depth={depth + 1}
                onSelect={onSelect}
                onToggleComplete={onToggleComplete}
                matchedByFilter={childMatched}
                isDirectMatchFn={isDirectMatchFn}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
