import { useState, useEffect, useRef } from "react";
import { ChevronRight, ChevronDown, ChevronsDown, MessageSquare, CheckSquare, MoreHorizontal, Calendar, Clock, Circle, CircleDot, CheckCircle2, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Task, Person, TaskStatus, Relay } from "@/types";
import { formatDistanceToNow, format } from "date-fns";
import { UserAvatar } from "@/components/ui/user-avatar";
import { linkifyContent } from "@/lib/linkify";
import { sortTasks, buildChildrenMap } from "@/lib/taskSorting";
import { useNostrProfile } from "@/hooks/use-nostr-profiles";
import { shouldAutoOpenStatusMenuOnFocus } from "@/lib/status-menu-focus";
import { canUserChangeTaskStatus } from "@/lib/task-permissions";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Fold states: collapsed -> matchingOnly -> allVisible
type FoldState = "collapsed" | "matchingOnly" | "allVisible";

interface TaskItemProps {
  task: Task;
  filteredChildren: Task[];
  allTasks: Task[];
  currentUser?: Person;
  depth?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onSelect?: (taskId: string) => void;
  onToggleComplete?: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  matchedByFilter?: boolean;
  isDirectMatchFn?: (taskId: string) => boolean;
  getFilteredChildrenFn?: (parentId: string) => Task[];
  hasActiveFilters?: boolean;
  parentFoldState?: FoldState; // Propagate parent's fold state for recursive expansion
  activeRelays?: Relay[]; // For showing relay source when multiple are active
  isKeyboardFocused?: boolean; // For keyboard navigation highlight
  onHashtagClick?: (tag: string) => void;
  onAuthorClick?: (author: Person) => void;
}

export function TaskItem({
  task,
  filteredChildren,
  allTasks,
  currentUser,
  depth = 0,
  isExpanded,
  onToggleExpand,
  onSelect,
  onToggleComplete,
  onStatusChange,
  matchedByFilter = true,
  isDirectMatchFn,
  getFilteredChildrenFn,
  hasActiveFilters = false,
  parentFoldState,
  activeRelays = [],
  isKeyboardFocused = false,
  onHashtagClick,
  onAuthorClick,
}: TaskItemProps) {
  // Three-state fold: matchingOnly -> collapsed -> allVisible (skip allVisible if same as matching)
  const [localFoldState, setLocalFoldState] = useState<FoldState>("matchingOnly");
  
  // If parent is in allVisible state, this child should also be allVisible
  const foldState: FoldState = parentFoldState === "allVisible" ? "allVisible" : localFoldState;
  const prevStatusRef = useRef(task.status);
  const prevHasActiveFiltersRef = useRef(hasActiveFilters);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusTriggerPointerDownRef = useRef(false);
  const allowStatusMenuOpenRef = useRef(false);
  const timeAgo = formatDistanceToNow(task.timestamp, { addSuffix: true });
  
  // Fetch author profile from Nostr (only if author.id looks like a pubkey)
  const isPubkey = task.author.id.length === 64 && /^[a-f0-9]+$/.test(task.author.id);
  const { profile: nostrProfile } = useNostrProfile(isPubkey ? task.author.id : null);
  
  // Use Nostr profile if available, fallback to task author
  const authorName = nostrProfile?.displayName || nostrProfile?.name || task.author.displayName;
  const authorAvatar = nostrProfile?.picture || task.author.avatar;
  const authorNip05 = nostrProfile?.nip05;
  const authorPerson: Person = {
    ...task.author,
    name: nostrProfile?.name || task.author.name,
    displayName: authorName,
    avatar: authorAvatar,
  };

  // Reset fold state when filters change
  useEffect(() => {
    if (prevHasActiveFiltersRef.current !== hasActiveFilters) {
      setLocalFoldState("matchingOnly");
      prevHasActiveFiltersRef.current = hasActiveFilters;
    }
  }, [hasActiveFilters]);

  // Auto-expand when marked in-progress, auto-collapse when marked done
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = task.status;
    
    if (prevStatus !== currentStatus) {
      if (currentStatus === "in-progress") {
        setLocalFoldState("matchingOnly");
      } else if (currentStatus === "done") {
        setLocalFoldState("collapsed");
      }
      prevStatusRef.current = currentStatus;
    }
  }, [task.status]);

  // Get ALL children from allTasks for total counts
  const allChildren = allTasks.filter(t => t.parentId === task.id);
  const allTaskChildren = allChildren.filter(c => c.taskType === "task");
  const allCommentChildren = allChildren.filter(c => c.taskType === "comment");
  
  // Get filtered children for display (matching filter OR not done when no filters)
  const filteredTaskChildren = filteredChildren.filter(c => c.taskType === "task");
  const filteredCommentChildren = filteredChildren.filter(c => c.taskType === "comment");
  
  // When no active filters, "matching" means not done
  const defaultMatchingTaskChildren = allTaskChildren.filter(c => c.status !== "done");
  const defaultMatchingCommentChildren = allCommentChildren;
  
  // Determine if "expand all" would differ from "expand matching"
  const matchingTaskCount = hasActiveFilters ? filteredTaskChildren.length : defaultMatchingTaskChildren.length;
  const matchingCommentCount = hasActiveFilters ? filteredCommentChildren.length : defaultMatchingCommentChildren.length;
  const allVisibleDiffersFromMatching = 
    allTaskChildren.length !== matchingTaskCount || 
    allCommentChildren.length !== matchingCommentCount;
  
  const hasChildren = allChildren.length > 0;
  const isComment = task.taskType === "comment";

  // Cycle through fold states: matchingOnly -> collapsed -> allVisible (skip allVisible if same as matching)
  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalFoldState(prev => {
      if (prev === "matchingOnly") return "collapsed";
      if (prev === "collapsed") {
        // Skip allVisible if it's the same as matching
        return allVisibleDiffersFromMatching ? "allVisible" : "matchingOnly";
      }
      // From allVisible, go back to matchingOnly
      return "matchingOnly";
    });
    onToggleExpand?.();
  };

  const handleSelect = () => {
    onSelect?.(task.id);
  };

  const canCompleteTask = () => {
    return canUserChangeTaskStatus(task, currentUser);
  };

  // Calculate indentation based on depth
  const indentStyle = depth > 0 ? { marginLeft: `${depth * 1.5}rem` } : {};

  return (
    <div className={cn(!matchedByFilter && "opacity-50")} data-task-id={task.id}>
      <div
        className={cn(
          "group flex items-start gap-3 py-2.5 px-3 rounded-lg transition-colors cursor-pointer",
          isComment 
            ? "bg-muted/30 hover:bg-muted/50" 
            : "hover:bg-card/80",
          task.status === "done" && "opacity-60",
          depth > 0 && "border-l-2 border-muted ml-1.5 pl-4",
          isKeyboardFocused && "ring-2 ring-primary ring-offset-1 ring-offset-background bg-primary/5"
        )}
        style={indentStyle}
        onClick={handleSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSelect();
          }
        }}
        aria-label={`${isComment ? 'Comment' : 'Task'}: ${task.content.slice(0, 50)}`}
      >
        {/* Expand/Collapse Toggle - three states */}
        {hasChildren && !isComment ? (
          <button
            onClick={handleToggleExpand}
            className="flex-shrink-0 p-0.5 rounded hover:bg-muted mt-1"
            title={foldState === "matchingOnly" ? "Collapse" : foldState === "collapsed" ? (allVisibleDiffersFromMatching ? "Expand (all)" : "Expand (matching only)") : "Expand (matching only)"}
          >
            {foldState === "matchingOnly" ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : foldState === "collapsed" ? (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronsDown className="w-4 h-4 text-primary" />
            )}
          </button>
        ) : (
          <div className="w-5 flex-shrink-0" />
        )}

        {/* Status toggle for tasks - tri-state: todo -> in-progress -> done */}
        {!isComment && (
          <DropdownMenu
            open={statusMenuOpen}
            onOpenChange={(open) => {
              if (!open) {
                setStatusMenuOpen(false);
                allowStatusMenuOpenRef.current = false;
                return;
              }
              setStatusMenuOpen(allowStatusMenuOpenRef.current);
              allowStatusMenuOpenRef.current = false;
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canCompleteTask()) return;
                  const hasModifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
                  if (hasModifier && onStatusChange) {
                    allowStatusMenuOpenRef.current = true;
                    setStatusMenuOpen(true);
                    return;
                  }
                  setStatusMenuOpen(false);
                  onToggleComplete?.(task.id);
                }}
                onFocus={(e) => {
                  if (!onStatusChange || !canCompleteTask()) return;
                  if (
                    shouldAutoOpenStatusMenuOnFocus(
                      e.currentTarget,
                      statusTriggerPointerDownRef.current
                    )
                  ) {
                    allowStatusMenuOpenRef.current = true;
                    setStatusMenuOpen(true);
                  }
                  statusTriggerPointerDownRef.current = false;
                }}
                onPointerDown={() => {
                  statusTriggerPointerDownRef.current = true;
                  allowStatusMenuOpenRef.current = false;
                }}
                onBlur={() => {
                  statusTriggerPointerDownRef.current = false;
                  allowStatusMenuOpenRef.current = false;
                }}
                disabled={!canCompleteTask()}
                aria-label="Set status"
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
            </DropdownMenuTrigger>
            {onStatusChange && canCompleteTask() && (
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, "todo");
                  }}
                  className={cn((task.status || "todo") === "todo" && "bg-muted")}
                >
                  <Circle className="w-4 h-4 mr-2 text-muted-foreground" />
                  To Do
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, "in-progress");
                  }}
                  className={cn(task.status === "in-progress" && "bg-muted")}
                >
                  <CircleDot className="w-4 h-4 mr-2 text-amber-500" />
                  In Progress
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, "done");
                  }}
                  className={cn(task.status === "done" && "bg-muted")}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                  Done
                </DropdownMenuItem>
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        )}

        {/* Comment icon for comments */}
        {isComment && (
          <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
        )}

        {/* Avatar - only show for comments */}
        {isComment && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAuthorClick?.(authorPerson);
            }}
            className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label={`Filter and mention ${authorName}`}
            title={`Filter and mention ${authorName}`}
          >
            <UserAvatar
              id={task.author.id}
              displayName={authorName}
              avatarUrl={authorAvatar}
              className="w-6 h-6 flex-shrink-0"
              beamTestId={`task-item-beam-${task.id}`}
            />
          </button>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Meta info - author/time only for comments, counts only for tasks */}
          {(isComment || allTaskChildren.length > 0 || allCommentChildren.length > 0) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
              {isComment && (
                <>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAuthorClick?.(authorPerson);
                    }}
                    className="font-medium text-foreground/80 flex items-center gap-1 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 rounded"
                    aria-label={`Filter and mention ${authorName}`}
                    title={`Filter and mention ${authorName}`}
                  >
                    {authorName}
                    {authorNip05 && (
                      <span title={authorNip05}>
                        <BadgeCheck className="w-3 h-3 text-success" />
                      </span>
                    )}
                  </button>
                  <span>·</span>
                  <span>{timeAgo}</span>
                </>
              )}
              {!isComment && allTaskChildren.length > 0 && (
                <>
                  <span className="flex items-center gap-1">
                    <CheckSquare className="w-3 h-3" />
                    {allTaskChildren.filter(c => c.status === "done").length}/{allTaskChildren.length}
                  </span>
                </>
              )}
              {allCommentChildren.length > 0 && (
                <>
                  {!isComment && allTaskChildren.length > 0 && <span>·</span>}
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {allCommentChildren.length}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Task content */}
          <p className={cn(
            `text-sm leading-relaxed ${TASK_INTERACTION_STYLES.hoverText}`,
            task.status === "done" && "line-through text-muted-foreground"
          )}>
            {linkifyContent(task.content, onHashtagClick, {
              plainHashtags: task.status === "done",
            })}
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

          {/* Tags (with relay source when multiple relays active and item has tags) */}
          {task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {activeRelays.length > 1 && task.relays.length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                  {activeRelays.find(r => task.relays.includes(r.id))?.name || task.relays[0]}
                </span>
              )}
              {task.tags.map((tag) => (
                <button
                  key={tag}
                  data-onboarding="content-hashtag"
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

      {/* Children - three states: collapsed, matchingOnly, allVisible */}
      {hasChildren && foldState !== "collapsed" && (
        <div className="space-y-1">
          {(() => {
            // Determine which children to show based on fold state
            let commentsToShow: Task[];
            let tasksToShow: Task[];
            
            if (foldState === "allVisible") {
              // Show ALL children
              commentsToShow = allCommentChildren;
              tasksToShow = allTaskChildren;
            } else {
              // matchingOnly: show filtered if filters active, otherwise show non-done tasks
              if (hasActiveFilters) {
                commentsToShow = filteredCommentChildren;
                tasksToShow = filteredTaskChildren;
              } else {
                commentsToShow = defaultMatchingCommentChildren;
                tasksToShow = defaultMatchingTaskChildren;
              }
            }
            
            // Build context for sorting subtasks
            const childrenMap = buildChildrenMap(allTasks);
            const sortContext = { childrenMap, allTasks };
            
            // Sort subtasks using the same sorting logic as top-level tasks
            const sortedTasksToShow = sortTasks(tasksToShow, sortContext);
            
            return (
              <>
                {/* Comments first (maintain original order) */}
                {commentsToShow.map((child) => {
                  const childFilteredChildren = getFilteredChildrenFn ? getFilteredChildrenFn(child.id) : allTasks.filter(t => t.parentId === child.id);
                  // Determine if child matches based on fold state
                  const childMatched = foldState === "allVisible" 
                    ? (isDirectMatchFn ? isDirectMatchFn(child.id) : (hasActiveFilters ? true : child.status !== "done"))
                    : true;
                  return (
                    <TaskItem
                      key={child.id}
                      task={child}
                      filteredChildren={childFilteredChildren}
                      allTasks={allTasks}
                      currentUser={currentUser}
                      depth={depth + 1}
                      onSelect={onSelect}
                      onToggleComplete={onToggleComplete}
                      matchedByFilter={childMatched}
                      isDirectMatchFn={isDirectMatchFn}
                      getFilteredChildrenFn={getFilteredChildrenFn}
                      hasActiveFilters={hasActiveFilters}
                      parentFoldState={foldState}
                      activeRelays={activeRelays}
                      onHashtagClick={onHashtagClick}
                    />
                  );
                })}
                {/* Subtasks after - now sorted */}
                {sortedTasksToShow.map((child) => {
                  const childFilteredChildren = getFilteredChildrenFn ? getFilteredChildrenFn(child.id) : allTasks.filter(t => t.parentId === child.id);
                  // Determine if child matches based on fold state
                  const childMatched = foldState === "allVisible"
                    ? (isDirectMatchFn ? isDirectMatchFn(child.id) : (hasActiveFilters ? true : child.status !== "done"))
                    : true;
                  return (
                    <TaskItem
                      key={child.id}
                      task={child}
                      filteredChildren={childFilteredChildren}
                      allTasks={allTasks}
                      currentUser={currentUser}
                      depth={depth + 1}
                      onSelect={onSelect}
                      onToggleComplete={onToggleComplete}
                      matchedByFilter={childMatched}
                      isDirectMatchFn={isDirectMatchFn}
                      getFilteredChildrenFn={getFilteredChildrenFn}
                      hasActiveFilters={hasActiveFilters}
                      parentFoldState={foldState}
                      activeRelays={activeRelays}
                      onHashtagClick={onHashtagClick}
                    />
                  );
                })}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
