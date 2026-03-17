import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronRight, ChevronDown, ChevronsDown, MessageSquare, CheckSquare, MoreHorizontal, Calendar, Clock, Circle, CircleDot, CheckCircle2, BadgeCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Task, Person, TaskStatus, Relay } from "@/types";
import { formatDistanceToNow, format } from "date-fns";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getStandaloneEmbeddableUrls, linkifyContent } from "@/lib/linkify";
import { TaskMentionChips, hasTaskMentionChips } from "./TaskMentionChips";
import { sortTasks, type SortContext, getDueDateColorClass } from "@/lib/task-sorting";
import type { NostrProfile } from "@/hooks/use-nostr-profiles";
import { shouldAutoOpenStatusMenuOnFocus } from "@/lib/status-menu-focus";
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/domain/content/task-permissions";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
import { useTranslation } from "react-i18next";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";
import { TaskAttachmentList } from "@/components/tasks/TaskAttachmentList";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskLocationChip } from "@/components/tasks/TaskLocationChip";
import { getCommentCreatedTooltip } from "@/lib/task-timestamp-tooltip";
import { isTaskCompletedStatus, isTaskTerminalStatus } from "@/domain/content/task-status";
import {
  handleTaskStatusToggleClick,
  shouldOpenStatusMenuForDirectSelection,
} from "@/lib/task-status-toggle";

// Fold states: collapsed -> matchingOnly -> allVisible
type FoldState = "collapsed" | "matchingOnly" | "allVisible";

interface TaskItemProps {
  task: Task;
  filteredChildren: Task[];
  allTasks: Task[];
  people?: Person[];
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
  onUndoPendingPublish?: (taskId: string) => void;
  isPendingPublishTask?: (taskId: string) => boolean;
  isInteractionBlocked?: boolean;
  onMediaClick?: (taskId: string, url: string) => void;
  sortContext?: SortContext;
  authorProfiles?: Record<string, NostrProfile>;
}

export function TaskItem({
  task,
  filteredChildren,
  allTasks,
  people = [],
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
  onUndoPendingPublish,
  isPendingPublishTask,
  isInteractionBlocked = false,
  onMediaClick,
  sortContext,
  authorProfiles,
}: TaskItemProps) {
  const { t } = useTranslation();
  const getStatusToggleHint = (status?: TaskStatus): string => {
    const alternateKey = getAlternateModifierLabel();
    if (status === "in-progress") return t("hints.statusToggle.inProgress", { alternateKey });
    if (status === "done") return t("hints.statusToggle.done");
    if (status === "closed") return t("hints.statusToggle.closed");
    return t("hints.statusToggle.todo", { alternateKey });
  };

  // Three-state fold: matchingOnly -> collapsed -> allVisible (skip allVisible if same as matching)
  const [localFoldState, setLocalFoldState] = useState<FoldState>("matchingOnly");
  
  // If parent is in allVisible state, this child should also be allVisible
  const foldState: FoldState = parentFoldState === "allVisible" ? "allVisible" : localFoldState;
  const prevStatusRef = useRef(task.status);
  const cheerTimeoutRef = useRef<number | null>(null);
  const prevHasActiveFiltersRef = useRef(hasActiveFilters);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [isCheering, setIsCheering] = useState(false);
  const statusTriggerPointerDownRef = useRef(false);
  const allowStatusMenuOpenRef = useRef(false);
  const statusMenuOpenedOnPointerDownRef = useRef(false);
  const timeAgo = formatDistanceToNow(task.timestamp, { addSuffix: true });
  
  const isPubkey = task.author.id.length === 64 && /^[a-f0-9]+$/.test(task.author.id);
  const nostrProfile = isPubkey ? authorProfiles?.[task.author.id] : undefined;
  
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
      } else if (isTaskTerminalStatus(currentStatus)) {
        setLocalFoldState("collapsed");
        if (isTaskCompletedStatus(currentStatus)) {
          setIsCheering(true);
          if (cheerTimeoutRef.current !== null) {
            window.clearTimeout(cheerTimeoutRef.current);
          }
          cheerTimeoutRef.current = window.setTimeout(() => {
            setIsCheering(false);
          }, 700);
        } else {
          setIsCheering(false);
        }
      }
      prevStatusRef.current = currentStatus;
    }
  }, [task.status]);

  useEffect(() => {
    return () => {
      if (cheerTimeoutRef.current !== null) {
        window.clearTimeout(cheerTimeoutRef.current);
      }
    };
  }, []);

  // Get ALL children from allTasks for total counts
  const allChildren = allTasks.filter(t => t.parentId === task.id);
  const allTaskChildren = allChildren.filter(c => c.taskType === "task");
  const allCommentChildren = allChildren.filter(c => c.taskType === "comment");
  
  // Get filtered children for display (matching filter OR not done when no filters)
  const filteredTaskChildren = filteredChildren.filter(c => c.taskType === "task");
  const filteredCommentChildren = filteredChildren.filter(c => c.taskType === "comment");
  
  // When no active filters, "matching" means not done
  const defaultMatchingTaskChildren = allTaskChildren.filter(
    (child) => !isTaskTerminalStatus(child.status)
  );
  const defaultMatchingCommentChildren = allCommentChildren;
  
  // Determine if "expand all" would differ from "expand matching"
  const matchingTaskCount = hasActiveFilters ? filteredTaskChildren.length : defaultMatchingTaskChildren.length;
  const matchingCommentCount = hasActiveFilters ? filteredCommentChildren.length : defaultMatchingCommentChildren.length;
  const allVisibleDiffersFromMatching = 
    allTaskChildren.length !== matchingTaskCount || 
    allCommentChildren.length !== matchingCommentCount;
  
  const hasChildren = allChildren.length > 0;
  const isComment = task.taskType === "comment";
  const isLockedUntilStart = isTaskLockedUntilStart(task);
  const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
  const isPendingPublish = Boolean(isPendingPublishTask?.(task.id));
  const standaloneEmbedUrls = new Set(
    getStandaloneEmbeddableUrls(task.content).map((url) => url.trim().toLowerCase())
  );
  const mediaCaptionByUrl = useMemo(() => {
    const map = new Map<string, string>();
    for (const attachment of task.attachments || []) {
      const normalizedUrl = attachment.url?.trim().toLowerCase();
      if (!normalizedUrl) continue;
      const caption = attachment.alt?.trim() || attachment.name?.trim();
      if (caption) {
        map.set(normalizedUrl, caption);
      }
    }
    return map;
  }, [task.attachments]);
  const attachmentsWithoutInlineEmbeds = (task.attachments || []).filter((attachment) => {
    const normalizedUrl = attachment.url?.trim().toLowerCase();
    return !normalizedUrl || !standaloneEmbedUrls.has(normalizedUrl);
  });

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
    return !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  };
  const statusBlockedReason = getTaskStatusChangeBlockedReason(task, currentUser, isInteractionBlocked, people);

  // Calculate indentation based on depth
  const indentStyle = depth > 0 ? { marginLeft: `${depth * 1.5}rem` } : {};

  return (
    <div className={cn(!matchedByFilter && "opacity-50", isCheering && "motion-completion-cheer")} data-task-id={task.id}>
      <div
        className={cn(
          "group flex items-start gap-3 py-2.5 px-3 rounded-lg transition-colors cursor-pointer",
          isComment 
            ? "bg-muted/30 hover:bg-muted/50" 
            : "hover:bg-card/80",
          isTaskTerminalStatus(task.status) && "opacity-60",
          isLockedUntilStart && "opacity-50 grayscale",
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
        aria-label={t("tasks.focusTaskAria", {
          type: isComment ? t("tasks.comment").toLowerCase() : t("tasks.task").toLowerCase(),
          title: task.content.slice(0, 50),
        })}
        title={t("tasks.focusTaskTitle", { type: isComment ? t("tasks.comment").toLowerCase() : t("tasks.task").toLowerCase() })}
      >
        {/* Expand/Collapse Toggle - three states */}
        {hasChildren && !isComment ? (
          <button
            onClick={handleToggleExpand}
            className="flex-shrink-0 p-0.5 rounded hover:bg-muted mt-1"
            title={foldState === "matchingOnly" ? t("tasks.actions.collapse") : foldState === "collapsed" ? (allVisibleDiffersFromMatching ? t("tasks.actions.expandAll") : t("tasks.actions.expandMatchingOnly")) : t("tasks.actions.expandMatchingOnly")}
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

        {/* Status toggle for tasks - quick cycle stays todo -> in-progress -> done */}
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
                  if (!canCompleteTask()) return;
                  if (statusMenuOpenedOnPointerDownRef.current) {
                    statusMenuOpenedOnPointerDownRef.current = false;
                    e.stopPropagation();
                    return;
                  }
                  handleTaskStatusToggleClick(e, {
                    status: task.status,
                    hasStatusChangeHandler: Boolean(onStatusChange),
                    isMenuOpen: statusMenuOpen,
                    openMenu: () => setStatusMenuOpen(true),
                    closeMenu: () => setStatusMenuOpen(false),
                    allowMenuOpen: () => {
                      allowStatusMenuOpenRef.current = true;
                    },
                    clearMenuOpenIntent: () => {
                      allowStatusMenuOpenRef.current = false;
                    },
                    toggleStatus: () => onToggleComplete?.(task.id),
                    focusTask: () => onSelect?.(task.id),
                  });
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
                  statusMenuOpenedOnPointerDownRef.current = false;
                }}
                onPointerDownCapture={(e) => {
                  if (!canCompleteTask()) return;
                  if (
                    shouldOpenStatusMenuForDirectSelection({
                      status: task.status,
                      altKey: e.altKey,
                      hasStatusChangeHandler: Boolean(onStatusChange),
                    })
                  ) {
                    e.preventDefault();
                    allowStatusMenuOpenRef.current = true;
                    statusMenuOpenedOnPointerDownRef.current = true;
                    setStatusMenuOpen(true);
                  }
                }}
                onBlur={() => {
                  statusTriggerPointerDownRef.current = false;
                  allowStatusMenuOpenRef.current = false;
                  statusMenuOpenedOnPointerDownRef.current = false;
                }}
                disabled={!canCompleteTask()}
                aria-label={t("tasks.actions.setStatus")}
                title={canCompleteTask() ? getStatusToggleHint(task.status) : (statusBlockedReason || getStatusToggleHint(task.status))}
                className={cn(
                  "flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors",
                  canCompleteTask() ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                )}
              >
                {task.status === "done" ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : task.status === "closed" ? (
                  <X className="w-5 h-5 text-muted-foreground" />
                ) : task.status === "in-progress" ? (
                  <CircleDot className="w-5 h-5 text-warning" />
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
                  {t("listView.status.todo")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, "in-progress");
                  }}
                  className={cn(task.status === "in-progress" && "bg-muted")}
                >
                  <CircleDot className="w-4 h-4 mr-2 text-warning" />
                  {t("listView.status.inProgress")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, "done");
                  }}
                  className={cn(task.status === "done" && "bg-muted")}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                  {t("listView.status.done")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, "closed");
                  }}
                  className={cn(task.status === "closed" && "bg-muted")}
                >
                  <X className="w-4 h-4 mr-2 text-muted-foreground" />
                  {t("listView.status.closed")}
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
            aria-label={t("tasks.actions.filterAndMention", { authorName })}
            title={t("tasks.actions.filterAndMention", { authorName })}
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
                    aria-label={t("tasks.actions.filterAndMention", { authorName })}
                    title={t("tasks.actions.filterAndMention", { authorName })}
                  >
                    {authorName}
                    {authorNip05 && (
                      <span title={authorNip05}>
                        <BadgeCheck className="w-3 h-3 text-success" />
                      </span>
                    )}
                  </button>
                  <span>·</span>
                  <span title={getCommentCreatedTooltip(task.timestamp)}>{timeAgo}</span>
                </>
              )}
              {!isComment && allTaskChildren.length > 0 && (
                <>
                  <span className="flex items-center gap-1">
                    <CheckSquare className="w-3 h-3" />
                    {allTaskChildren.filter((child) => isTaskCompletedStatus(child.status)).length}/{allTaskChildren.length}
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
              {isPendingPublish && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onUndoPendingPublish?.(task.id);
                  }}
                  className="ml-auto shrink-0 font-medium text-warning hover:text-warning/80"
                  title={t("toasts.actions.undo")}
                >
                  {t("toasts.actions.undo")}
                </button>
              )}
            </div>
          )}

          {/* Task content */}
          <div className={cn(
            `text-sm leading-relaxed whitespace-pre-wrap ${TASK_INTERACTION_STYLES.hoverText}`,
            isTaskTerminalStatus(task.status) && "line-through text-muted-foreground"
          )}>
            {linkifyContent(task.content, onHashtagClick, {
              plainHashtags: isTaskTerminalStatus(task.status),
              people,
              onMentionClick: onAuthorClick,
              onStandaloneMediaClick: (url) => onMediaClick?.(task.id, url),
              getStandaloneMediaCaption: (url) => mediaCaptionByUrl.get(url.trim().toLowerCase()),
            })}
          </div>
          <TaskAttachmentList
            attachments={attachmentsWithoutInlineEmbeds}
            onMediaClick={(url) => onMediaClick?.(task.id, url)}
          />

          {/* Due date */}
          {task.dueDate && (
            <div className={cn("flex items-center gap-2 text-xs mt-1", dueDateColor)}>
              <Calendar className="w-3 h-3" />
              <span className="uppercase tracking-wide">{getTaskDateTypeLabel(task.dateType)}</span>
              <span>{format(task.dueDate, "MMM d, yyyy")}</span>
              {task.dueTime && (
                <>
                  <Clock className="w-3 h-3 ml-1" />
                  <span>{task.dueTime}</span>
                </>
              )}
            </div>
          )}

          {(hasTaskMentionChips(task) || task.tags.length > 0 || task.locationGeohash || (typeof task.priority === "number" && !isComment)) && (
            <div className={cn("flex flex-wrap gap-1", task.dueDate ? "mt-1.5" : "mt-1.5")}>
              {typeof task.priority === "number" && !isComment && (
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-warning/15 text-warning">
                  P{task.priority}
                </span>
              )}
              <TaskMentionChips
                task={task}
                people={people}
                onPersonClick={onAuthorClick}
                inline
              />
              {activeRelays.length > 1 && task.relays.length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                  {activeRelays.find(r => task.relays.includes(r.id))?.name || task.relays[0]}
                </span>
              )}
              {task.locationGeohash && (
                <TaskLocationChip
                  geohash={task.locationGeohash}
                  className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground"
                />
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
                  aria-label={t("tasks.actions.filterTag", { tag })}
                  title={t("tasks.actions.filterTag", { tag })}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* Completed indicator */}
          {isTaskCompletedStatus(task.status) && task.completedBy && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <CheckSquare className="w-3 h-3" />
              <span>{t("tasks.completedBy", { user: task.completedBy })}</span>
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
            
            const sortedTasksToShow =
              foldState === "allVisible" && sortContext
                ? sortTasks(tasksToShow, sortContext)
                : tasksToShow;
            
            return (
              <>
                {/* Comments first (maintain original order) */}
                {commentsToShow.map((child) => {
                  const childFilteredChildren = getFilteredChildrenFn ? getFilteredChildrenFn(child.id) : allTasks.filter(t => t.parentId === child.id);
                  // Determine if child matches based on fold state
                  const childMatched = foldState === "allVisible" 
                    ? (isDirectMatchFn ? isDirectMatchFn(child.id) : (hasActiveFilters ? true : !isTaskTerminalStatus(child.status)))
                    : true;
                  return (
                    <TaskItem
                      key={child.id}
                      task={child}
                      filteredChildren={childFilteredChildren}
                      allTasks={allTasks}
                      people={people}
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
                      onAuthorClick={onAuthorClick}
                      onUndoPendingPublish={onUndoPendingPublish}
                      isPendingPublishTask={isPendingPublishTask}
                      onMediaClick={onMediaClick}
                      sortContext={sortContext}
                      authorProfiles={authorProfiles}
                    />
                  );
                })}
                {/* Subtasks after - now sorted */}
                {sortedTasksToShow.map((child) => {
                  const childFilteredChildren = getFilteredChildrenFn ? getFilteredChildrenFn(child.id) : allTasks.filter(t => t.parentId === child.id);
                  // Determine if child matches based on fold state
                  const childMatched = foldState === "allVisible"
                    ? (isDirectMatchFn ? isDirectMatchFn(child.id) : (hasActiveFilters ? true : !isTaskTerminalStatus(child.status)))
                    : true;
                  return (
                    <TaskItem
                      key={child.id}
                      task={child}
                      filteredChildren={childFilteredChildren}
                      allTasks={allTasks}
                      people={people}
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
                      onAuthorClick={onAuthorClick}
                      onUndoPendingPublish={onUndoPendingPublish}
                      isPendingPublishTask={isPendingPublishTask}
                      onMediaClick={onMediaClick}
                      sortContext={sortContext}
                      authorProfiles={authorProfiles}
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
