import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, X, CalendarPlus } from "lucide-react";
import { formatLocalIsoDate, type Post, isTaskPost } from "@/types";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  addMonths,
  subMonths,
  startOfDay,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
} from "date-fns";
import { cn } from "@/lib/utils";
import { makeIsProject } from "@/domain/content/task-projects";
import { useTranslation } from "react-i18next";
import {
  createCalendarSelectors,
  useTaskViewSource,
} from "@/features/feed-page/controllers/use-task-view-states";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { TaskViewMediaLightbox, useTaskViewMedia } from "./task-view-media";
import { TaskCreateComposer } from "./TaskCreateComposer";
import { useComposerSubmitHandler } from "./use-composer-submit-handler";
import { useTaskViewServices } from "./use-task-view-services";
import { CalendarTaskCard } from "./calendar/CalendarTaskCard";
import { CalendarWeekRow } from "./calendar/CalendarWeekRow";
import { useCurrentUser } from "@/features/feed-page/stores/current-user-store";
import { useIsMobile } from "@/hooks/use-mobile";

interface CalendarViewProps {
  posts: Post[];
  focusedTaskId: string | null;
  selectedDate?: Date | null;
  onSelectedDateChange?: (date: Date | null) => void;
}

const getMonthKey = (month: Date) => format(startOfMonth(month), "yyyy-MM");

export function CalendarView({
  posts,
  focusedTaskId,
  selectedDate: controlledSelectedDate,
  onSelectedDateChange,
}: CalendarViewProps) {
  const currentUser = useCurrentUser();
  const isMobile = useIsMobile();
  const { t } = useTranslation(["tasks", "composer"]);
  const { authPolicy, focusTask } = useTaskViewServices();
  const { people, relays } = useFeedSurfaceState();
  const activeRelays = relays.filter((relay) => relay.isActive);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [desktopMonths, setDesktopMonths] = useState<Date[]>(() => {
    const now = startOfMonth(new Date());
    return [subMonths(now, 1), now, addMonths(now, 1)];
  });
  const [selectedDateInternal, setSelectedDateInternal] = useState<Date | null>(new Date());
  const [composerMode, setComposerMode] = useState<"task" | "event" | null>(null);
  const closeComposer = useCallback(() => setComposerMode(null), []);
  const handleComposerSubmit = useComposerSubmitHandler({
    focusedTaskId,
    closeOnSuccess: true,
    onCancel: closeComposer,
  });
  const selectedDate = controlledSelectedDate !== undefined ? controlledSelectedDate : selectedDateInternal;
  const desktopScrollerRef = useRef<HTMLDivElement | null>(null);
  const desktopMonthSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const desktopCurrentWeekRef = useRef<HTMLDivElement | null>(null);
  const desktopInitialAlignDoneRef = useRef(false);
  const desktopLoadingRef = useRef(false);
  const prependCompensationRef = useRef<{ previousHeight: number } | null>(null);
  const loadingCooldownUntilRef = useRef(0);
  const syncMonthRafIdRef = useRef<number | null>(null);
  // Suppress scroll-driven currentMonth updates while a programmatic scroll is animating,
  // so the header doesn't briefly flash the previous month during smooth scrolls.
  const programmaticScrollUntilRef = useRef(0);
  const taskSource = useTaskViewSource({
    posts,
    focusedTaskId,
    currentView: "calendar",
  });
  const calendarSelectors = useMemo(() => createCalendarSelectors(taskSource), [taskSource]);
  const getTasksForDay = calendarSelectors.getTasksForDay;
  const getAncestorChain = calendarSelectors.getAncestorChain;
  const hasChildren = useCallback(
    (taskId: string): boolean => posts.some((task) => isTaskPost(task) && task.parentId === taskId),
    [posts]
  );
  const isProject = useMemo(() => makeIsProject(posts), [posts]);

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

  const multiDayEntries = useMemo(() => calendarSelectors.getMultiDayEntries(), [calendarSelectors]);
  const weekGridClassName = isMobile
    ? "grid-cols-[1.8rem_repeat(7,minmax(0,1fr))]"
    : "grid-cols-[2.25rem_repeat(7,minmax(0,1fr))]";
  const setCurrentWeekNode = useCallback((node: HTMLDivElement | null) => {
    desktopCurrentWeekRef.current = node;
  }, []);

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

  useEffect(() => {
    if (desktopInitialAlignDoneRef.current) return;
    const rafId = requestAnimationFrame(() => {
      // Prefer scrolling so the current week is visible (with a small top offset)
      // rather than the start of the month, which on shorter viewports can hide today.
      const scroller = desktopScrollerRef.current;
      const weekNode = desktopCurrentWeekRef.current;
      if (scroller && weekNode) {
        const offset = isMobile ? 8 : 12;
        const top = weekNode.offsetTop - offset;
        // Use 'auto' on initial mount so it doesn't animate from 0.
        programmaticScrollUntilRef.current = performance.now() + 50;
        scroller.scrollTo({ top: Math.max(0, top), behavior: "auto" });
      } else {
        alignDesktopScrollToMonth(currentMonth, "auto");
      }
      desktopInitialAlignDoneRef.current = true;
    });
    return () => cancelAnimationFrame(rafId);
  }, [alignDesktopScrollToMonth, currentMonth, isMobile]);

  // Close the new-event composer whenever the selected day changes, so the
  // composer doesn't carry over (with its seeded due date) into another day.
  const previousSelectedDayKeyRef = useRef<string | null>(
    selectedDate ? format(startOfDay(selectedDate), "yyyy-MM-dd") : null
  );
  useEffect(() => {
    const nextKey = selectedDate ? format(startOfDay(selectedDate), "yyyy-MM-dd") : null;
    if (previousSelectedDayKeyRef.current !== nextKey) {
      previousSelectedDayKeyRef.current = nextKey;
      setComposerMode(null);
    }
  }, [selectedDate]);

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
      // While a programmatic scroll is animating, don't update the header — otherwise
      // the smooth-scroll mid-frames briefly land on the previous section, causing a flash.
      if (performance.now() < programmaticScrollUntilRef.current) return;
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

  const selectDay = (day: Date, inDisplayedMonth: boolean) => {
    if (controlledSelectedDate === undefined) {
      setSelectedDateInternal(day);
    }
    onSelectedDateChange?.(day);
    if (!inDisplayedMonth) {
      setCurrentMonth(startOfMonth(day));
      ensureDesktopMonthRendered(day);
    }
  };

  // Multi-day bars act like the selected-day cards: focus a task with
  // subtasks, otherwise select the bar's first day to show it in the panel.
  const handleSpanClick = (task: Post, day: Date, inDisplayedMonth: boolean) => {
    if (hasChildren(task.id)) focusTask(task.id);
    else selectDay(day, inDisplayedMonth);
  };

  const navigateMonth = (direction: "prev" | "next") => {
    const targetMonth =
      direction === "prev" ? subMonths(currentMonth, 1) : addMonths(currentMonth, 1);
    setCurrentMonth(targetMonth);
    ensureDesktopMonthRendered(targetMonth);
    // Suppress scroll-driven month sync for the duration of the smooth scroll so the
    // header doesn't briefly flash the previous month while the animation passes through it.
    programmaticScrollUntilRef.current = performance.now() + 700;
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

                <div className={cn("grid gap-px mb-0.5", weekGridClassName)}>
                  <div className="text-center text-xs font-medium text-muted-foreground py-1">{t("calendar.weekShort")}</div>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                      {isMobile ? day[0] : day}
                    </div>
                  ))}
                </div>

                <div className="space-y-px bg-border/35">
                  {section.weeks.map((week) => (
                    <CalendarWeekRow
                      key={week[0]?.toISOString() ?? section.key}
                      week={week}
                      month={section.month}
                      isMobile={isMobile}
                      gridClassName={weekGridClassName}
                      selectedDate={selectedDate}
                      getTasksForDay={getTasksForDay}
                      multiDayEntries={multiDayEntries}
                      onSelectDay={selectDay}
                      onSpanClick={handleSpanClick}
                      currentWeekRef={setCurrentWeekNode}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

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
                  title={t("calendar.nav.previousMonth")}
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
                  title={t("calendar.nav.nextMonth")}
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
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setComposerMode("task")}
                      data-testid="calendar-create-task"
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      {t("composer:composer.actions.createTask")}
                    </button>
                    <button
                      onClick={() => setComposerMode("event")}
                      data-testid="calendar-create-event"
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      {t("composer:composer.actions.createEvent")}
                    </button>
                  </div>
                )}
              </div>

              {composerMode !== null && (
                <div className="mb-4 p-3 bg-card border border-border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarPlus className="w-3 h-3" />
                      {t(
                        composerMode === "event"
                          ? "calendar.actions.newEventOn"
                          : "calendar.actions.newTaskOn",
                        { date: format(selectedDate, "MMM d") },
                      )}
                    </span>
                    <button
                      onClick={closeComposer}
                      className="p-0.5 rounded hover:bg-muted"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <TaskCreateComposer
                    key={composerMode}
                    onCancel={closeComposer}
                    onSubmit={handleComposerSubmit}
                    compact
                    focusedTaskId={focusedTaskId}
                    allowedPostTypes={[composerMode]}
                    defaultDates={[
                      { date: formatLocalIsoDate(selectedDate), type: composerMode === "event" ? "start" : "due" },
                    ]}
                  />
                </div>
              )}

              {selectedDayTasks.length === 0 && composerMode === null ? (
                <p className="text-sm text-muted-foreground">{t("tasks.empty.noneScheduledForDay")}</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayTasks.map((task) => (
                    <CalendarTaskCard
                      key={task.id}
                      task={task}
                      selectedDate={selectedDate}
                      ancestorChain={getAncestorChain(task.id)}
                      isProject={isProject(task.id)}
                      hasChildren={hasChildren(task.id)}
                      currentUser={currentUser}
                      people={people}
                      activeRelayCount={activeRelays.length}
                      onOpenMedia={openTaskMedia}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("tasks.empty.selectDay")}</p>
          )}
        </div>
      </div>
      {mediaController.activeMediaIndex !== null && (
        <TaskViewMediaLightbox controller={mediaController} onOpenTask={focusTask} />
      )}
    </main>
  );
}
