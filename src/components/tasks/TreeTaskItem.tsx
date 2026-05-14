import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronRight, ChevronDown, ChevronsDown, MessageSquare, CheckSquare, Calendar, Clock, BadgeCheck } from "lucide-react";
import { TaskStatusToggle } from "@/components/tasks/task-card/TaskStatusToggle";
import { cn } from "@/lib/utils";
import {
  Post,
  Relay,
  getTaskStatus,
  getTaskState,
  getTaskPrimaryDate,
  getTaskPriority,
  isCommentPost,
} from "@/types";
import { getRawEvent } from "@/stores/raw-events";
import type { Person } from "@/types/person";
import { formatDistanceToNow, format } from "date-fns";

import { TaskAssigneeAvatars } from "./TaskAssigneeAvatars";
import { useIsMobile } from "@/hooks/use-mobile";
import { linkifyContent } from "@/lib/linkify";
import { TaskTagChipInline, hasTaskMetadataChips } from "./TaskTagChipRow";
import { sortTasks, type SortContext, getDueDateColorClass } from "@/domain/content/task-sorting";

import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import { TASK_CHIP_STYLES, TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TaskDueDateEditorForm, TaskPrioritySelect } from "./TaskMetadataEditors";
import { getCommentCreatedTooltip } from "@/lib/task-timestamp-tooltip";
import { isTaskCompleted, isTaskTerminal } from "@/domain/content/task-state";
import { isRawNostrEventShortcutClick } from "@/lib/raw-nostr-shortcut";
import { hasTextSelection } from "@/lib/click-intent";
import { RawNostrEventDialog } from "@/components/tasks/RawNostrEventDialog";
import { getTaskTooltipPreview, shouldCollapseTaskContent } from "@/lib/task-content-preview";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useTaskAuthorProfiles } from "./task-author-profiles-context";

import { InteractivePersonAvatar } from "@/components/people/InteractivePersonAvatar";
import { InteractivePersonName } from "@/components/people/InteractivePersonName";
import {
  deriveTreeTaskItemChildren,
  getDefaultTreeTaskFoldState,
  getNextTreeTaskFoldState,
  type TreeTaskFoldState,
} from "./tree-task-item-helpers";

interface TreeTaskItemProps {
  task: Post;
  matchingChildren: Post[];
  childrenMap: Map<string | undefined, Post[]>;
  people?: Person[];
  currentUser?: Person;
  depth?: number;
  matchedByFilter?: boolean;
  isDirectMatchFn?: (taskId: string) => boolean;
  getMatchingChildrenFn: (parentId: string) => Post[];
  hasMatchingFilters?: boolean;
  parentFoldState?: TreeTaskFoldState; // Propagate parent's fold state for recursive expansion
  initialFoldState?: TreeTaskFoldState; // Override the default initial fold state (e.g. always collapsed)
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
  initialFoldState,
  activeRelays = [],
  isKeyboardFocused = false,
  compactView = false,
  isPendingPublishTask,
  isInteractionBlocked = false,
  sortContext,
}: TreeTaskItemProps) {
  const { t } = useTranslation("tasks");
  const isMobile = useIsMobile();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { people: contextPeople } = useFeedSurfaceState();
  const people = peopleProp ?? contextPeople;
  const authorProfiles = useTaskAuthorProfiles();
  const hasMatchingChildren = matchingChildren.length > 0;

  // Three-state fold: matchingOnly -> collapsed -> allVisible (skip allVisible if same as matching)
  const [localFoldState, setLocalFoldState] = useState<TreeTaskFoldState>(
    initialFoldState ?? getDefaultTreeTaskFoldState(depth, hasMatchingFilters, hasMatchingChildren)
  );
  const [hasLocalFoldOverride, setHasLocalFoldOverride] = useState(false);
  const foldState: TreeTaskFoldState =
    parentFoldState === "allVisible" && !hasLocalFoldOverride ? "allVisible" : localFoldState;
  const prevStatusTypeRef = useRef(getTaskStatus(getTaskState(task)));
  const cheerTimeoutRef = useRef<number | null>(null);
  const prevHasMatchingFiltersRef = useRef(hasMatchingFilters);
  const [isCheering, setIsCheering] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [isDueDatePopoverOpen, setIsDueDatePopoverOpen] = useState(false);
  const timeAgo = formatDistanceToNow(task.timestamp, { addSuffix: true });
  
  const isPubkey = task.author.pubkey.length === 64 && /^[a-f0-9]+$/.test(task.author.pubkey);
  const nostrProfile = isPubkey ? authorProfiles?.[task.author.pubkey] : undefined;
  
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
  const dispatchHashtagInclude = (tag: string) => {
    void dispatchFeedInteraction({ type: "filter.applyHashtagInclude", tag });
  };

  // Reset fold state when filters change
  useEffect(() => {
    if (prevHasMatchingFiltersRef.current !== hasMatchingFilters) {
      setLocalFoldState(getDefaultTreeTaskFoldState(depth, hasMatchingFilters, hasMatchingChildren));
      setHasLocalFoldOverride(false);
      prevHasMatchingFiltersRef.current = hasMatchingFilters;
    }
  }, [depth, hasMatchingChildren, hasMatchingFilters]);

  // Auto-expand when marked in-progress, auto-collapse when marked done.
  // The dep array also includes filter/match state, so we gate on a real
  // status TYPE transition — otherwise filter toggles would clobber the
  // user's fold state with the default for the new match context.
  useEffect(() => {
    const currentStatusType = getTaskStatus(getTaskState(task));
    if (prevStatusTypeRef.current === currentStatusType) return;

    if (currentStatusType === "active") {
      setLocalFoldState(getDefaultTreeTaskFoldState(depth, hasMatchingFilters, hasMatchingChildren));
      setHasLocalFoldOverride(false);
    } else if (isTaskTerminal(getTaskState(task))) {
      setLocalFoldState("collapsed");
      setHasLocalFoldOverride(false);
      if (isTaskCompleted(getTaskState(task))) {
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
    prevStatusTypeRef.current = currentStatusType;
  }, [depth, hasMatchingChildren, hasMatchingFilters, getTaskState(task)]);

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
        parentIsTerminal: isTaskTerminal(getTaskState(task)),
      }),
    [allChildren, currentTaskIsDirectMatch, hasMatchingFilters, matchingChildren, getTaskState(task)]
  );
  const isComment = isCommentPost(task);
  const isLockedUntilStart = isTaskLockedUntilStart(task);
  const dueDateColor = getDueDateColorClass(getTaskPrimaryDate(task)?.date, getTaskState(task));
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
  const rawEvent = getRawEvent(task.id);

  const handleTaskContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (rawEvent && isRawNostrEventShortcutClick(event)) {
      event.preventDefault();
      event.stopPropagation();
      setIsRawEventDialogOpen(true);
      return;
    }
    if (hasTextSelection()) return;
    handleSelect();
  };

  const canEditTaskMetadata = !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  const editableMetadata = !isComment && canEditTaskMetadata;
  // Priority editing is disabled for terminal-state tasks (done/closed) — render a non-interactive
  // chip rather than the full select control to avoid unnecessary overhead.
  const editablePriority = editableMetadata && !isTaskTerminal(getTaskState(task));
  const showCompactPriority = compactView && !isComment && typeof getTaskPriority(task) === "number";
  const showFullMetadataChips =
    !compactView &&
    (hasTaskMetadataChips(task, activeRelays.length) || (typeof getTaskPriority(task) === "number" && !isComment));
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
          isTaskTerminal(getTaskState(task)) && "opacity-60",
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
            className="flex-shrink-0 p-0.5 rounded hover:bg-muted touch-manipulation"
            title={foldToggleLabel}
            aria-label={foldToggleLabel}
          >
            {foldState === "matchingOnly" ? (
              <ChevronDown className="w-6 h-6 md:w-4 md:h-4 text-muted-foreground" />
            ) : foldState === "collapsed" ? (
              <ChevronRight className="w-6 h-6 md:w-4 md:h-4 text-muted-foreground" />
            ) : (
              <ChevronsDown className="w-6 h-6 md:w-4 md:h-4 text-primary" />
            )}
          </button>
        ) : (
          <div className="w-6 md:w-5 flex-shrink-0" />
        )}

        {/* Status toggle for tasks - quick cycle stays todo -> in-progress -> done */}
        {!isComment && (
          <TaskStatusToggle
            task={task}
            currentUser={currentUser}
            people={people}
            buttonClassName="flex-shrink-0 p-0.5"
            focusOnQuickToggle={hasChildren}
          />
        )}

        {/* Comment icon for comments */}
        {isComment && (
          <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Meta info - author/time only for comments, counts only for tasks */}
          {!compactView && (isComment || taskChildCount > 0 || commentChildCount > 0) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
              {isComment && (
                <>
                  <InteractivePersonName
                    person={authorPerson}
                  >
                    <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                      {authorName}
                      {authorNip05 && (
                        <span title={authorNip05}>
                          <BadgeCheck className="w-3 h-3 text-success" />
                        </span>
                      )}
                    </span>
                  </InteractivePersonName>
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
            isTaskTerminal(getTaskState(task)) && "line-through text-muted-foreground"
          )}>
            {linkifyContent(task.content, dispatchHashtagInclude, {
              plainHashtags: isTaskTerminal(getTaskState(task)),
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
          {(() => {
            const primaryDate = getTaskPrimaryDate(task);
            if (!primaryDate) return null;
            return (
              <Popover open={isDueDatePopoverOpen} onOpenChange={setIsDueDatePopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={!editableMetadata}
                    onClick={(event) => event.stopPropagation()}
                    title={`${getTaskDateTypeLabel(primaryDate.type)}: ${format(primaryDate.date, "MMM d, yyyy")}${primaryDate.time ? ` ${primaryDate.time}` : ""}`}
                    className={cn(
                      "mt-1 flex items-center gap-2 rounded px-1 py-0.5 text-xs transition-colors",
                      dueDateColor,
                      editableMetadata ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
                    )}
                  >
                    <Calendar className="w-3 h-3" />
                    <span className="uppercase tracking-wide">{getTaskDateTypeLabel(primaryDate.type)}</span>
                    <span>{format(primaryDate.date, "MMM d, yyyy")}</span>
                    {primaryDate.time && (
                      <>
                        <Clock className="w-3 h-3 ml-1" />
                        <span>{primaryDate.time}</span>
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
                      dueDate={primaryDate.date}
                      dueTime={primaryDate.time}
                      dateType={primaryDate.type}
                      idPrefix="task"
                      onClose={() => setIsDueDatePopoverOpen(false)}
                    />
                  </PopoverContent>
                )}
              </Popover>
            );
          })()}

          {showCompactPriority && (
            <div className={cn(getTaskPrimaryDate(task)?.date ? "mt-1.5" : "mt-1")}>
              <TaskPrioritySelect
                id={`task-priority-${task.id}`}
                taskId={editablePriority ? task.id : undefined}
                priority={getTaskPriority(task)}
                stopPropagation
                title={`Priority ${getTaskPriority(task)}`}
                className={cn(
                  TASK_CHIP_STYLES.priority,
                  "focus:outline-none",
                  editablePriority && "cursor-pointer hover:bg-warning/20",
                  !editablePriority && "cursor-not-allowed opacity-60"
                )}
              />
            </div>
          )}

          {showFullMetadataChips && (
            <div className={cn("flex flex-wrap gap-1", getTaskPrimaryDate(task)?.date ? "mt-1.5" : "mt-1.5")}>
              {typeof getTaskPriority(task) === "number" && !isComment && (
                <TaskPrioritySelect
                  id={`task-priority-${task.id}`}
                  taskId={editablePriority ? task.id : undefined}
                  priority={getTaskPriority(task)}
                  stopPropagation
                  title={`Priority ${getTaskPriority(task)}`}
                  className={cn(
                    TASK_CHIP_STYLES.priority,
                    "focus:outline-none",
                    editablePriority && "cursor-pointer hover:bg-warning/20",
                    !editablePriority && "cursor-not-allowed opacity-60"
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
        <div className="flex-shrink-0 self-end pb-0.5">
          <TaskAssigneeAvatars task={task} />
        </div>
      </div>
      {/* Children - three states: collapsed, matchingOnly, allVisible */}
      {hasChildren && foldState !== "collapsed" && (
        <div className="space-y-1">
          {(() => {
            // Determine which children to show based on fold state.
            // Note: in the matchingOnly view, done child tasks are already excluded by
            // deriveTreeTaskItemChildren unless this parent is itself terminal.
            let commentsToShow: Post[];
            let tasksToShow: Post[];

            if (foldState === "allVisible") {
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
                    ? (isDirectMatchFn ? isDirectMatchFn(child.id) : (hasMatchingFilters ? true : !isTaskTerminal(getTaskState(child))))
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
                    ? (isDirectMatchFn ? isDirectMatchFn(child.id) : (hasMatchingFilters ? true : !isTaskTerminal(getTaskState(child))))
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
        event={rawEvent || null}
      />
    </div>
  );
}
