import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronRight, ChevronDown, ChevronsDown, MessageSquare, CheckSquare, Calendar, Clock, BadgeCheck } from "lucide-react";
import { TaskStateIcon, TaskStateDefIcon } from "@/components/tasks/task-state-ui";
import { getTaskStateRegistry, resolveTaskStateFromStatus, toTaskStatusFromStateDefinition } from "@/domain/task-states/task-state-config";
import { cn } from "@/lib/utils";
import { Task, TaskStatusType, Relay, getTaskStatus, getTaskStatusType } from "@/types";
import type { Person } from "@/types/person";
import { formatDistanceToNow, format } from "date-fns";
import { UserAvatar } from "@/components/ui/user-avatar";
import { linkifyContent } from "@/lib/linkify";
import { TaskTagChipInline, hasTaskMetadataChips } from "./TaskTagChipRow";
import { sortTasks, type SortContext, getDueDateColorClass } from "@/domain/content/task-sorting";
import { shouldAutoOpenStatusMenuOnFocus } from "@/lib/status-menu-focus";
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/domain/content/task-permissions";
import { TASK_CHIP_STYLES, TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
import { useTranslation } from "react-i18next";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TaskDueDateEditorForm, TaskPrioritySelect } from "./TaskMetadataEditors";
import { getCommentCreatedTooltip } from "@/lib/task-timestamp-tooltip";
import { isTaskCompletedStatus, isTaskTerminalStatus } from "@/domain/content/task-status";
import { isRawNostrEventShortcutClick } from "@/lib/raw-nostr-shortcut";
import { hasTextSelection } from "@/lib/click-intent";
import { RawNostrEventDialog } from "@/components/tasks/RawNostrEventDialog";
import {
  handleTaskStatusToggleClick,
  shouldOpenStatusMenuForDirectSelection,
} from "@/lib/task-status-toggle";
import { getTaskTooltipPreview, shouldCollapseTaskContent } from "@/lib/task-content-preview";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useTaskAuthorProfiles } from "./task-author-profiles-context";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";
import { getPersonShortcutIntent, toPersonShortcutInteraction } from "@/components/people/person-shortcuts";
import {
  deriveTreeTaskItemChildren,
  getDefaultTreeTaskFoldState,
  getNextTreeTaskFoldState,
  type TreeTaskFoldState,
} from "./tree-task-item-helpers";

interface TreeTaskItemProps {
  task: Task;
  matchingChildren: Task[];
  childrenMap: Map<string | undefined, Task[]>;
  people?: Person[];
  currentUser?: Person;
  depth?: number;
  matchedByFilter?: boolean;
  isDirectMatchFn?: (taskId: string) => boolean;
  getMatchingChildrenFn: (parentId: string) => Task[];
  hasMatchingFilters?: boolean;
  parentFoldState?: TreeTaskFoldState; // Propagate parent's fold state for recursive expansion
  activeRelays?: Relay[]; // For showing relay source when multiple are active
  isKeyboardFocused?: boolean; // For keyboard navigation highlight
  compactView?: boolean;
  isPendingPublishTask?: (taskId: string) => boolean;
  isInteractionBlocked?: boolean;
  sortContext?: SortContext;
}

export function TreeTaskItem({
  task,
  matchingChildren,
  childrenMap,
  people: peopleProp,
  currentUser,
  depth = 0,
  matchedByFilter = true,
  isDirectMatchFn,
  getMatchingChildrenFn,
  hasMatchingFilters = false,
  parentFoldState,
  activeRelays = [],
  isKeyboardFocused = false,
  compactView = false,
  isPendingPublishTask,
  isInteractionBlocked = false,
  sortContext,
}: TreeTaskItemProps) {
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { people: contextPeople } = useFeedSurfaceState();
  const people = peopleProp ?? contextPeople;
  const authorProfiles = useTaskAuthorProfiles();
  const handleAuthorShortcut = (event: React.MouseEvent<HTMLElement>, person: Person) => {
    event.stopPropagation();
    const shortcutIntent = getPersonShortcutIntent(event);
    if (!shortcutIntent) return;
    event.preventDefault();
    void dispatchFeedInteraction(toPersonShortcutInteraction(person, shortcutIntent));
  };
  const getStatusToggleHint = (status?: Task["status"]): string => {
    const alternateKey = getAlternateModifierLabel();
    const statusType = getTaskStatusType(status);
    if (statusType === "active") return t("hints.statusToggle.active", { alternateKey });
    if (statusType === "done") return t("hints.statusToggle.done");
    if (statusType === "closed") return t("hints.statusToggle.closed");
    return t("hints.statusToggle.open", { alternateKey });
  };
  const hasMatchingChildren = matchingChildren.length > 0;

  // Three-state fold: matchingOnly -> collapsed -> allVisible (skip allVisible if same as matching)
  const [localFoldState, setLocalFoldState] = useState<TreeTaskFoldState>(
    getDefaultTreeTaskFoldState(depth, hasMatchingFilters, hasMatchingChildren)
  );
  const [hasLocalFoldOverride, setHasLocalFoldOverride] = useState(false);
  const foldState: TreeTaskFoldState =
    parentFoldState === "allVisible" && !hasLocalFoldOverride ? "allVisible" : localFoldState;
  const prevStatusRef = useRef(task.status);
  const cheerTimeoutRef = useRef<number | null>(null);
  const prevHasMatchingFiltersRef = useRef(hasMatchingFilters);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [isCheering, setIsCheering] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
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
  const dispatchHashtagExclusive = (tag: string) => {
    void dispatchFeedInteraction({ type: "filter.applyHashtagExclusive", tag });
  };

  // Reset fold state when filters change
  useEffect(() => {
    if (prevHasMatchingFiltersRef.current !== hasMatchingFilters) {
      setLocalFoldState(getDefaultTreeTaskFoldState(depth, hasMatchingFilters, hasMatchingChildren));
      setHasLocalFoldOverride(false);
      prevHasMatchingFiltersRef.current = hasMatchingFilters;
    }
  }, [depth, hasMatchingChildren, hasMatchingFilters]);

  // Auto-expand when marked in-progress, auto-collapse when marked done
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = task.status;
    
    if (prevStatus !== currentStatus) {
      if (getTaskStatusType(currentStatus) === "active") {
        setLocalFoldState(getDefaultTreeTaskFoldState(depth, hasMatchingFilters, hasMatchingChildren));
        setHasLocalFoldOverride(false);
      } else if (isTaskTerminalStatus(currentStatus)) {
        setLocalFoldState("collapsed");
        setHasLocalFoldOverride(false);
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
  }, [depth, hasMatchingChildren, hasMatchingFilters, task.status]);

  useEffect(() => {
    return () => {
      if (cheerTimeoutRef.current !== null) {
        window.clearTimeout(cheerTimeoutRef.current);
      }
    };
  }, []);

  const allChildren = useMemo(() => childrenMap.get(task.id) || [], [childrenMap, task.id]);
  const currentTaskIsDirectMatch = isDirectMatchFn ? isDirectMatchFn(task.id) : !hasMatchingFilters;

  const {
    allTaskChildren,
    allCommentChildren,
    matchingTaskChildren,
    matchingCommentChildren,
    taskChildCount,
    commentChildCount,
    completedTaskChildCount,
    hasChildren,
    allVisibleDiffersFromMatching,
  } = useMemo(
    () =>
      deriveTreeTaskItemChildren({
        allChildren,
        matchingChildren,
        hasMatchingFilters,
        currentTaskIsDirectMatch,
      }),
    [allChildren, currentTaskIsDirectMatch, hasMatchingFilters, matchingChildren]
  );
  const isComment = task.taskType === "comment";
  const isLockedUntilStart = isTaskLockedUntilStart(task);
  const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
  const isPendingPublish = Boolean(isPendingPublishTask?.(task.id));
  const hasCollapsibleContent = shouldCollapseTaskContent(task.content);

  // Cycle through fold states: matchingOnly -> collapsed -> allVisible (skip allVisible if same as matching)
  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHasLocalFoldOverride(true);
    setLocalFoldState(getNextTreeTaskFoldState(foldState, allVisibleDiffersFromMatching));
  };

  useEffect(() => {
    setIsContentExpanded(false);
  }, [task.id]);

  useEffect(() => {
    setHasLocalFoldOverride(false);
  }, [task.id]);

  const handleSelect = () => {
    void dispatchFeedInteraction({ type: "task.focus.change", taskId: task.id });
  };

  const [isRawEventDialogOpen, setIsRawEventDialogOpen] = useState(false);

  const handleTaskContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (task.rawNostrEvent && isRawNostrEventShortcutClick(event)) {
      event.preventDefault();
      event.stopPropagation();
      setIsRawEventDialogOpen(true);
      return;
    }
    if (hasTextSelection()) return;
    handleSelect();
  };

  const canCompleteTask = () => {
    return !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  };
  const editableMetadata = !isComment && canCompleteTask();
  const statusBlockedReason = getTaskStatusChangeBlockedReason(task, currentUser, isInteractionBlocked, people);
  const showCompactPriority = compactView && !isComment && typeof task.priority === "number";
  const showFullMetadataChips =
    !compactView &&
    (hasTaskMetadataChips(task, activeRelays.length) || (typeof task.priority === "number" && !isComment));
  const matchingChildrenLabel =
    hasMatchingFilters && !currentTaskIsDirectMatch
      ? t("tasks.actions.expandMatchingOnly")
      : t("tasks.actions.expandOpenSubtasks");
  const foldToggleLabel =
    foldState === "matchingOnly"
      ? t("tasks.actions.collapseSubtasks")
      : foldState === "collapsed"
        ? (allVisibleDiffersFromMatching ? t("tasks.actions.expandAllSubtasks") : matchingChildrenLabel)
        : matchingChildrenLabel;

  // Calculate indentation based on depth
  const indentStyle = depth > 0 ? { marginLeft: `${depth * 1.5}rem` } : {};

  return (
    <div className={cn(isCheering && "motion-completion-cheer")} data-task-id={task.id}>
      <div
        className={cn(
          `group flex items-start gap-3 py-2.5 px-3 rounded-lg transition-colors cursor-pointer ${TASK_INTERACTION_STYLES.cardSurface}`,
          !matchedByFilter && "opacity-50",
          isComment 
            ? "bg-muted/30"
            : "",
          isTaskTerminalStatus(task.status) && "opacity-60",
          isLockedUntilStart && "opacity-50 grayscale",
          depth > 0 && "border-l-2 border-muted ml-1.5 pl-4",
          isKeyboardFocused && "ring-2 ring-primary ring-offset-1 ring-offset-background bg-primary/5"
        )}
        style={indentStyle}
        onClick={handleTaskContainerClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSelect();
          }
        }}
        aria-label={(() => {
          const typeLabel = isComment ? t("tasks.comment").toLowerCase() : t("tasks.task").toLowerCase();
          const preview = getTaskTooltipPreview(task.content);
          return preview
            ? t("tasks.focusTaskWithPreview", { type: typeLabel, preview })
            : t("tasks.focusTaskAria", { type: typeLabel, title: "" });
        })()}
        title={(() => {
          const typeLabel = isComment ? t("tasks.comment").toLowerCase() : t("tasks.task").toLowerCase();
          const preview = getTaskTooltipPreview(task.content);
          return preview
            ? t("tasks.focusTaskWithPreview", { type: typeLabel, preview })
            : t("tasks.focusTaskTitle", { type: typeLabel });
        })()}
      >
        {/* Expand/Collapse Toggle - three states */}
        {hasChildren && !isComment ? (
          <button
            type="button"
            onClick={handleToggleExpand}
            data-testid={`tree-fold-toggle-${task.id}`}
            data-fold-state={foldState}
            className="flex-shrink-0 p-0.5 rounded hover:bg-muted mt-1"
            title={foldToggleLabel}
            aria-label={foldToggleLabel}
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
                      hasStatusChangeHandler: canCompleteTask(),
                      isMenuOpen: statusMenuOpen,
                      openMenu: () => setStatusMenuOpen(true),
                      closeMenu: () => setStatusMenuOpen(false),
                      allowMenuOpen: () => {
                        allowStatusMenuOpenRef.current = true;
                    },
                      clearMenuOpenIntent: () => {
                        allowStatusMenuOpenRef.current = false;
                      },
                      toggleStatus: () => {
                        void dispatchFeedInteraction({ type: "task.toggleComplete", taskId: task.id });
                      },
                      focusTask: () => void dispatchFeedInteraction({ type: "task.focus.change", taskId: task.id }),
                      focusOnQuickToggle: hasChildren,
                    });
                  }}
                onFocus={(e) => {
                  if (!canCompleteTask()) return;
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
                      hasStatusChangeHandler: canCompleteTask(),
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
                <TaskStateIcon
                  status={getTaskStatus(task)}
                />
              </button>
            </DropdownMenuTrigger>
            {canCompleteTask() && (
              <DropdownMenuContent align="start">
                {getTaskStateRegistry().map((state) => (
                  <DropdownMenuItem
                    key={state.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void dispatchFeedInteraction({
                        type: "task.changeStatus",
                        taskId: task.id,
                        status: toTaskStatusFromStateDefinition(state),
                      });
                    }}
                    className={cn(resolveTaskStateFromStatus(task.status).id === state.id && "bg-muted")}
                  >
                    <TaskStateDefIcon state={state} className="mr-2" />
                    {state.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        )}

        {/* Comment icon for comments */}
        {isComment && (
          <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
        )}

        {/* Avatar - only show for comments */}
        {isComment && !compactView && (
          <PersonHoverCard person={authorPerson}>
            <button
              type="button"
              className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label={t("people.actions.openMenu", { name: authorName })}
              onClick={(event) => handleAuthorShortcut(event, authorPerson)}
            >
              <UserAvatar
                id={task.author.id}
                displayName={authorName}
                avatarUrl={authorAvatar}
                className="w-6 h-6 flex-shrink-0"
                beamTestId={`task-item-beam-${task.id}`}
              />
            </button>
          </PersonHoverCard>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Meta info - author/time only for comments, counts only for tasks */}
          {!compactView && (isComment || taskChildCount > 0 || commentChildCount > 0) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
              {isComment && (
                <>
                  <PersonHoverCard person={authorPerson}>
                    <button
                      type="button"
                      className="font-medium text-foreground/80 flex items-center gap-1 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 rounded"
                      aria-label={t("people.actions.openMenu", { name: authorName })}
                      onClick={(event) => handleAuthorShortcut(event, authorPerson)}
                    >
                      {authorName}
                      {authorNip05 && (
                        <span title={authorNip05}>
                          <BadgeCheck className="w-3 h-3 text-success" />
                        </span>
                      )}
                    </button>
                  </PersonHoverCard>
                  <span>·</span>
                  <span title={getCommentCreatedTooltip(task.timestamp)}>{timeAgo}</span>
                </>
              )}
              {!isComment && taskChildCount > 0 && (
                <>
                  <span className="flex items-center gap-1">
                    <CheckSquare className="w-3 h-3" />
                    {completedTaskChildCount}/{taskChildCount}
                  </span>
                </>
              )}
              {commentChildCount > 0 && (
                <>
                  {!isComment && taskChildCount > 0 && <span>·</span>}
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {commentChildCount}
                  </span>
                </>
              )}
              {isPendingPublish && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void dispatchFeedInteraction({ type: "task.undoPendingPublish", taskId: task.id });
                  }}
                  className="ml-auto shrink-0 font-medium text-warning hover:text-warning/80"
                  title={t("composer:toasts.actions.undo")}
                >
                  {t("composer:toasts.actions.undo")}
                </button>
              )}
            </div>
          )}

          {/* Task content */}
          <div className={cn(
            `text-sm leading-relaxed ${TASK_INTERACTION_STYLES.hoverText}`,
            compactView
              ? "whitespace-pre-line line-clamp-2 overflow-hidden"
              : hasCollapsibleContent && !isContentExpanded
                ? "whitespace-pre-line line-clamp-3 overflow-hidden"
                : "whitespace-pre-wrap",
            isTaskTerminalStatus(task.status) && "line-through text-muted-foreground"
          )}>
            {linkifyContent(task.content, dispatchHashtagExclusive, {
              plainHashtags: isTaskTerminalStatus(task.status),
              people,
              disableStandaloneEmbeds: true,
            })}
          </div>
          {!compactView && hasCollapsibleContent && (
            <button
              type="button"
              className="mt-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                setIsContentExpanded((prev) => !prev);
              }}
            >
              {isContentExpanded ? t("tasks.actions.showLess") : t("tasks.actions.showMore")}
            </button>
          )}

          {/* Due date */}
          {task.dueDate && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={!editableMetadata}
                  onClick={(event) => event.stopPropagation()}
                  className={cn(
                    "mt-1 flex items-center gap-2 rounded px-1 py-0.5 text-xs transition-colors",
                    dueDateColor,
                    editableMetadata ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
                  )}
                >
                  <Calendar className="w-3 h-3" />
                  <span className="uppercase tracking-wide">{getTaskDateTypeLabel(task.dateType)}</span>
                  <span>{format(task.dueDate, "MMM d, yyyy")}</span>
                  {task.dueTime && (
                    <>
                      <Clock className="w-3 h-3 ml-1" />
                      <span>{task.dueTime}</span>
                    </>
                  )}
                </button>
              </PopoverTrigger>
              {editableMetadata && (
                <PopoverContent
                  className="w-auto p-0"
                  align="start"
                  onClick={(event) => event.stopPropagation()}
                >
                  <TaskDueDateEditorForm
                    taskId={task.id}
                    dueDate={task.dueDate}
                    dueTime={task.dueTime}
                    dateType={task.dateType}
                    idPrefix="task"
                  />
                </PopoverContent>
              )}
            </Popover>
          )}

          {showCompactPriority && (
            <div className={cn(task.dueDate ? "mt-1.5" : "mt-1")}>
              <TaskPrioritySelect
                id={`task-priority-${task.id}`}
                taskId={editableMetadata ? task.id : undefined}
                priority={task.priority}
                stopPropagation
                className={cn(
                  TASK_CHIP_STYLES.priority,
                  "focus:outline-none",
                  editableMetadata && "cursor-pointer hover:bg-warning/20",
                  !editableMetadata && "cursor-not-allowed opacity-60"
                )}
              />
            </div>
          )}

          {showFullMetadataChips && (
            <div className={cn("flex flex-wrap gap-1", task.dueDate ? "mt-1.5" : "mt-1.5")}>
              {typeof task.priority === "number" && !isComment && (
                <TaskPrioritySelect
                  id={`task-priority-${task.id}`}
                  taskId={editableMetadata ? task.id : undefined}
                  priority={task.priority}
                  stopPropagation
                  className={cn(
                    TASK_CHIP_STYLES.priority,
                    "focus:outline-none",
                    editableMetadata && "cursor-pointer hover:bg-warning/20",
                    !editableMetadata && "cursor-not-allowed opacity-60"
                  )}
                />
              )}
              <TaskTagChipInline
                task={task}
                people={people}
                stopPropagation
                showEmptyPlaceholder={false}
              />
            </div>
          )}

          {compactView && isPendingPublish && (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void dispatchFeedInteraction({ type: "task.undoPendingPublish", taskId: task.id });
                }}
                className="text-xs font-medium text-warning hover:text-warning/80"
                title={t("composer:toasts.actions.undo")}
              >
                {t("composer:toasts.actions.undo")}
              </button>
            </div>
          )}
        </div>
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
              commentsToShow = matchingCommentChildren;
              tasksToShow = matchingTaskChildren;
            }
            
            const sortedTasksToShow =
              foldState === "allVisible" && sortContext
                ? sortTasks(tasksToShow, sortContext)
                : tasksToShow;
            
            return (
              <>
                {/* Comments first (maintain original order) */}
                {commentsToShow.map((child) => {
                  const childMatchingChildren = getMatchingChildrenFn(child.id);
                  // Determine if child matches based on fold state
                  const childMatched = foldState === "allVisible" 
                    ? (isDirectMatchFn ? isDirectMatchFn(child.id) : (hasMatchingFilters ? true : !isTaskTerminalStatus(child.status)))
                    : true;
                  return (
                    <TreeTaskItem
                      key={child.id}
                      task={child}
                      matchingChildren={childMatchingChildren}
                      childrenMap={childrenMap}
                      currentUser={currentUser}
                      depth={depth + 1}

                      matchedByFilter={childMatched}
                      isDirectMatchFn={isDirectMatchFn}
                      getMatchingChildrenFn={getMatchingChildrenFn}
                      hasMatchingFilters={hasMatchingFilters}
                      parentFoldState={foldState}
                      activeRelays={activeRelays}
                      compactView={compactView}
                      isPendingPublishTask={isPendingPublishTask}
                      sortContext={sortContext}
                    />
                  );
                })}
                {/* Subtasks after - now sorted */}
                {sortedTasksToShow.map((child) => {
                  const childMatchingChildren = getMatchingChildrenFn(child.id);
                  // Determine if child matches based on fold state
                  const childMatched = foldState === "allVisible"
                    ? (isDirectMatchFn ? isDirectMatchFn(child.id) : (hasMatchingFilters ? true : !isTaskTerminalStatus(child.status)))
                    : true;
                  return (
                    <TreeTaskItem
                      key={child.id}
                      task={child}
                      matchingChildren={childMatchingChildren}
                      childrenMap={childrenMap}
                      currentUser={currentUser}
                      depth={depth + 1}

                      matchedByFilter={childMatched}
                      isDirectMatchFn={isDirectMatchFn}
                      getMatchingChildrenFn={getMatchingChildrenFn}
                      hasMatchingFilters={hasMatchingFilters}
                      parentFoldState={foldState}
                      activeRelays={activeRelays}
                      compactView={compactView}
                      isPendingPublishTask={isPendingPublishTask}
                      sortContext={sortContext}
                    />
                  );
                })}
              </>
            );
          })()}
        </div>
      )}
      <RawNostrEventDialog
        open={isRawEventDialogOpen}
        onOpenChange={setIsRawEventDialogOpen}
        event={task.rawNostrEvent || null}
      />
    </div>
  );
}
