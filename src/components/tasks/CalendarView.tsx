import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { hasTextSelection } from "@/lib/click-intent";
import { ChevronLeft, ChevronRight, Plus, X, CalendarPlus, Clock, List, Grid } from "lucide-react";
import { TaskStateIcon, TaskStateDefIcon } from "@/components/tasks/task-state-ui";
import { getTaskStateRegistry, resolveTaskStateFromStatus, toTaskStatusFromStateDefinition } from "@/domain/task-states/task-state-config";
import { getTaskStatus, getTaskStatusType, type Task, type ComposeRestoreRequest, type TaskStatusType } from "@/types";
import type { Person } from "@/types/person";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  isPast,
  startOfDay,
  isTomorrow,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
  getISOWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import { getStandaloneEmbeddableUrls, linkifyContent } from "@/lib/linkify";
import { TaskTagChipRow, hasTaskMetadataChips } from "./TaskTagChipRow";
import { TaskPrioritySelect } from "./TaskMetadataEditors";
import { getAuthorColor } from "@/lib/author-color";
import { shouldAutoOpenStatusMenuOnFocus } from "@/lib/status-menu-focus";
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/domain/content/task-permissions";
import { TASK_INTERACTION_STYLES, TASK_CHIP_STYLES } from "@/lib/task-interaction-styles";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
import { useTranslation } from "react-i18next";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";
import { TaskAttachmentList } from "./TaskAttachmentList";
import { TaskAssigneeAvatars } from "./TaskAssigneeAvatars";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import {
  handleTaskStatusToggleClick,
  shouldOpenStatusMenuForDirectSelection,
} from "@/lib/task-status-toggle";
import { getTaskTooltipPreview, shouldCollapseTaskContent } from "@/lib/task-content-preview";
import {
  createCalendarSelectors,
  useTaskViewSource,
} from "@/features/feed-page/controllers/use-task-view-states";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { TaskViewMediaLightbox, useTaskViewMedia } from "./task-view-media";
import { TaskCreateComposer } from "./TaskCreateComposer";
import { useTaskViewServices } from "./use-task-view-services";

interface CalendarViewProps {
  tasks: Task[];
  allTasks: Task[];
  currentUser?: Person;
  focusedTaskId: string | null;
  searchQueryOverride?: string;
  composeRestoreRequest?: ComposeRestoreRequest | null;
  selectedDate?: Date | null;
  onSelectedDateChange?: (date: Date | null) => void;
  isMobile?: boolean;
  mobileView?: "calendar" | "upcoming";
  isHydrating?: boolean;
}

const getMonthKey = (month: Date) => format(startOfMonth(month), "yyyy-MM");

export function CalendarView({
  tasks,
  allTasks,
  currentUser,
  searchQueryOverride,
  focusedTaskId = null,
  selectedDate: controlledSelectedDate,
  onSelectedDateChange,
  isMobile = false,
  mobileView,
  composeRestoreRequest = null,
  isHydrating = false,
}: CalendarViewProps) {
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { authPolicy, focusTask } = useTaskViewServices();
  const { people, relays } = useFeedSurfaceState();
  const activeRelays = relays.filter((relay) => relay.isActive);
  const getStatusToggleHint = (status?: Task["status"]): string => {
    const alternateKey = getAlternateModifierLabel();
    const statusType = getTaskStatusType(status);
    if (statusType === "active") return t("hints.statusToggle.active", { alternateKey });
    if (statusType === "done") return t("hints.statusToggle.done");
    if (statusType === "closed") return t("hints.statusToggle.closed");
    return t("hints.statusToggle.open", { alternateKey });
  };

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [desktopMonths, setDesktopMonths] = useState<Date[]>(() => {
    const now = startOfMonth(new Date());
    return [subMonths(now, 1), now, addMonths(now, 1)];
  });
  const [selectedDateInternal, setSelectedDateInternal] = useState<Date | null>(new Date());
  const [isComposingEvent, setIsComposingEvent] = useState(false);
  const [mobileTab, setMobileTab] = useState<"calendar" | "upcoming">("upcoming");
  const [statusMenuOpenByTaskId, setStatusMenuOpenByTaskId] = useState<Record<string, boolean>>({});
  const [expandedContentByTaskId, setExpandedContentByTaskId] = useState<Record<string, boolean>>({});
  const statusTriggerPointerDownTaskIdsRef = useRef<Set<string>>(new Set());
  const allowStatusMenuOpenTaskIdsRef = useRef<Set<string>>(new Set());
  const statusMenuOpenedOnPointerDownTaskIdsRef = useRef<Set<string>>(new Set());
  const effectiveMobileTab = mobileView ?? mobileTab;
  const selectedDate = controlledSelectedDate !== undefined ? controlledSelectedDate : selectedDateInternal;
  const desktopScrollerRef = useRef<HTMLDivElement | null>(null);
  const desktopMonthSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const desktopInitialAlignDoneRef = useRef(false);
  const desktopLoadingRef = useRef(false);
  const prependCompensationRef = useRef<{ previousHeight: number } | null>(null);
  const loadingCooldownUntilRef = useRef(0);
  const syncMonthRafIdRef = useRef<number | null>(null);
  const taskSource = useTaskViewSource({
    tasks,
    allTasks,
    focusedTaskId,
    searchQueryOverride,
  });
  const calendarSelectors = useMemo(() => createCalendarSelectors(taskSource), [taskSource]);
  const searchQuery = taskSource.searchQuery;
  const tasksWithDueDates = calendarSelectors.getTasksWithDueDates();
  const upcomingTasks = calendarSelectors.getUpcomingTasks();
  const getTasksForDay = calendarSelectors.getTasksForDay;
  const getAncestorChain = calendarSelectors.getAncestorChain;
  const hasChildren = useCallback(
    (taskId: string): boolean => allTasks.some((task) => task.taskType === "task" && task.parentId === taskId),
    [allTasks]
  );

  const desktopMonthSections = useMemo(() => {
    return desktopMonths
      .map((month) => {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const weekStarts = eachWeekOfInterval(
          {
            start: startOfWeek(monthStart, { weekStartsOn: 1 }),
            end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
          },
          { weekStartsOn: 1 }
        );
        const weeks = weekStarts
          .map((weekStart) =>
            eachDayOfInterval({
              start: weekStart,
              end: endOfWeek(weekStart, { weekStartsOn: 1 }),
            })
          )
          // Assign cross-month weeks to a single month based on ISO anchor day (Thursday).
          // This avoids duplicated first/last week rows between adjacent month sections.
          .filter((week) => isSameMonth(week[3] ?? week[0], monthStart));
        return {
          key: getMonthKey(month),
          month: monthStart,
          weeks,
        };
      })
      .sort((a, b) => a.month.getTime() - b.month.getTime());
  }, [desktopMonths]);

  const selectedDayTasks = useMemo(
    () => (selectedDate ? getTasksForDay(selectedDate) : []),
    [getTasksForDay, selectedDate]
  );
  const mediaController = useTaskViewMedia(selectedDayTasks);
  const { openTaskMedia } = mediaController;

  const alignDesktopScrollToMonth = useCallback(
    (month: Date, behavior: ScrollBehavior = "auto") => {
      const key = getMonthKey(month);
      const section = desktopMonthSectionRefs.current[key];
      section?.scrollIntoView({ behavior, block: "start" });
    },
    []
  );

  const ensureDesktopMonthRendered = useCallback((month: Date) => {
    const monthStart = startOfMonth(month);
    const monthTime = monthStart.getTime();
    setDesktopMonths((prev) => {
      if (prev.some((candidate) => startOfMonth(candidate).getTime() === monthTime)) {
        return prev;
      }
      return [...prev, monthStart].sort((a, b) => a.getTime() - b.getTime());
    });
  }, []);

  // Group upcoming tasks by date category
  const groupedUpcoming = useMemo(() => {
    const groups: { label: string; tasks: Task[]; isOverdue?: boolean }[] = [];
    const today = startOfDay(new Date());
    
    const overdue: Task[] = [];
    const todayTasks: Task[] = [];
    const tomorrowTasks: Task[] = [];
    const thisWeek: Task[] = [];
    const later: Task[] = [];
    
    upcomingTasks.forEach(task => {
      if (!task.dueDate) return;
      const dueDay = startOfDay(task.dueDate);
      
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

  useEffect(() => {
    if (desktopInitialAlignDoneRef.current) return;
    const rafId = requestAnimationFrame(() => {
      alignDesktopScrollToMonth(currentMonth, "auto");
      desktopInitialAlignDoneRef.current = true;
    });
    return () => cancelAnimationFrame(rafId);
  }, [alignDesktopScrollToMonth, currentMonth]);

  useLayoutEffect(() => {
    const scroller = desktopScrollerRef.current;
    const pending = prependCompensationRef.current;
    if (!scroller || !pending) return;
    const addedHeight = scroller.scrollHeight - pending.previousHeight;
    if (addedHeight > 0) {
      scroller.scrollTop += addedHeight;
    }
    prependCompensationRef.current = null;
    desktopLoadingRef.current = false;
  }, [desktopMonths]);

  useEffect(() => {
    const scroller = desktopScrollerRef.current;
    if (!scroller) return;

    const syncCurrentMonthFromScroll = () => {
      syncMonthRafIdRef.current = null;
      const marker = scroller.scrollTop + 96;
      let activeMonth: Date | null = null;

      for (const section of desktopMonthSections) {
        const node = desktopMonthSectionRefs.current[section.key];
        if (!node) continue;
        if (node.offsetTop <= marker) {
          activeMonth = section.month;
        } else {
          break;
        }
      }

      if (!activeMonth) return;
      const nextActiveMonth = activeMonth;
      setCurrentMonth((prev) =>
        getMonthKey(prev) === getMonthKey(nextActiveMonth) ? prev : nextActiveMonth
      );
    };

    const onScroll = () => {
      if (syncMonthRafIdRef.current === null) {
        syncMonthRafIdRef.current = requestAnimationFrame(syncCurrentMonthFromScroll);
      }
      if (desktopLoadingRef.current) return;

      const now = performance.now();
      if (now < loadingCooldownUntilRef.current) return;

      const nearBottom = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight) < 360;
      const nearTop = scroller.scrollTop < 160;

      if (nearBottom) {
        desktopLoadingRef.current = true;
        loadingCooldownUntilRef.current = now + 120;
        setDesktopMonths((prev) => {
          const sorted = [...prev].sort((a, b) => a.getTime() - b.getTime());
          const last = sorted[sorted.length - 1] ?? startOfMonth(new Date());
          return [...sorted, addMonths(startOfMonth(last), 1)];
        });
        requestAnimationFrame(() => {
          desktopLoadingRef.current = false;
        });
      }

      if (nearTop) {
        desktopLoadingRef.current = true;
        loadingCooldownUntilRef.current = now + 140;
        prependCompensationRef.current = { previousHeight: scroller.scrollHeight };
        setDesktopMonths((prev) => {
          const sorted = [...prev].sort((a, b) => a.getTime() - b.getTime());
          const first = sorted[0] ?? startOfMonth(new Date());
          return [subMonths(startOfMonth(first), 1), ...sorted];
        });
      }
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (syncMonthRafIdRef.current !== null) {
        cancelAnimationFrame(syncMonthRafIdRef.current);
        syncMonthRafIdRef.current = null;
      }
    };
  }, [desktopMonthSections]);

  const canCompleteTask = (task: Task) => {
    return canUserChangeTaskStatus(task, currentUser);
  };
  const dispatchStatusChange = (taskId: string, stateId: string) => {
    const state = getTaskStateRegistry().find((entry) => entry.id === stateId);
    if (!state) return;
    void dispatchFeedInteraction({ type: "task.changeStatus", taskId, status: toTaskStatusFromStateDefinition(state) });
  };
  const dispatchToggleComplete = (taskId: string) => {
    void dispatchFeedInteraction({ type: "task.toggleComplete", taskId });
  };
  const getStatusButtonTitle = (task: Task) => {
    if (canCompleteTask(task)) return getStatusToggleHint(task.status);
    return getTaskStatusChangeBlockedReason(task, currentUser, false, people) || getStatusToggleHint(task.status);
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

  const navigateMonth = (direction: "prev" | "next") => {
    const targetMonth =
      direction === "prev" ? subMonths(currentMonth, 1) : addMonths(currentMonth, 1);
    setCurrentMonth(targetMonth);
    ensureDesktopMonthRendered(targetMonth);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => alignDesktopScrollToMonth(targetMonth, "smooth"));
    });
  };

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      <div
        className={cn(
          "relative flex-1 flex overflow-hidden min-h-0",
          isMobile ? "flex-col" : "flex-col xl:flex-row"
        )}
      >
        {/* Mobile Tab Switcher */}
        {isMobile && !mobileView && (
          <div className="flex border-b border-border flex-shrink-0">
            <button
              onClick={() => setMobileTab("upcoming")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors",
                mobileTab === "upcoming" 
                  ? "text-primary border-b-2 border-primary" 
                  : "text-muted-foreground"
              )}
            >
              <List className="w-4 h-4" />
              {t("calendar.tabs.upcoming")}
            </button>
            <button
              onClick={() => setMobileTab("calendar")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors",
                mobileTab === "calendar" 
                  ? "text-primary border-b-2 border-primary" 
                  : "text-muted-foreground"
              )}
            >
              <Grid className="w-4 h-4" />
              {t("calendar.tabs.calendar")}
            </button>
          </div>
        )}

        {/* Mobile Upcoming Feed */}
        {isMobile && effectiveMobileTab === "upcoming" && (
          <div className="flex-1 overflow-auto p-3">
            {groupedUpcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("tasks.empty.noUpcoming")}</p>
            ) : (
              <div className="space-y-4">
                {groupedUpcoming.map((group) => (
                  <div key={group.label}>
                    <h3 className={cn(
                      "text-xs font-semibold uppercase tracking-wide mb-2",
                      group.isOverdue ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {group.label} ({group.tasks.length})
                    </h3>
                    <div className="space-y-1.5">
                      {group.tasks.map((task) => {
                        const authorColor = getAuthorColor(task.author);
                        return (
                          <div
                            key={task.id}
                            data-task-id={task.id}
                            className="flex items-start gap-2 p-2 rounded-lg bg-card border border-border"
                          >
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
                                  onClick={(e) => {
                                    if (!canCompleteTask(task)) return;
                                    if (statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id)) {
                                      e.stopPropagation();
                                      return;
                                    }
                                    handleTaskStatusToggleClick(e, {
                                      status: task.status,
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
                                  onFocus={(e) => {
                                    if (!canCompleteTask(task)) return;
                                    if (
                                      shouldAutoOpenStatusMenuOnFocus(
                                        e.currentTarget,
                                        statusTriggerPointerDownTaskIdsRef.current.has(task.id)
                                      )
                                    ) {
                                      allowStatusMenuOpen(task.id);
                                      openStatusMenu(task.id);
                                    }
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
                                        status: task.status,
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
                                  <TaskStateIcon status={getTaskStatus(task)} />
                                </button>
                              </DropdownMenuTrigger>
                              {canCompleteTask(task) && (
                                <DropdownMenuContent align="start">
                                  {getTaskStateRegistry().map((state) => (
                                    <DropdownMenuItem
                                      key={state.id}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        dispatchStatusChange(task.id, state.id);
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
                            <div className="flex-1 min-w-0">
                              <p
                                onClick={() => {
                                  if (!hasTextSelection() && hasChildren(task.id)) {
                                    focusTask(task.id);
                                  }
                                }}
                                className={`text-sm cursor-pointer ${TASK_INTERACTION_STYLES.hoverText} line-clamp-2`}
                                title={(() => {
                                  const typeLabel = t("tasks.task").toLowerCase();
                                  const preview = getTaskTooltipPreview(task.content);
                                  return preview
                                    ? t("tasks.focusTaskWithPreview", { type: typeLabel, preview })
                                    : t("tasks.focusTaskTitle", { type: typeLabel });
                                })()}
                              >
                                {linkifyContent(task.content, (tag) => {
                                  void dispatchFeedInteraction({ type: "filter.applyHashtagExclusive", tag });
                                }, {
                                  plainHashtags: isTaskTerminalStatus(task.status),
                                  people,
                                  disableStandaloneEmbeds: true,
                                })}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs flex items-center gap-2">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: authorColor.accent }}
                                  />
                                  <Clock className="w-3 h-3" />
                                  <span className="uppercase tracking-wide">{getTaskDateTypeLabel(task.dateType)}</span>
                                  {format(task.dueDate!, "MMM d")}
                                  {task.dueTime && ` ${task.dueTime}`}
                                </span>
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
        )}

        {/* Calendar Grid - shown on desktop or when calendar tab selected on mobile */}
        {(!isMobile || effectiveMobileTab === "calendar") && (
          <div
            ref={desktopScrollerRef}
            className={cn(
              "flex-1 overflow-auto min-w-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
              isMobile ? "p-2 space-y-0" : "p-4 space-y-2"
            )}
            data-onboarding="calendar-month-stack"
          >
            {desktopMonthSections.map((section) => (
              <section
                key={section.key}
                ref={(node: HTMLDivElement | null) => {
                  desktopMonthSectionRefs.current[section.key] = node;
                }}
                className={cn("space-y-0.5", isMobile ? "pt-1" : "pt-1.5")}
              >
                <h2 className={cn(
                  "py-1 text-sm font-semibold text-foreground/90",
                  isMobile && "text-center"
                )}>
                  {format(section.month, "MMMM yyyy")}
                </h2>

                <div className={cn(
                  "grid gap-px mb-0.5",
                  isMobile ? "grid-cols-[1.8rem_repeat(7,minmax(0,1fr))]" : "grid-cols-[2.25rem_repeat(7,minmax(0,1fr))]"
                )}>
                  <div className="text-center text-xs font-medium text-muted-foreground py-1">{t("calendar.weekShort")}</div>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                      {isMobile ? day[0] : day}
                    </div>
                  ))}
                </div>

                <div className="space-y-px bg-border/35">
                  {section.weeks.map((week) => {
                    const weekContainsToday = week.some((day) => isToday(day));
                    return (
                    <div
                      key={week[0]?.toISOString() ?? section.key}
                      className={cn(
                        "grid gap-px bg-border/35",
                        isMobile ? "grid-cols-[1.8rem_repeat(7,minmax(0,1fr))]" : "grid-cols-[2.25rem_repeat(7,minmax(0,1fr))]"
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center justify-center text-xs font-medium",
                          weekContainsToday
                            ? "bg-primary/15 text-primary font-semibold"
                            : "bg-muted/55 text-muted-foreground"
                        )}
                      >
                        {getISOWeek(week[3] ?? week[0])}
                      </div>
                      {week.map((day) => {
                        const dayTasks = getTasksForDay(day);
                        const isSelected = selectedDate && isSameDay(day, selectedDate);
                        const isInDisplayedMonth = isSameMonth(day, section.month);
                        const dayIsToday = isToday(day);

                        return (
                          <button
                            key={day.toISOString()}
                            onClick={() => {
                              if (controlledSelectedDate === undefined) {
                                setSelectedDateInternal(day);
                              }
                              onSelectedDateChange?.(day);
                              if (!isInDisplayedMonth) {
                                setCurrentMonth(startOfMonth(day));
                                ensureDesktopMonthRendered(day);
                              }
                            }}
                            aria-current={dayIsToday ? "date" : undefined}
                            className={cn(
                              "transition-colors duration-150 text-left flex flex-col relative border border-transparent",
                              isMobile ? "min-h-[4.4rem] p-1" : "min-h-[6.2rem] p-1",
                              // Subtle row tint when this week contains today, distinct from selected day
                              weekContainsToday ? "bg-primary/5" : "bg-background",
                              dayIsToday && "border-primary bg-primary/15 ring-1 ring-primary/40",
                              isSelected ? "bg-primary/25 border-primary" : !dayIsToday && "hover:bg-muted/40",
                              !isInDisplayedMonth && "opacity-60"
                            )}
                          >
                            <span
                              className={cn(
                                isMobile ? "text-xs" : "text-sm",
                                "font-medium",
                                dayIsToday &&
                                  "inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground"
                              )}
                            >
                              {format(day, "d")}
                            </span>
                            {dayTasks.length > 0 && (
                              isMobile ? (
                                <div className="flex gap-0.5 mt-0.5">
                                  {dayTasks.slice(0, 3).map((task) => {
                                    const authorColor = getAuthorColor(task.author);
                                    return (
                                      <span
                                        key={task.id}
                                        className="w-1 h-1 rounded-full"
                                        style={{ backgroundColor: authorColor.accent }}
                                      />
                                    );
                                  })}
                                  {dayTasks.length > 3 && (
                                    <span className="text-[0.375rem] text-muted-foreground">+</span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex-1 flex flex-col gap-0.5 mt-1 overflow-hidden w-full">
                                  {dayTasks.slice(0, 2).map((task) => {
                                    const authorColor = getAuthorColor(task.author);
                                    return (
                                      <div
                                        key={task.id}
                                        className={cn(
                                          "text-[0.625rem] leading-tight px-1 py-0.5 rounded truncate flex items-center gap-1",
                                          isTaskTerminalStatus(task.status)
                                            ? "bg-muted text-muted-foreground line-through"
                                            : getTaskStatusType(task.status) === "active"
                                              ? "bg-warning/15 text-warning"
                                              : "bg-primary/10"
                                        )}
                                      >
                                        <span
                                          className="h-1.5 w-1.5 rounded-full"
                                          style={{ backgroundColor: authorColor.accent }}
                                        />
                                        {task.content.slice(0, 15)}...
                                      </div>
                                    );
                                  })}
                                  {dayTasks.length > 2 && (
                                    <span className="text-[0.625rem] text-muted-foreground">
                                      {t("calendar.moreTasks", { count: dayTasks.length - 2 })}
                                    </span>
                                  )}
                                </div>
                              )
                            )}
                          </button>
                        );
                      })}
                    </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Selected Day Panel - desktop or mobile calendar tab */}
        {(!isMobile || effectiveMobileTab === "calendar") && (
          <div className={cn(
            "border-border overflow-y-auto flex-shrink-0",
            isMobile 
              ? "border-t p-2 flex-1" 
              : "w-full h-72 border-t p-3 xl:w-[27rem] 2xl:w-[31rem] xl:h-auto xl:border-t-0 xl:border-l xl:p-4"
          )}
          data-onboarding="calendar-day-panel"
          >
          {selectedDate ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => navigateMonth("prev")}
                  className="p-1.5 rounded hover:bg-muted transition-colors"
                  aria-label={t("calendar.nav.previousMonth")}
                  data-onboarding="calendar-month-nav-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-medium text-sm">
                  {format(currentMonth, "MMMM yyyy")}
                </span>
                <button
                  onClick={() => navigateMonth("next")}
                  className="p-1.5 rounded hover:bg-muted transition-colors"
                  aria-label={t("calendar.nav.nextMonth")}
                  data-onboarding="calendar-month-nav-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">
                  {format(selectedDate, "EEEE, MMMM d")}
                </h3>
                {authPolicy.canCreateContent && (
                  <button
                    onClick={() => setIsComposingEvent(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {t("calendar.actions.addEvent")}
                  </button>
                )}
              </div>

              {/* Event Composer */}
              {isComposingEvent && (
                <div className="mb-4 p-3 bg-card border border-border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarPlus className="w-3 h-3" />
                      {t("calendar.actions.newEventOn", { date: format(selectedDate, "MMM d") })}
                    </span>
                    <button
                      onClick={() => setIsComposingEvent(false)}
                      className="p-0.5 rounded hover:bg-muted"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <TaskCreateComposer
                    onCancel={() => setIsComposingEvent(false)}
                    compact
                    focusedTaskId={focusedTaskId}
                    closeOnSuccess
                    allowComment={false}
                    defaultDueDate={selectedDate}
                    composeRestoreRequest={composeRestoreRequest}
                  />
                </div>
              )}

              {selectedDayTasks.length === 0 && !isComposingEvent ? (
                <p className="text-sm text-muted-foreground">{t("tasks.empty.noneScheduledForDay")}</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayTasks.map((task) => {
                    const ancestorChain = getAncestorChain(task.id);
                    const authorColor = getAuthorColor(task.author);
                    const isLockedUntilStart = isTaskLockedUntilStart(task);
                    const mediaCaptionByUrl = new Map(
                      (task.attachments || [])
                        .filter((attachment) => Boolean(attachment.url))
                        .map((attachment) => [
                          attachment.url.trim().toLowerCase(),
                          attachment.alt || attachment.name || attachment.url,
                        ])
                    );
                    const standaloneEmbedUrls = new Set(
                      getStandaloneEmbeddableUrls(task.content).map((url) => url.trim().toLowerCase())
                    );
                    const attachmentsWithoutInlineEmbeds = (task.attachments || []).filter((attachment) => {
                      const normalizedUrl = attachment.url?.trim().toLowerCase();
                      return !normalizedUrl || !standaloneEmbedUrls.has(normalizedUrl);
                    });
                    const hasCollapsibleContent = shouldCollapseTaskContent(task.content);
                    const isContentExpanded = Boolean(expandedContentByTaskId[task.id]);
                   
                    return (
                        <div
                        key={task.id}
                        data-task-id={task.id}
                        onClick={() => {
                          if (!hasTextSelection() && hasChildren(task.id)) {
                            focusTask(task.id);
                          }
                        }}
                        title={(() => {
                          const typeLabel = t("tasks.task").toLowerCase();
                          const preview = getTaskTooltipPreview(task.content);
                          return preview
                            ? t("tasks.focusTaskWithPreview", { type: typeLabel, preview })
                            : t("tasks.focusTaskTitle", { type: typeLabel });
                        })()}
                        className={cn(
                          `p-3 rounded-lg border border-border border-l-4 border-l-transparent bg-card transition-colors cursor-pointer ${TASK_INTERACTION_STYLES.cardSurface}`,
                          isTaskTerminalStatus(task.status) && "opacity-60",
                          isLockedUntilStart && "opacity-50 grayscale"
                        )}
                        style={{ borderLeftColor: authorColor.accent }}
                      >
                        {/* Parent context */}
                        {ancestorChain.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground mb-2">
                            {ancestorChain.map((ancestor, i) => (
                              <span key={ancestor.id} className="flex max-w-[50%] items-center gap-1">
                                {i > 0 && <span className="text-muted-foreground/50">›</span>}
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    focusTask(ancestor.id);
                                  }}
                                  className={`${TASK_INTERACTION_STYLES.hoverLinkText} max-w-full truncate`}
                                  title={t("tasks.focusBreadcrumbTitle", { title: ancestor.text })}
                                  aria-label={t("tasks.focusBreadcrumbTitle", { title: ancestor.text })}
                                >
                                  {ancestor.text}
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        
                        <div className="flex items-start gap-2">
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
                                onClick={(e) => {
                                  if (!canCompleteTask(task)) return;
                                  if (statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id)) {
                                    e.stopPropagation();
                                    return;
                                  }
                                  handleTaskStatusToggleClick(e, {
                                    status: task.status,
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
                                onFocus={(e) => {
                                  if (!canCompleteTask(task)) return;
                                  if (
                                    shouldAutoOpenStatusMenuOnFocus(
                                      e.currentTarget,
                                      statusTriggerPointerDownTaskIdsRef.current.has(task.id)
                                    )
                                  ) {
                                    allowStatusMenuOpen(task.id);
                                    openStatusMenu(task.id);
                                  }
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
                                      status: task.status,
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
                                  statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id);
                                }}
                                disabled={!canCompleteTask(task)}
                                aria-label={t("tasks.actions.setStatus")}
                                title={getStatusButtonTitle(task)}
                                className={cn(
                                  "flex-shrink-0 p-0.5 rounded transition-colors touch-manipulation",
                                  canCompleteTask(task) ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                                )}
                              >
                                <TaskStateIcon status={getTaskStatus(task)} />
                              </button>
                            </DropdownMenuTrigger>
                            {canCompleteTask(task) && (
                              <DropdownMenuContent align="start">
                                {getTaskStateRegistry().map((state) => (
                                  <DropdownMenuItem
                                    key={state.id}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      dispatchStatusChange(task.id, state.id);
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
                          <div className="flex-1 min-w-0">
                            <div
                              className={cn(
                                "text-sm",
                                hasCollapsibleContent && !isContentExpanded
                                  ? "whitespace-pre-line line-clamp-3 overflow-hidden"
                                  : "whitespace-pre-wrap",
                                isTaskTerminalStatus(task.status) && "line-through text-muted-foreground"
                              )}
                            >
                              {linkifyContent(task.content, (tag) => {
                                void dispatchFeedInteraction({ type: "filter.applyHashtagExclusive", tag });
                              }, {
                                plainHashtags: isTaskTerminalStatus(task.status),
                                people,
                                disableStandaloneEmbeds: hasCollapsibleContent && !isContentExpanded,
                                onStandaloneMediaClick: (url) => openTaskMedia(task.id, url),
                                getStandaloneMediaCaption: (url) =>
                                  mediaCaptionByUrl.get(url.trim().toLowerCase()),
                              })}
                            </div>
                            {hasCollapsibleContent && (
                              <button
                                type="button"
                                className="mt-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setExpandedContentByTaskId((prev) => ({
                                    ...prev,
                                    [task.id]: !isContentExpanded,
                                  }));
                                }}
                              >
                                {isContentExpanded ? t("tasks.actions.showLess") : t("tasks.actions.showMore")}
                              </button>
                            )}
                            <TaskAttachmentList
                              attachments={attachmentsWithoutInlineEmbeds}
                              className="mt-1.5 space-y-1"
                              onMediaClick={(url) => openTaskMedia(task.id, url)}
                            />
                            {task.dueTime && (
                              <div
                                className="flex items-center gap-2 text-xs mt-1"
                                title={`Due time: ${task.dueTime}`}
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ backgroundColor: authorColor.accent }}
                                  title={task.author?.displayName || task.author?.name || "Author"}
                                />
                                <Clock className="w-3 h-3" />
                                <span>{task.dueTime}</span>
                              </div>
                            )}
                            {(typeof task.priority === "number" || hasTaskMetadataChips(task, activeRelays.length)) && (
                              <TaskTagChipRow
                                task={task}
                                priority={task.priority}
                                className="mt-1"
                                tagClassName="px-1 py-0.5 rounded text-xs"
                                showEmptyPlaceholder={false}
                                testId={`calendar-chip-row-${task.id}`}
                              />
                            )}
                          </div>
                          {/* Assignee avatars - bottom right of card without growing it */}
                          <div className="flex-shrink-0 self-end">
                            <TaskAssigneeAvatars task={task} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("tasks.empty.selectDay")}</p>
          )}
        </div>
        )}
      </div>

      <TaskViewMediaLightbox controller={mediaController} onOpenTask={focusTask} />

    </main>
  );
}
