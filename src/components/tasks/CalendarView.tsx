import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { useNDK } from "@/lib/nostr/ndk-context";
import { ChevronLeft, ChevronRight, Plus, Circle, CircleDot, CheckCircle2, X, CalendarPlus, Clock, List, Grid } from "lucide-react";
import { Task, Relay, Channel, Person, TaskDateType } from "@/types";
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
import { linkifyContent } from "@/lib/linkify";
import { TaskMentionChips, hasTaskMentionChips } from "./TaskMentionChips";
import { TaskComposer } from "./TaskComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { getDueDateColorClass } from "@/lib/taskSorting";
import { shouldAutoOpenStatusMenuOnFocus } from "@/lib/status-menu-focus";
import { canUserChangeTaskStatus } from "@/lib/task-permissions";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { taskMatchesTextQuery } from "@/lib/task-text-filter";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CalendarViewProps {
  tasks: Task[];
  allTasks: Task[];
  relays: Relay[];
  channels: Channel[];
  composeChannels?: Channel[];
  people: Person[];
  currentUser?: Person;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewTask: (
    content: string,
    tags: string[],
    relays: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    parentId?: string,
    initialStatus?: "todo" | "in-progress" | "done",
    explicitMentionPubkeys?: string[]
  ) => void;
  onToggleComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
  selectedDate?: Date | null;
  onSelectedDateChange?: (date: Date | null) => void;
  isMobile?: boolean;
  mobileView?: "calendar" | "upcoming";
  onHashtagClick?: (tag: string) => void;
  onAuthorClick?: (author: Person) => void;
}

const getMonthKey = (month: Date) => format(startOfMonth(month), "yyyy-MM");

export function CalendarView({
  tasks,
  allTasks,
  relays,
  channels,
  composeChannels,
  people,
  currentUser,
  searchQuery,
  onNewTask,
  onToggleComplete,
  onStatusChange,
  focusedTaskId,
  onFocusTask,
  selectedDate: controlledSelectedDate,
  onSelectedDateChange,
  isMobile = false,
  mobileView,
  onHashtagClick,
  onAuthorClick,
}: CalendarViewProps) {
  const { user } = useNDK();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [desktopMonths, setDesktopMonths] = useState<Date[]>(() => {
    const now = startOfMonth(new Date());
    return [subMonths(now, 1), now, addMonths(now, 1)];
  });
  const [selectedDateInternal, setSelectedDateInternal] = useState<Date | null>(new Date());
  const [isComposingEvent, setIsComposingEvent] = useState(false);
  const [mobileTab, setMobileTab] = useState<"calendar" | "upcoming">("upcoming");
  const [statusMenuOpenByTaskId, setStatusMenuOpenByTaskId] = useState<Record<string, boolean>>({});
  const statusTriggerPointerDownTaskIdsRef = useRef<Set<string>>(new Set());
  const allowStatusMenuOpenTaskIdsRef = useRef<Set<string>>(new Set());
  const effectiveMobileTab = mobileView ?? mobileTab;
  const selectedDate = controlledSelectedDate !== undefined ? controlledSelectedDate : selectedDateInternal;
  const desktopScrollerRef = useRef<HTMLDivElement | null>(null);
  const desktopMonthSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const desktopInitialAlignDoneRef = useRef(false);
  const desktopLoadingRef = useRef(false);
  const prependCompensationRef = useRef<{ previousHeight: number } | null>(null);
  const loadingCooldownUntilRef = useRef(0);
  const syncMonthRafIdRef = useRef<number | null>(null);

  const includedChannels = channels.filter(c => c.filterState === "included").map(c => c.name.toLowerCase());
  const excludedChannels = channels.filter(c => c.filterState === "excluded").map(c => c.name.toLowerCase());

  // Get all descendants of a task
  const getDescendantIds = useCallback((taskId: string): Set<string> => {
    const ids = new Set<string>();
    const addDescendants = (id: string) => {
      allTasks.filter(t => t.parentId === id).forEach(child => {
        ids.add(child.id);
        addDescendants(child.id);
      });
    };
    addDescendants(taskId);
    return ids;
  }, [allTasks]);

  // Get full ancestor chain for a task
  const getAncestorChain = useCallback((taskId: string): { id: string; text: string }[] => {
    const chain: { id: string; text: string }[] = [];
    let current = allTasks.find(t => t.id === taskId);
    
    while (current?.parentId) {
      const parent = allTasks.find(t => t.id === current!.parentId);
      if (parent) {
        chain.unshift({
          id: parent.id,
          text: parent.content.slice(0, 15) + (parent.content.length > 15 ? "..." : "")
        });
        current = parent;
      } else {
        break;
      }
    }
    
    return chain;
  }, [allTasks]);

  // Get tasks with due dates
  // Use pre-filtered tasks from Index (relay/person filtering already applied)
  const filteredTaskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);
  
  const tasksWithDueDates = useMemo(() => {
    return allTasks.filter(task => {
      if (!task.dueDate || task.taskType !== "task") return false;

      // Must be in pre-filtered tasks (relay/person filtering already applied)
      if (!filteredTaskIds.has(task.id)) return false;

      // If focused on a task, only show descendants
      if (focusedTaskId) {
        const descendantIds = getDescendantIds(focusedTaskId);
        if (!descendantIds.has(task.id)) return false;
      }

      if (!taskMatchesTextQuery(task, searchQuery, people)) {
        return false;
      }
      
      // Apply channel exclusion filter
      if (excludedChannels.length > 0) {
        const taskTagsLower = task.tags.map(t => t.toLowerCase());
        if (taskTagsLower.some(t => excludedChannels.includes(t))) {
          return false;
        }
      }
      
      // Apply channel inclusion filter - AND logic: must have ALL included channels
      if (includedChannels.length > 0) {
        const taskTagsLower = task.tags.map(t => t.toLowerCase());
        if (!includedChannels.every(c => taskTagsLower.includes(c))) {
          return false;
        }
      }
      
      return true;
    });
  }, [allTasks, filteredTaskIds, searchQuery, includedChannels, excludedChannels, focusedTaskId, getDescendantIds, people]);

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

  const getTasksForDay = (day: Date) => {
    return tasksWithDueDates.filter(task => task.dueDate && isSameDay(task.dueDate, day));
  };

  const selectedDayTasks = selectedDate ? getTasksForDay(selectedDate) : [];

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

  // Chronologically sorted tasks for upcoming feed
  const upcomingTasks = useMemo(() => {
    const today = startOfDay(new Date());
    
    return [...tasksWithDueDates]
      .filter(t => t.status !== "done")
      .sort((a, b) => {
        const aDate = a.dueDate ? startOfDay(a.dueDate) : null;
        const bDate = b.dueDate ? startOfDay(b.dueDate) : null;
        
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        
        // Both have dates - sort chronologically
        return aDate.getTime() - bDate.getTime();
      });
  }, [tasksWithDueDates]);

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

  const handleCreateEvent = (
    content: string,
    taskTags: string[],
    taskRelays: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    explicitMentionPubkeys?: string[]
  ) => {
    // Use the selected date if no due date was set
    const eventDate = dueDate || selectedDate || new Date();
    onNewTask(
      content,
      taskTags,
      taskRelays,
      taskType,
      eventDate,
      dueTime,
      dateType,
      focusedTaskId || undefined,
      undefined,
      explicitMentionPubkeys
    );
    setIsComposingEvent(false);
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
      {focusedTaskId && (
        <FocusedTaskBreadcrumb
          allTasks={allTasks}
          focusedTaskId={focusedTaskId}
          onFocusTask={onFocusTask}
        />
      )}

      <div
        className={cn(
          "flex-1 flex overflow-hidden min-h-0",
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
              Upcoming
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
              Calendar
            </button>
          </div>
        )}

        {/* Mobile Upcoming Feed */}
        {isMobile && effectiveMobileTab === "upcoming" && (
          <div className="flex-1 overflow-auto p-3">
            {groupedUpcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No upcoming tasks</p>
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
                        const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
                        return (
                          <div
                            key={task.id}
                            className="flex items-start gap-2 p-2 rounded-lg bg-card border border-border"
                          >
                            <DropdownMenu
                              open={Boolean(statusMenuOpenByTaskId[task.id])}
                              onOpenChange={(open) => {
                                if (!open) {
                                  closeStatusMenu(task.id);
                                  clearStatusMenuOpenIntent(task.id);
                                  return;
                                }
                                if (allowStatusMenuOpenTaskIdsRef.current.has(task.id)) {
                                  openStatusMenu(task.id);
                                } else {
                                  closeStatusMenu(task.id);
                                }
                                clearStatusMenuOpenIntent(task.id);
                              }}
                            >
                              <DropdownMenuTrigger asChild>
                                <button
                                  onClick={(e) => {
                                    if (!canCompleteTask(task)) return;
                                    const hasModifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
                                    if (hasModifier && onStatusChange) {
                                      allowStatusMenuOpen(task.id);
                                      openStatusMenu(task.id);
                                      return;
                                    }
                                    closeStatusMenu(task.id);
                                    clearStatusMenuOpenIntent(task.id);
                                    onToggleComplete(task.id);
                                  }}
                                  onFocus={(e) => {
                                    if (!onStatusChange || !canCompleteTask(task)) return;
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
                                  }}
                                  onBlur={() => {
                                    statusTriggerPointerDownTaskIdsRef.current.delete(task.id);
                                    clearStatusMenuOpenIntent(task.id);
                                  }}
                                  disabled={!canCompleteTask(task)}
                                  aria-label="Set status"
                                  className={cn(
                                    "flex-shrink-0 mt-0.5",
                                    canCompleteTask(task) ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                                  )}
                                >
                                  {task.status === "done" ? (
                                    <CheckCircle2 className="w-4 h-4 text-primary" />
                                  ) : task.status === "in-progress" ? (
                                    <CircleDot className="w-4 h-4 text-amber-500" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </button>
                              </DropdownMenuTrigger>
                              {onStatusChange && canCompleteTask(task) && (
                                <DropdownMenuContent align="start">
                                  <DropdownMenuItem onClick={() => onStatusChange(task.id, "todo")}>
                                    <Circle className="w-4 h-4 mr-2 text-muted-foreground" />
                                    To Do
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => onStatusChange(task.id, "in-progress")}>
                                    <CircleDot className="w-4 h-4 mr-2 text-amber-500" />
                                    In Progress
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => onStatusChange(task.id, "done")}>
                                    <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                                    Done
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              )}
                            </DropdownMenu>
                            <div className="flex-1 min-w-0">
                              <p
                                onClick={() => onFocusTask?.(task.id)}
                                className={`text-sm cursor-pointer ${TASK_INTERACTION_STYLES.hoverText} line-clamp-2`}
                              >
                                {task.content}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={cn("text-xs flex items-center gap-1", dueDateColor)}>
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
              isMobile ? "p-2 space-y-2" : "p-4 space-y-2"
            )}
            data-onboarding="calendar-month-stack"
          >
            {desktopMonthSections.map((section) => (
              <section
                key={section.key}
                ref={(node) => {
                  desktopMonthSectionRefs.current[section.key] = node;
                }}
                className={cn("space-y-0.5", isMobile ? "pt-1" : "pt-1.5")}
              >
                <h2 className="py-1 text-sm font-semibold text-foreground/90">
                  {format(section.month, "MMMM yyyy")}
                </h2>

                <div className={cn(
                  "grid gap-px mb-0.5",
                  isMobile ? "grid-cols-[1.8rem_repeat(7,minmax(0,1fr))]" : "grid-cols-[2.25rem_repeat(7,minmax(0,1fr))]"
                )}>
                  <div className="text-center text-xs font-medium text-muted-foreground py-1">Wk</div>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                      {isMobile ? day[0] : day}
                    </div>
                  ))}
                </div>

                <div className="space-y-px bg-border/35">
                  {section.weeks.map((week) => (
                    <div
                      key={week[0]?.toISOString() ?? section.key}
                      className={cn(
                        "grid gap-px bg-border/35",
                        isMobile ? "grid-cols-[1.8rem_repeat(7,minmax(0,1fr))]" : "grid-cols-[2.25rem_repeat(7,minmax(0,1fr))]"
                      )}
                    >
                      <div className="bg-muted/55 flex items-center justify-center text-xs font-medium text-muted-foreground">
                        {getISOWeek(week[3] ?? week[0])}
                      </div>
                      {week.map((day) => {
                        const dayTasks = getTasksForDay(day);
                        const isSelected = selectedDate && isSameDay(day, selectedDate);
                        const isInDisplayedMonth = isSameMonth(day, section.month);

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
                            className={cn(
                              "bg-background transition-colors duration-150 text-left flex flex-col relative border border-transparent",
                              isMobile ? "min-h-[4.4rem] p-1" : "min-h-[6.2rem] p-1",
                              isToday(day) && "border-primary/60",
                              isSelected ? "bg-primary/20 border-primary/70" : "hover:bg-muted/40",
                              !isInDisplayedMonth && "opacity-60"
                            )}
                          >
                            <span className={cn(isMobile ? "text-xs" : "text-sm", "font-medium", isToday(day) && "text-primary")}>
                              {format(day, "d")}
                            </span>
                            {dayTasks.length > 0 && (
                              isMobile ? (
                                <div className="flex gap-0.5 mt-0.5">
                                  {dayTasks.slice(0, 3).map((task) => (
                                    <div
                                      key={task.id}
                                      className={cn(
                                        "w-1 h-1 rounded-full",
                                        task.status === "done"
                                          ? "bg-muted-foreground"
                                          : task.status === "in-progress"
                                            ? "bg-amber-500"
                                            : "bg-primary"
                                      )}
                                    />
                                  ))}
                                  {dayTasks.length > 3 && (
                                    <span className="text-[6px] text-muted-foreground">+</span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex-1 flex flex-col gap-0.5 mt-1 overflow-hidden w-full">
                                  {dayTasks.slice(0, 2).map((task) => {
                                    const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
                                    return (
                                      <div
                                        key={task.id}
                                        className={cn(
                                          "text-[10px] leading-tight px-1 py-0.5 rounded truncate",
                                          task.status === "done"
                                            ? "bg-muted text-muted-foreground line-through"
                                            : task.status === "in-progress"
                                              ? "bg-amber-500/20 text-amber-700"
                                              : "bg-primary/10",
                                          dueDateColor
                                        )}
                                      >
                                        {task.content.slice(0, 15)}...
                                      </div>
                                    );
                                  })}
                                  {dayTasks.length > 2 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      +{dayTasks.length - 2} more
                                    </span>
                                  )}
                                </div>
                              )
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
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
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-medium text-sm">
                  {format(currentMonth, "MMMM yyyy")}
                </span>
                <button
                  onClick={() => navigateMonth("next")}
                  className="p-1.5 rounded hover:bg-muted transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">
                  {format(selectedDate, "EEEE, MMMM d")}
                </h3>
                {user && (
                  <button
                    onClick={() => setIsComposingEvent(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add Event
                  </button>
                )}
              </div>

              {/* Event Composer */}
              {isComposingEvent && (
                <div className="mb-4 p-3 bg-card border border-border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarPlus className="w-3 h-3" />
                      New event on {format(selectedDate, "MMM d")}
                    </span>
                    <button
                      onClick={() => setIsComposingEvent(false)}
                      className="p-0.5 rounded hover:bg-muted"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <TaskComposer
                    onSubmit={handleCreateEvent}
                    relays={relays}
                    channels={composeChannels || channels}
                    people={people}
                    onCancel={() => setIsComposingEvent(false)}
                    compact
                    defaultDueDate={selectedDate}
                    defaultContent={(() => {
                      const prefillChannels = new Set<string>();
                      channels.filter(c => c.filterState === "included").forEach(c => prefillChannels.add(c.name));
                      if (prefillChannels.size === 0) return "";
                      return Array.from(prefillChannels).map(c => `#${c}`).join(" ") + " ";
                    })()}
                  />
                </div>
              )}

              {selectedDayTasks.length === 0 && !isComposingEvent ? (
                <p className="text-sm text-muted-foreground">No tasks scheduled for this day</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayTasks.map((task) => {
                    const ancestorChain = getAncestorChain(task.id);
                    const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
                    const isLockedUntilStart = isTaskLockedUntilStart(task);
                    
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors",
                          task.status === "done" && "opacity-60",
                          isLockedUntilStart && "opacity-50 grayscale"
                        )}
                      >
                        {/* Parent context */}
                        {ancestorChain.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground mb-2">
                            {ancestorChain.map((ancestor, i) => (
                              <span key={ancestor.id} className="flex items-center gap-1">
                                {i > 0 && <span className="text-muted-foreground/50">›</span>}
                                <button
                                  onClick={() => onFocusTask?.(ancestor.id)}
                                  className={`${TASK_INTERACTION_STYLES.hoverLinkText} truncate max-w-[60px]`}
                                  title={`Focus task: ${ancestor.text}`}
                                  aria-label={`Focus task: ${ancestor.text}`}
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
                                return;
                              }
                              if (allowStatusMenuOpenTaskIdsRef.current.has(task.id)) {
                                openStatusMenu(task.id);
                              } else {
                                closeStatusMenu(task.id);
                              }
                              clearStatusMenuOpenIntent(task.id);
                            }}
                          >
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => {
                                  if (!canCompleteTask(task)) return;
                                  const hasModifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
                                  if (hasModifier && onStatusChange) {
                                    allowStatusMenuOpen(task.id);
                                    openStatusMenu(task.id);
                                    return;
                                  }
                                  closeStatusMenu(task.id);
                                  clearStatusMenuOpenIntent(task.id);
                                  onToggleComplete(task.id);
                                }}
                                onFocus={(e) => {
                                  if (!onStatusChange || !canCompleteTask(task)) return;
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
                                }}
                                onBlur={() => {
                                  statusTriggerPointerDownTaskIdsRef.current.delete(task.id);
                                  clearStatusMenuOpenIntent(task.id);
                                }}
                                disabled={!canCompleteTask(task)}
                                aria-label="Set status"
                                className={cn(
                                  "flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors",
                                  canCompleteTask(task) ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                                )}
                              >
                                {task.status === "done" ? (
                                  <CheckCircle2 className="w-4 h-4 text-primary" />
                                ) : task.status === "in-progress" ? (
                                  <CircleDot className="w-4 h-4 text-amber-500" />
                                ) : (
                                  <Circle className="w-4 h-4 text-muted-foreground" />
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            {onStatusChange && canCompleteTask(task) && (
                              <DropdownMenuContent align="start">
                                <DropdownMenuItem onClick={() => onStatusChange(task.id, "todo")}>
                                  <Circle className="w-4 h-4 mr-2 text-muted-foreground" />
                                  To Do
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onStatusChange(task.id, "in-progress")}>
                                  <CircleDot className="w-4 h-4 mr-2 text-amber-500" />
                                  In Progress
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onStatusChange(task.id, "done")}>
                                  <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                                  Done
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            )}
                          </DropdownMenu>
                          <div className="flex-1 min-w-0">
                            <p
                              onClick={() => onFocusTask?.(task.id)}
                              className={cn(
                                `text-sm cursor-pointer ${TASK_INTERACTION_STYLES.hoverText}`,
                                task.status === "done" && "line-through text-muted-foreground"
                              )}
                              title="Focus this task"
                            >
                              {linkifyContent(task.content, onHashtagClick, {
                                plainHashtags: task.status === "done",
                                people,
                              })}
                            </p>
                            {task.dueTime && (
                              <div className={cn("flex items-center gap-1 text-xs mt-1", dueDateColor)}>
                                <Clock className="w-3 h-3" />
                                <span>{task.dueTime}</span>
                              </div>
                            )}
                            {(hasTaskMentionChips(task) || task.tags.length > 0) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                <TaskMentionChips task={task} people={people} onPersonClick={onAuthorClick} inline />
                                {task.tags.map((tag) => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onHashtagClick?.(tag);
                                    }}
                                    className={`px-1 py-0.5 rounded text-xs ${TASK_INTERACTION_STYLES.hashtagChip}`}
                                    aria-label={`Filter to #${tag}`}
                                    title={`Filter to #${tag}`}
                                  >
                                    #{tag}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a day to view tasks</p>
          )}
        </div>
        )}
      </div>

    </main>
  );
}
