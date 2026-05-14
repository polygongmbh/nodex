import { useState, useMemo, useCallback, useRef, type KeyboardEvent } from "react";
import { Clock } from "lucide-react";
import { format, startOfDay, isPast, isToday, isTomorrow } from "date-fns";
import { useTranslation } from "react-i18next";

import { hasTextSelection } from "@/lib/click-intent";
import { cn } from "@/lib/utils";
import { renderTaskContentWithProjectHeading } from "@/lib/linkify";
import { getAuthorColor } from "@/lib/author-color";
import { TASK_INTERACTION_STYLES, TASK_CHIP_STYLES } from "@/lib/task-interaction-styles";
import { getTaskDateTypeLabel } from "@/lib/task-dates";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";
import {
  handleTaskStatusToggleClick,
  shouldOpenStatusMenuForDirectSelection,
} from "@/lib/task-status-toggle";
import { getTaskTooltipPreview } from "@/lib/task-content-preview";

import {
  getTaskState,
  getTaskStatus,
  getTaskPrimaryDate,
  isTaskPost,
  type Post,
  type TaskPost,
  type TaskState,
  type ComposeRestoreRequest,
} from "@/types";
import type { Person } from "@/types/person";
import {
  getTaskStateRegistry,
  resolveTaskStateFromStatus,
  toTaskStateFromDefinition,
} from "@/domain/task-states/task-state-config";
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/domain/content/task-permissions";
import { makeIsProject } from "@/domain/content/task-projects";
import { isTaskTerminal } from "@/domain/content/task-state";

import { TaskStateIcon, TaskStateDefIcon } from "@/components/tasks/task-state-ui";
import { TaskPrioritySelect } from "./TaskMetadataEditors";
import { TaskAssigneeAvatars } from "./TaskAssigneeAvatars";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  createCalendarSelectors,
  useTaskViewSource,
} from "@/features/feed-page/controllers/use-task-view-states";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useTaskViewServices } from "./use-task-view-services";

interface UpcomingViewProps {
  tasks: Post[];
  allTasks: Post[];
  currentUser?: Person;
  focusedTaskId: string | null;
  searchQueryOverride?: string;
  composeRestoreRequest?: ComposeRestoreRequest | null;
  isHydrating?: boolean;
}

export function UpcomingView({
  tasks,
  allTasks,
  currentUser,
  focusedTaskId,
  searchQueryOverride,
}: UpcomingViewProps) {
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { focusTask } = useTaskViewServices();
  const { people } = useFeedSurfaceState();

  const taskSource = useTaskViewSource({
    tasks,
    allTasks,
    focusedTaskId,
    searchQueryOverride,
  });
  const calendarSelectors = useMemo(() => createCalendarSelectors(taskSource), [taskSource]);
  const upcomingTasks = calendarSelectors.getUpcomingTasks();
  const hasChildren = useCallback(
    (taskId: string): boolean => allTasks.some((task) => isTaskPost(task) && task.parentId === taskId),
    [allTasks]
  );
  const isProject = useMemo(() => makeIsProject(allTasks), [allTasks]);

  const [statusMenuOpenByTaskId, setStatusMenuOpenByTaskId] = useState<Record<string, boolean>>({});
  const statusTriggerPointerDownTaskIdsRef = useRef<Set<string>>(new Set());
  const allowStatusMenuOpenTaskIdsRef = useRef<Set<string>>(new Set());
  const statusMenuOpenedFromKeyboardTaskIdsRef = useRef<Set<string>>(new Set());
  const statusMenuOpenedOnPointerDownTaskIdsRef = useRef<Set<string>>(new Set());

  const groupedUpcoming = useMemo(() => {
    const groups: { label: string; tasks: TaskPost[]; isOverdue?: boolean }[] = [];
    const today = startOfDay(new Date());

    const overdue: TaskPost[] = [];
    const todayTasks: TaskPost[] = [];
    const tomorrowTasks: TaskPost[] = [];
    const thisWeek: TaskPost[] = [];
    const later: TaskPost[] = [];

    upcomingTasks.forEach((task) => {
      const due = getTaskPrimaryDate(task)?.date;
      if (!due) return;
      const dueDay = startOfDay(due);

      if (isPast(dueDay) && !isToday(dueDay)) {
        overdue.push(task);
      } else if (isToday(dueDay)) {
        todayTasks.push(task);
      } else if (isTomorrow(dueDay)) {
        tomorrowTasks.push(task);
      } else {
        const daysUntil = Math.floor((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 7) {
          thisWeek.push(task);
        } else {
          later.push(task);
        }
      }
    });

    if (overdue.length > 0) groups.push({ label: "Overdue", tasks: overdue, isOverdue: true });
    if (todayTasks.length > 0) groups.push({ label: "Today", tasks: todayTasks });
    if (tomorrowTasks.length > 0) groups.push({ label: "Tomorrow", tasks: tomorrowTasks });
    if (thisWeek.length > 0) groups.push({ label: "This Week", tasks: thisWeek });
    if (later.length > 0) groups.push({ label: "Later", tasks: later });

    return groups;
  }, [upcomingTasks]);

  const canCompleteTask = (task: Post) => canUserChangeTaskStatus(task, currentUser);
  const dispatchStatusChange = (taskId: string, stateId: string) => {
    const state = getTaskStateRegistry().find((entry) => entry.id === stateId);
    if (!state) return;
    void dispatchFeedInteraction({ type: "task.changeStatus", taskId, state: toTaskStateFromDefinition(state) });
  };
  const dispatchToggleComplete = (taskId: string) => {
    void dispatchFeedInteraction({ type: "task.toggleComplete", taskId });
  };
  const getStatusToggleHint = (status?: TaskState): string => {
    const alternateKey = getAlternateModifierLabel();
    const statusType = getTaskStatus(status);
    if (statusType === "active") return t("hints.statusToggle.active", { alternateKey });
    if (statusType === "done") return t("hints.statusToggle.done");
    if (statusType === "closed") return t("hints.statusToggle.closed");
    return t("hints.statusToggle.open", { alternateKey });
  };
  const getStatusButtonTitle = (task: Post) => {
    if (canCompleteTask(task)) return getStatusToggleHint(getTaskState(task));
    return getTaskStatusChangeBlockedReason(task, currentUser, false, people) || getStatusToggleHint(getTaskState(task));
  };

  const openStatusMenu = (taskId: string) => {
    setStatusMenuOpenByTaskId((prev) => ({ ...prev, [taskId]: true }));
  };
  const closeStatusMenu = (taskId: string) => {
    setStatusMenuOpenByTaskId((prev) => {
      if (!prev[taskId]) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };
  const allowStatusMenuOpen = (taskId: string) => {
    allowStatusMenuOpenTaskIdsRef.current.add(taskId);
  };
  const clearStatusMenuOpenIntent = (taskId: string) => {
    allowStatusMenuOpenTaskIdsRef.current.delete(taskId);
  };
  const handleStatusTriggerKeyDown = (event: KeyboardEvent<HTMLElement>, task: Post) => {
    if (!canCompleteTask(task)) return;
    if (event.key !== "Enter" && event.key !== " " && event.key !== "ArrowDown") return;
    event.preventDefault();
    event.stopPropagation();
    allowStatusMenuOpen(task.id);
    statusMenuOpenedFromKeyboardTaskIdsRef.current.add(task.id);
    openStatusMenu(task.id);
  };

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      <div className="flex-1 overflow-auto p-3">
        {groupedUpcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t("tasks.empty.noUpcoming")}</p>
        ) : (
          <div className="space-y-4">
            {groupedUpcoming.map((group) => (
              <div key={group.label}>
                <h3
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wide mb-2",
                    group.isOverdue ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {group.label} ({group.tasks.length})
                </h3>
                <div className="space-y-1.5">
                  {group.tasks.map((task) => {
                    const authorColor = getAuthorColor(task.author);
                    const canChangeStatus = canCompleteTask(task);
                    const canEditPriority = canChangeStatus && !isTaskTerminal(getTaskState(task));
                    return (
                      <div
                        key={task.id}
                        data-task-id={task.id}
                        className="relative flex items-start gap-2 p-2 rounded-lg bg-card border border-border"
                      >
                        {typeof task.priority === "number" ? (
                          <div className="absolute right-2 top-2 z-10">
                            <TaskPrioritySelect
                              id={`upcoming-priority-${task.id}`}
                              taskId={canEditPriority ? task.id : undefined}
                              priority={task.priority}
                              stopPropagation
                              className={cn(
                                "px-1.5 py-0.5 text-sm focus:outline-none",
                                TASK_CHIP_STYLES.priority,
                                "text-sm",
                                canEditPriority ? "cursor-pointer hover:bg-warning/20" : "cursor-not-allowed opacity-60"
                              )}
                            />
                          </div>
                        ) : null}
                        <DropdownMenu
                          open={Boolean(statusMenuOpenByTaskId[task.id])}
                          onOpenChange={(open) => {
                            if (!open) {
                              closeStatusMenu(task.id);
                              clearStatusMenuOpenIntent(task.id);
                              statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id);
                              return;
                            }
                            if (allowStatusMenuOpenTaskIdsRef.current.has(task.id)) {
                              openStatusMenu(task.id);
                            } else {
                              closeStatusMenu(task.id);
                            }
                            clearStatusMenuOpenIntent(task.id);
                            statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id);
                          }}
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              onKeyDown={(event) => handleStatusTriggerKeyDown(event, task)}
                              onClick={(e) => {
                                if (!canCompleteTask(task)) return;
                                if (statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id)) {
                                  e.stopPropagation();
                                  return;
                                }
                                if (statusMenuOpenedFromKeyboardTaskIdsRef.current.delete(task.id)) {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  return;
                                }
                                handleTaskStatusToggleClick(e, {
                                  status: getTaskState(task),
                                  hasStatusChangeHandler: canCompleteTask(task),
                                  isMenuOpen: Boolean(statusMenuOpenByTaskId[task.id]),
                                  openMenu: () => openStatusMenu(task.id),
                                  closeMenu: () => closeStatusMenu(task.id),
                                  allowMenuOpen: () => allowStatusMenuOpen(task.id),
                                  clearMenuOpenIntent: () => clearStatusMenuOpenIntent(task.id),
                                  toggleStatus: () => dispatchToggleComplete(task.id),
                                  focusTask: () => focusTask(task.id),
                                  focusOnQuickToggle: hasChildren(task.id),
                                });
                              }}
                              onFocus={() => {
                                statusTriggerPointerDownTaskIdsRef.current.delete(task.id);
                              }}
                              onPointerDown={() => {
                                statusTriggerPointerDownTaskIdsRef.current.add(task.id);
                                clearStatusMenuOpenIntent(task.id);
                                statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id);
                              }}
                              onPointerDownCapture={(e) => {
                                if (!canCompleteTask(task)) return;
                                if (
                                  shouldOpenStatusMenuForDirectSelection({
                                    status: getTaskState(task),
                                    altKey: e.altKey,
                                    hasStatusChangeHandler: canCompleteTask(task),
                                  })
                                ) {
                                  e.preventDefault();
                                  allowStatusMenuOpen(task.id);
                                  statusMenuOpenedOnPointerDownTaskIdsRef.current.add(task.id);
                                  openStatusMenu(task.id);
                                }
                              }}
                              onBlur={() => {
                                statusTriggerPointerDownTaskIdsRef.current.delete(task.id);
                                clearStatusMenuOpenIntent(task.id);
                                statusMenuOpenedFromKeyboardTaskIdsRef.current.delete(task.id);
                                statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id);
                              }}
                              disabled={!canCompleteTask(task)}
                              aria-label={t("tasks.actions.setStatus")}
                              title={getStatusButtonTitle(task)}
                              className={cn(
                                "flex-shrink-0 p-0.5 rounded transition-colors touch-manipulation",
                                canCompleteTask(task) ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                              )}
                            >
                              <TaskStateIcon status={getTaskState(task)} />
                            </button>
                          </DropdownMenuTrigger>
                          {canCompleteTask(task) && (
                            <DropdownMenuContent align="start">
                              {getTaskStateRegistry().map((state) => {
                                const isCurrent = resolveTaskStateFromStatus(getTaskState(task)).id === state.id;
                                return (
                                  <DropdownMenuItem
                                    key={state.id}
                                    ref={
                                      isCurrent
                                        ? (node) => {
                                            if (node && statusMenuOpenByTaskId[task.id]) {
                                              requestAnimationFrame(() => node.focus());
                                            }
                                          }
                                        : undefined
                                    }
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      dispatchStatusChange(task.id, state.id);
                                    }}
                                    className={cn(isCurrent && "bg-muted")}
                                  >
                                    <TaskStateDefIcon state={state} className="mr-2" />
                                    {state.label}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          )}
                        </DropdownMenu>
                        <div className="flex-1 min-w-0">
                          <p
                            onClick={() => {
                              if (!hasTextSelection() && hasChildren(task.id)) {
                                focusTask(task.id);
                              }
                            }}
                            className={cn(
                              `text-sm cursor-pointer ${TASK_INTERACTION_STYLES.hoverText} line-clamp-2`,
                              typeof task.priority === "number" && "pr-14"
                            )}
                            title={(() => {
                              const typeLabel = t("tasks.task").toLowerCase();
                              const preview = getTaskTooltipPreview(task.content);
                              return preview
                                ? t("tasks.focusTaskWithPreview", { type: typeLabel, preview })
                                : t("tasks.focusTaskTitle", { type: typeLabel });
                            })()}
                          >
                            {renderTaskContentWithProjectHeading(
                              task.content,
                              isProject(task.id),
                              (tag) => {
                                void dispatchFeedInteraction({ type: "filter.applyHashtagInclude", tag });
                              },
                              {
                                plainHashtags: isTaskTerminal(getTaskState(task)),
                                people,
                                disableStandaloneEmbeds: true,
                              }
                            )}
                          </p>
                          <div className="mt-1 flex items-end justify-between gap-2">
                            {(() => {
                              const primaryDate = getTaskPrimaryDate(task);
                              if (!primaryDate) return null;
                              return (
                                <span className="text-xs flex items-center gap-2 min-w-0">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: authorColor.accent }}
                                  />
                                  <Clock className="w-3 h-3 flex-shrink-0" />
                                  <span className="uppercase tracking-wide">
                                    {getTaskDateTypeLabel(primaryDate.type)}
                                  </span>
                                  <span className="truncate">
                                    {format(primaryDate.date, "MMM d")}
                                    {primaryDate.time && ` ${primaryDate.time}`}
                                  </span>
                                </span>
                              );
                            })()}
                            <TaskAssigneeAvatars task={task} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
