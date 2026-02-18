import { memo, useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNDK } from "@/lib/nostr/ndk-context";
import { Circle, CircleDot, CheckCircle2, Calendar, Clock, ArrowUpDown, RotateCcw, ListTodo, Activity, Flag, Tags } from "lucide-react";
import { Task, Relay, Channel, Person, TaskCreateResult, TaskDateType } from "@/types";
import { SharedViewComposer } from "./SharedViewComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { linkifyContent } from "@/lib/linkify";
import { TaskTagChipRow } from "./TaskTagChipRow";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { sortTasks, buildChildrenMap, SortContext, getDueDateColorClass } from "@/lib/taskSorting";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { canUserChangeTaskStatus } from "@/lib/task-permissions";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { taskMatchesTextQuery } from "@/lib/task-text-filter";
import { buildComposePrefillFromFiltersAndContext } from "@/lib/compose-prefill";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
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
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

interface ListViewProps {
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
    explicitMentionPubkeys?: string[],
    priority?: number
  ) => Promise<TaskCreateResult> | TaskCreateResult;
  onToggleComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  onUpdateDueDate?: (taskId: string, dueDate: Date | undefined, dueTime?: string, dateType?: TaskDateType) => void;
  onUpdatePriority?: (taskId: string, priority: number) => void;
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
  onFocusSidebar?: () => void;
  onHashtagClick?: (tag: string) => void;
  onAuthorClick?: (author: Person) => void;
  onSignInClick?: () => void;
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
}

type SortField = "priority" | "content" | "status" | "dueDate" | "timestamp";
type SortDirection = "asc" | "desc";

interface PriorityCellProps {
  taskId: string;
  taskContent: string;
  priority?: number;
  onUpdatePriority?: (taskId: string, priority: number) => void;
}

const PriorityCell = memo(function PriorityCell({
  taskId,
  taskContent,
  priority,
  onUpdatePriority,
}: PriorityCellProps) {
  const value = typeof priority === "number" ? String(priority) : "";
  return (
    <select
      aria-label={`Priority for ${taskContent}`}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        if (!next) return;
        const parsed = Number.parseInt(next, 10);
        if (Number.isFinite(parsed)) {
          onUpdatePriority?.(taskId, parsed);
        }
      }}
      className="h-7 rounded-md border border-border/50 bg-transparent px-2 text-xs text-foreground shadow-none focus:outline-none focus:ring-1 focus:ring-primary/30"
    >
      <option value="">—</option>
      <option value="20">P20</option>
      <option value="40">P40</option>
      <option value="60">P60</option>
      <option value="80">P80</option>
      <option value="100">P100</option>
    </select>
  );
}, (prev, next) =>
  prev.taskId === next.taskId &&
  prev.taskContent === next.taskContent &&
  prev.priority === next.priority &&
  prev.onUpdatePriority === next.onUpdatePriority
);

export function ListView({
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
  onUpdateDueDate,
  onUpdatePriority,
  focusedTaskId,
  onFocusTask,
  onFocusSidebar,
  onHashtagClick,
  onAuthorClick,
  onSignInClick,
  forceShowComposer = false,
  composeGuideActivationSignal,
}: ListViewProps) {
  const { t } = useTranslation();
  const { user } = useNDK();
  const SHARED_COMPOSE_DRAFT_KEY = "nodex.compose-draft.feed-tree";
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  
  // Track sort version - incremented on view/filter changes, not status changes
  const [sortVersion, setSortVersion] = useState(0);
  const [expandedChipRows, setExpandedChipRows] = useState<Record<string, boolean>>({});
  const [showAllTagsOnWideScreens, setShowAllTagsOnWideScreens] = useState(false);
  const prevTasksRef = useRef<string>("");
  const prevSearchRef = useRef(searchQuery);
  const prevFocusedRef = useRef(focusedTaskId);

  const includedChannels = channels.filter(c => c.filterState === "included").map(c => c.name.toLowerCase());
  const excludedChannels = channels.filter(c => c.filterState === "excluded").map(c => c.name.toLowerCase());

  // Detect filter/view changes (not status changes) to trigger re-sort
  useEffect(() => {
    const taskIdsSnapshot = tasks.map(t => t.id).sort().join(",");
    const filtersChanged = 
      prevTasksRef.current !== taskIdsSnapshot ||
      prevSearchRef.current !== searchQuery ||
      prevFocusedRef.current !== focusedTaskId;
    
    if (filtersChanged) {
      setSortVersion(v => v + 1);
      prevTasksRef.current = taskIdsSnapshot;
      prevSearchRef.current = searchQuery;
      prevFocusedRef.current = focusedTaskId;
    }
  }, [tasks, searchQuery, focusedTaskId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(min-width: 1536px)");
    const sync = (matches: boolean) => setShowAllTagsOnWideScreens(matches);
    sync(mediaQuery.matches);
    const listener = (event: MediaQueryListEvent) => sync(event.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  // Build children map for sorting context - memoize based on sortVersion to prevent re-sorting on status changes
  const sortContextRef = useRef<SortContext | null>(null);
  
  const sortContext: SortContext = useMemo(() => {
    const childrenMap = buildChildrenMap(allTasks);
    sortContextRef.current = {
      childrenMap,
      allTasks,
    };
    return sortContextRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortVersion]);

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

  // Get full ancestor chain for a task
  const getAncestorChain = useCallback((taskId: string): { id: string; text: string }[] => {
    const chain: { id: string; text: string }[] = [];
    let current = allTasks.find(t => t.id === taskId);
    
    while (current?.parentId) {
      const parent = allTasks.find(t => t.id === current!.parentId);
      if (parent) {
        chain.unshift({
          id: parent.id,
          text: parent.content.slice(0, 20) + (parent.content.length > 20 ? "..." : "")
        });
        current = parent;
      } else {
        break;
      }
    }
    
    return chain;
  }, [allTasks]);

  // Get only task-type items
  // Use pre-filtered tasks from Index (relay/person filtering already applied)
  const filteredTaskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);
  
  // Stable sorted list - only re-sort when sortVersion changes
  const listTasks = useMemo(() => {
    let filtered = allTasks.filter(task => {
      if (task.taskType !== "task") return false;

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

    // Use priority sort by default
    if (sortField === "priority") {
      filtered = sortTasks(filtered, sortContext);
      if (sortDirection === "desc") {
        filtered = filtered.reverse();
      }
      return filtered;
    }

    // Custom field sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case "content":
          comparison = a.content.localeCompare(b.content);
          break;
        case "status": {
          const statusOrder = { "in-progress": 0, "todo": 1, "done": 2 };
          comparison = (statusOrder[a.status || "todo"] || 1) - (statusOrder[b.status || "todo"] || 1);
          break;
        }
        case "dueDate":
          if (!a.dueDate && !b.dueDate) comparison = 0;
          else if (!a.dueDate) comparison = 1;
          else if (!b.dueDate) comparison = -1;
          else comparison = a.dueDate.getTime() - b.dueDate.getTime();
          break;
        case "timestamp":
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
          break;
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, filteredTaskIds, searchQuery, includedChannels, excludedChannels, sortField, sortDirection, focusedTaskId, sortContext, sortVersion]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleResetSort = () => {
    setSortField("priority");
    setSortDirection("asc");
    setSortVersion(v => v + 1);
  };

  const handleNewTask = (
    content: string,
    taskTags: string[],
    taskRelays: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    explicitMentionPubkeys?: string[],
    priority?: number
  ): Promise<TaskCreateResult> => {
    return Promise.resolve(onNewTask(
      content,
      taskTags,
      taskRelays,
      taskType,
      dueDate,
      dueTime,
      dateType,
      focusedTaskId || undefined,
      undefined,
      explicitMentionPubkeys,
      priority
    ));
  };

  const canCompleteTask = (task: Task) => {
    return canUserChangeTaskStatus(task, currentUser);
  };
  const focusedTask = focusedTaskId ? allTasks.find((t) => t.id === focusedTaskId) : null;

  // Task IDs for keyboard navigation
  const taskIds = useMemo(() => listTasks.map(t => t.id), [listTasks]);

  // Keyboard navigation
  const { focusedTaskId: keyboardFocusedTaskId } = useTaskNavigation({
    taskIds,
    onSelectTask: (id) => onFocusTask?.(id),
    onGoBack: () => onFocusTask?.(null),
    onFocusSidebar,
    enabled: true,
  });

  // Scroll focused task into view
  const tableContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (keyboardFocusedTaskId && tableContainerRef.current) {
      const element = tableContainerRef.current.querySelector(
        `[data-task-id="${keyboardFocusedTaskId}"]`
      );
      if (element) {
        element.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [keyboardFocusedTaskId]);

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className={cn(
        "flex items-center gap-1 text-xs font-medium",
        sortField === field ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  // Editable status cell
  const StatusCell = ({ task }: { task: Task }) => {
    const status = task.status || "todo";
    
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(
            "text-xs sm:text-xs px-1.5 sm:px-2 py-1 rounded-full font-medium cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all whitespace-nowrap",
            status === "done" ? "bg-primary/10 text-primary" :
            status === "in-progress" ? "bg-warning/15 text-warning" :
            "bg-muted text-muted-foreground"
          )}>
            {status === "in-progress" ? (
              <>
                <span className="sm:hidden">{t("listView.status.inProgressShort")}</span>
                <span className="hidden sm:inline">{t("listView.status.inProgress")}</span>
              </>
            ) : status === "done" ? t("listView.status.done") : t("listView.status.todo")}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem 
            onClick={() => onStatusChange?.(task.id, "todo")}
            className={cn(status === "todo" && "bg-muted")}
          >
            <Circle className="w-4 h-4 mr-2 text-muted-foreground" />
            {t("listView.status.todo")}
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onStatusChange?.(task.id, "in-progress")}
            className={cn(status === "in-progress" && "bg-muted")}
          >
            <CircleDot className="w-4 h-4 mr-2 text-warning" />
            {t("listView.status.inProgress")}
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onStatusChange?.(task.id, "done")}
            className={cn(status === "done" && "bg-muted")}
          >
            <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
            {t("listView.status.done")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // Editable due date cell
  const DueDateCell = ({ task }: { task: Task }) => {
    const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
    const [localDueTime, setLocalDueTime] = useState(task.dueTime || "");
    const [localDateType, setLocalDateType] = useState<TaskDateType>(task.dateType || "due");
    
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className={cn(
            "flex items-center gap-1.5 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded transition-colors",
            dueDateColor
          )}>
            {task.dueDate ? (
              <>
                <Calendar className="w-3.5 h-3.5" />
                <span className="uppercase tracking-wide">{getTaskDateTypeLabel(task.dateType)}</span>
                <span>{format(task.dueDate, "MMM d, yyyy")}</span>
                {task.dueTime && (
                  <>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{task.dueTime}</span>
                  </>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{t("listView.dates.setDate")}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground" htmlFor={`list-date-type-${task.id}`}>{t("listView.dates.type")}</label>
              <select
                id={`list-date-type-${task.id}`}
                value={localDateType}
                onChange={(event) => setLocalDateType(event.target.value as TaskDateType)}
                className="h-7 rounded-md border border-border/50 bg-transparent px-2 text-xs text-foreground shadow-none focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option value="due">{t("composer.dates.due")}</option>
                <option value="scheduled">{t("composer.dates.scheduled")}</option>
                <option value="start">{t("composer.dates.start")}</option>
                <option value="end">{t("composer.dates.end")}</option>
                <option value="milestone">{t("composer.dates.milestone")}</option>
              </select>
            </div>
            <CalendarComponent
              mode="single"
              selected={task.dueDate}
              onSelect={(date) => {
                onUpdateDueDate?.(task.id, date, localDueTime || undefined, localDateType);
              }}
              initialFocus
            />
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="time"
                value={localDueTime}
                onChange={(event) => {
                  const value = event.target.value;
                  setLocalDueTime(value);
                  if (task.dueDate) {
                    onUpdateDueDate?.(task.id, task.dueDate, value || undefined, localDateType);
                  }
                }}
                className="text-xs bg-background border border-border rounded px-2 py-1"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Editable tags cell
  const TagsCell = ({ task }: { task: Task }) => {
    return (
      <TaskTagChipRow
        task={task}
        people={people}
        expanded={Boolean(expandedChipRows[task.id])}
        maxVisibleTags={2}
        showAllTags={showAllTagsOnWideScreens}
        onToggleExpanded={(expanded) =>
          setExpandedChipRows((prev) => ({ ...prev, [task.id]: expanded }))
        }
        onHashtagClick={onHashtagClick}
        onPersonClick={onAuthorClick}
      />
    );
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

      <SharedViewComposer
        visible={Boolean(user) || forceShowComposer}
        onSubmit={handleNewTask}
        relays={relays}
        channels={channels}
        composeChannels={composeChannels}
        people={people}
        onCancel={() => {}}
        draftStorageKey={SHARED_COMPOSE_DRAFT_KEY}
        parentId={focusedTaskId || undefined}
        onSignInClick={onSignInClick}
        forceExpanded={forceShowComposer}
        forceExpandSignal={composeGuideActivationSignal}
        className="relative z-20 border-b border-border px-4 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0"
        defaultContent={buildComposePrefillFromFiltersAndContext(channels, focusedTask?.tags)}
        allowComment={false}
      />

      {/* Table */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table className="w-full table-fixed">
          <thead className="sticky top-0 bg-background border-b border-border z-10">
            <tr>
              <th className="text-left p-3 w-10">
                <div className="flex items-center gap-1">
                  {(sortField !== "priority" || sortDirection !== "asc") && (
                    <button
                      onClick={handleResetSort}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={t("listView.sort.reset")}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </th>
              <th className="text-left p-3 w-auto min-w-[22rem]">
                <SortButton field="content">
                  <span className="inline-flex items-center gap-1">
                    <ListTodo className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.task")}
                  </span>
                </SortButton>
              </th>
              <th className="text-left p-3 w-24 sm:w-28 md:w-32">
                <SortButton field="status">
                  <span className="inline-flex items-center gap-1">
                    <Activity className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.status")}
                  </span>
                </SortButton>
              </th>
              <th className="text-left p-3 w-40 md:w-44 lg:w-52 xl:w-72 2xl:w-[20rem]">
                <SortButton field="dueDate">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.dueDate")}
                  </span>
                </SortButton>
              </th>
              <th className="text-left p-3 w-16 sm:w-20 md:w-24">
                <SortButton field="priority">
                  <span className="inline-flex items-center gap-1">
                    <Flag className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.priority")}
                  </span>
                </SortButton>
              </th>
              <th className="text-left p-3 w-32 md:w-40 lg:w-48 xl:w-64 2xl:w-[26rem]">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Tags className="w-3 h-3" />
                  {t("tasks.tags")}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {listTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground py-8">
                  {t("tasks.empty.notFound")}
                </td>
              </tr>
            ) : (
              listTasks.map((task) => {
                const ancestorChain = getAncestorChain(task.id);
                const isKeyboardFocused = keyboardFocusedTaskId === task.id;
                const isLockedUntilStart = isTaskLockedUntilStart(task);
                
                return (
                  <tr
                    key={task.id}
                    data-task-id={task.id}
                    className={cn(
                      "border-b border-border hover:bg-muted/30 transition-colors",
                      task.status === "done" && "opacity-60",
                      isLockedUntilStart && "opacity-50 grayscale",
                      isKeyboardFocused && "ring-2 ring-primary ring-inset bg-primary/5"
                    )}
                  >
                    <td className="p-3">
                      <button
                        onClick={() => canCompleteTask(task) && onToggleComplete(task.id)}
                        disabled={!canCompleteTask(task)}
                        className={cn(
                          "p-0.5 rounded transition-colors",
                          canCompleteTask(task) ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                        )}
                      >
                        {task.status === "done" ? (
                          <CheckCircle2 className="w-5 h-5 text-primary" />
                        ) : task.status === "in-progress" ? (
                          <CircleDot className="w-5 h-5 text-warning" />
                        ) : (
                          <Circle className="w-5 h-5 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="p-3 min-w-0">
                      <div className="space-y-1">
                        {/* Parent context */}
                        {ancestorChain.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            {ancestorChain.map((ancestor, i) => (
                              <span key={ancestor.id} className="flex items-center gap-1">
                                {i > 0 && <span className="text-muted-foreground/50">›</span>}
                                <button
                                  onClick={() => onFocusTask?.(ancestor.id)}
                                  className={`${TASK_INTERACTION_STYLES.hoverLinkText} truncate max-w-[100px]`}
                                  title={t("tasks.focusBreadcrumbTitle", { title: ancestor.text })}
                                  aria-label={t("tasks.focusBreadcrumbTitle", { title: ancestor.text })}
                                >
                                  {ancestor.text}
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <p
                          onClick={() => onFocusTask?.(task.id)}
                          className={cn(
                            `text-sm cursor-pointer ${TASK_INTERACTION_STYLES.hoverText} break-words`,
                            task.status === "done" && "line-through text-muted-foreground"
                          )}
                          title={t("tasks.focusTaskTitle", { type: t("tasks.task").toLowerCase() })}
                        >
                          {linkifyContent(task.content, onHashtagClick, {
                            plainHashtags: task.status === "done",
                            people,
                          })}
                        </p>
                      </div>
                    </td>
                    <td className="p-3">
                      <StatusCell task={task} />
                    </td>
                    <td className="p-3 w-40 md:w-44 lg:w-52 xl:w-72 2xl:w-[20rem]">
                      <DueDateCell task={task} />
                    </td>
                    <td className="p-3">
                      <PriorityCell
                        taskId={task.id}
                        taskContent={task.content}
                        priority={task.priority}
                        onUpdatePriority={onUpdatePriority}
                      />
                    </td>
                    <td className="p-3 min-w-0">
                      <TagsCell task={task} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </main>
  );
}
