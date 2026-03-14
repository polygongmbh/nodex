import { memo, useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNDK } from "@/lib/nostr/ndk-context";
import { Circle, CircleDot, CheckCircle2, Calendar, Clock, ArrowUpDown, RotateCcw, ListTodo, Activity, Flag, Tags } from "lucide-react";
import {
  Task,
  TaskCreateResult,
  SharedTaskViewContext,
  TaskDateType,
  ComposeRestoreRequest,
  PublishedAttachment,
  Nip99Metadata,
} from "@/types";
import { SharedViewComposer } from "./SharedViewComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { getStandaloneEmbeddableUrls, linkifyContent } from "@/lib/linkify";
import { TaskTagChipRow } from "./TaskTagChipRow";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { sortTasks, buildChildrenMap, SortContext, getDueDateColorClass } from "@/lib/task-sorting";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/lib/task-permissions";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { buildComposePrefillFromFiltersAndContext } from "@/lib/compose-prefill";
import { isTaskLockedUntilStart } from "@/lib/task-dates";
import { TaskAttachmentList } from "./TaskAttachmentList";
import { useTaskMediaPreview } from "@/hooks/use-task-media-preview";
import { TaskMediaLightbox } from "@/components/tasks/TaskMediaLightbox";
import type { KanbanDepthMode } from "./DesktopSearchDock";
import { useTaskViewFiltering } from "@/hooks/use-task-view-filtering";
import { filterTasksByDepthMode } from "@/lib/depth-mode-filter";
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

interface ListViewProps extends SharedTaskViewContext {
  depthMode?: KanbanDepthMode;
  onToggleComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  onUpdateDueDate?: (taskId: string, dueDate: Date | undefined, dueTime?: string, dateType?: TaskDateType) => void;
  onUpdatePriority?: (taskId: string, priority: number) => void;
  onFocusSidebar?: () => void;
  onSignInClick?: () => void;
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  isInteractionBlocked?: boolean;
  onInteractionBlocked?: () => void;
}

type SortField = "priority" | "content" | "status" | "dueDate" | "timestamp";
type SortDirection = "asc" | "desc";

interface PriorityCellProps {
  taskId: string;
  taskContent: string;
  priority?: number;
  editable: boolean;
  onUpdatePriority?: (taskId: string, priority: number) => void;
}

const PriorityCell = memo(function PriorityCell({
  taskId,
  taskContent,
  priority,
  editable,
  onUpdatePriority,
}: PriorityCellProps) {
  const value = typeof priority === "number" ? String(priority) : "";
  return (
    <select
      aria-label={`Priority for ${taskContent}`}
      value={value}
      disabled={!editable}
      onChange={(event) => {
        const next = event.target.value;
        if (!next) return;
        const parsed = Number.parseInt(next, 10);
        if (Number.isFinite(parsed)) {
          onUpdatePriority?.(taskId, parsed);
        }
      }}
      className="h-7 rounded-md border-none bg-transparent px-2 text-xs text-foreground shadow-none focus:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
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
  prev.editable === next.editable &&
  prev.onUpdatePriority === next.onUpdatePriority
);

export function ListView({
  tasks,
  allTasks,
  relays,
  channels,
  channelMatchMode = "and",
  composeChannels,
  people,
  currentUser,
  searchQuery,
  depthMode = "leaves",
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
  composeRestoreRequest = null,
  isInteractionBlocked = false,
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
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  
  const sortContext: SortContext = useMemo(() => {
    const childrenMap = buildChildrenMap(allTasks);
    sortContextRef.current = {
      childrenMap,
      allTasks,
      taskById,
    };
    return sortContextRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortVersion, taskById]);

  const hasChildren = useCallback((taskId: string): boolean => {
    return allTasks.some((task) => task.taskType === "task" && task.parentId === taskId);
  }, [allTasks]);

  const getDepth = useCallback((taskId: string): number => {
    const task = taskById.get(taskId);
    if (!task?.parentId) return 1;
    return 1 + getDepth(task.parentId);
  }, [taskById]);

  // Get full ancestor chain for a task
  const getAncestorChain = useCallback((taskId: string): { id: string; text: string }[] => {
    const chain: { id: string; text: string }[] = [];
    let current = taskById.get(taskId);
    
    while (current?.parentId) {
      const parent = taskById.get(current.parentId);
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
  }, [taskById]);

  const filteredTaskCandidates = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    searchQuery,
    people,
    channels,
    channelMatchMode,
    taskPredicate: (task) => task.taskType === "task",
  });
  
  // Stable sorted list - only re-sort when sortVersion changes
  const listTasks = useMemo(() => {
    let filtered = filterTasksByDepthMode({
      tasks: filteredTaskCandidates,
      depthMode,
      focusedTaskId,
      getDepth,
      hasChildren,
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
  }, [
    depthMode,
    filteredTaskCandidates,
    focusedTaskId,
    getDepth,
    hasChildren,
    sortContext,
    sortDirection,
    sortField,
    sortVersion,
  ]);
  const {
    mediaItems,
    activeMediaIndex,
    activeMediaItem,
    activePostMediaIndex,
    activePostMediaCount,
    openTaskMedia,
    goToPreviousMedia,
    goToNextMedia,
    goToPreviousPost,
    goToNextPost,
    closeMediaPreview,
  } = useTaskMediaPreview(listTasks);

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
    priority?: number,
    attachments?: PublishedAttachment[],
    nip99?: Nip99Metadata
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
      priority,
      attachments,
      nip99
    ));
  };

  const canCompleteTask = (task: Task) => {
    return Boolean(user) && !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  };
  const getStatusButtonTitle = (task: Task) => {
    if (canCompleteTask(task)) return t("tasks.actions.setStatus");
    return getTaskStatusChangeBlockedReason(task, currentUser, isInteractionBlocked, people) || t("tasks.actions.setStatus");
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
    const editable = canCompleteTask(task);
    const statusClassName = cn(
      "text-xs px-1.5 sm:px-2 py-1 rounded-full font-medium whitespace-nowrap",
      status === "done" ? "bg-primary/10 text-primary" :
      status === "in-progress" ? "bg-warning/15 text-warning" :
      "bg-muted text-muted-foreground"
    );

    if (!editable) {
      return (
        <span className={cn(statusClassName, "opacity-60 cursor-not-allowed")}>
          {status === "in-progress" ? (
            <>
              <span className="lg:hidden">{t("listView.status.inProgressShort")}</span>
              <span className="hidden lg:inline">{t("listView.status.inProgress")}</span>
            </>
          ) : status === "done" ? t("listView.status.done") : t("listView.status.todo")}
        </span>
      );
    }
    
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(statusClassName, "cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all")}>
            {status === "in-progress" ? (
              <>
                <span className="lg:hidden">{t("listView.status.inProgressShort")}</span>
                <span className="hidden lg:inline">{t("listView.status.inProgress")}</span>
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
    const editable = canCompleteTask(task);
    const trigger = (
      <button
        disabled={!editable}
        className={cn(
          "flex items-center gap-1.5 text-sm px-2 py-1 rounded transition-colors",
          dueDateColor,
          editable ? "cursor-pointer hover:bg-muted/50" : "cursor-not-allowed opacity-60"
        )}
      >
        {task.dueDate ? (
          <>
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline uppercase tracking-wide">
              {t(`composer.dates.${task.dateType || "due"}`)}
            </span>
            <span>{format(task.dueDate, "MMM d, yyyy")}</span>
            {task.dueTime && (
              <span className="hidden xl:inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{task.dueTime}</span>
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">{t("listView.dates.setDate")}</span>
        )}
      </button>
    );

    if (!editable) {
      return trigger;
    }
    
    return (
      <Popover>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground" htmlFor={`list-date-type-${task.id}`}>{t("listView.dates.type")}</label>
              <select
                id={`list-date-type-${task.id}`}
                value={localDateType}
                onChange={(event) => setLocalDateType(event.target.value as TaskDateType)}
                className="h-7 rounded-md border-none bg-transparent px-2 text-xs text-foreground shadow-none focus:outline-none"
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
        composeRestoreRequest={composeRestoreRequest}
        className="relative z-20 border-b border-border px-4 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0"
        defaultContent={buildComposePrefillFromFiltersAndContext(channels, focusedTask?.tags)}
        allowComment={false}
      />

      {/* Table */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table className="w-full table-fixed">
          <thead className="sticky top-0 bg-background border-b border-border z-10">
            <tr>
              <th className="text-left p-2 2xl:p-3 w-10">
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
              <th className="text-left p-2 2xl:p-3 w-auto min-w-[22rem]">
                <SortButton field="content">
                  <span className="inline-flex items-center gap-1">
                    <ListTodo className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.task")}
                  </span>
                </SortButton>
              </th>
              <th className="hidden 2xl:table-cell text-left p-2 2xl:p-3 2xl:w-28">
                <SortButton field="status">
                  <span className="inline-flex items-center gap-1">
                    <Activity className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.status")}
                  </span>
                </SortButton>
              </th>
              <th className="text-left p-2 2xl:p-3 w-36 md:w-40 lg:w-44 xl:w-56 2xl:w-[19rem]">
                <SortButton field="dueDate">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.dueDate")}
                  </span>
                </SortButton>
              </th>
              <th className="text-left p-2 2xl:p-3 w-16 sm:w-20 md:w-24">
                <SortButton field="priority">
                  <span className="inline-flex items-center gap-1">
                    <Flag className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.priority")}
                  </span>
                </SortButton>
              </th>
              <th className="text-left p-2 2xl:p-3 w-[clamp(8rem,15vw,20rem)] 2xl:w-[clamp(20rem,24vw,30rem)]">
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
                const standaloneEmbedUrls = new Set(
                  getStandaloneEmbeddableUrls(task.content).map((url) => url.trim().toLowerCase())
                );
                const mediaCaptionByUrl = new Map<string, string>();
                for (const attachment of task.attachments || []) {
                  const normalizedUrl = attachment.url?.trim().toLowerCase();
                  const caption = attachment.alt?.trim() || attachment.name?.trim();
                  if (normalizedUrl && caption) mediaCaptionByUrl.set(normalizedUrl, caption);
                }
                const attachmentsWithoutInlineEmbeds = (task.attachments || []).filter((attachment) => {
                  const normalizedUrl = attachment.url?.trim().toLowerCase();
                  return !normalizedUrl || !standaloneEmbedUrls.has(normalizedUrl);
                });
                
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
                    <td className="p-2 2xl:p-3">
                      <button
                        onClick={() => canCompleteTask(task) && onToggleComplete(task.id)}
                        disabled={!canCompleteTask(task)}
                        title={getStatusButtonTitle(task)}
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
                    <td className="p-2 2xl:p-3 min-w-0">
                      <div className="space-y-1">
                        {/* Parent context */}
                        {ancestorChain.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            {ancestorChain.map((ancestor, i) => (
                              <span key={ancestor.id} className="flex items-center gap-1">
                                {i > 0 && <span className="text-muted-foreground/50">›</span>}
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onFocusTask?.(ancestor.id);
                                  }}
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
                        <div
                          onClick={() => onFocusTask?.(task.id)}
                          className={cn(
                            `text-sm cursor-pointer whitespace-pre-wrap ${TASK_INTERACTION_STYLES.hoverText} break-words`,
                            task.status === "done" && "line-through text-muted-foreground"
                          )}
                          title={t("tasks.focusTaskTitle", { type: t("tasks.task").toLowerCase() })}
                        >
                          {linkifyContent(task.content, onHashtagClick, {
                            plainHashtags: task.status === "done",
                            people,
                            onStandaloneMediaClick: (url) => openTaskMedia(task.id, url),
                            getStandaloneMediaCaption: (url) => mediaCaptionByUrl.get(url.trim().toLowerCase()),
                          })}
                        </div>
                        <TaskAttachmentList
                          attachments={attachmentsWithoutInlineEmbeds}
                          className="space-y-1"
                          onMediaClick={(url) => openTaskMedia(task.id, url)}
                        />
                      </div>
                    </td>
                    <td className="hidden 2xl:table-cell p-2 2xl:p-3">
                      <StatusCell task={task} />
                    </td>
                    <td className="p-2 2xl:p-3 w-36 md:w-40 lg:w-44 xl:w-56 2xl:w-[19rem]">
                      <DueDateCell task={task} />
                    </td>
                    <td className="p-2 2xl:p-3">
                      <PriorityCell
                        taskId={task.id}
                        taskContent={task.content}
                        priority={task.priority}
                        editable={canCompleteTask(task)}
                        onUpdatePriority={onUpdatePriority}
                      />
                    </td>
                    <td className="p-2 2xl:p-3 min-w-0 w-[clamp(8rem,15vw,20rem)] 2xl:w-[clamp(20rem,24vw,30rem)]">
                      <TagsCell task={task} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <TaskMediaLightbox
        open={activeMediaIndex !== null}
        mediaItem={activeMediaItem}
        mediaCount={mediaItems.length}
        mediaIndex={activeMediaIndex ?? 0}
        postMediaIndex={activePostMediaIndex}
        postMediaCount={activePostMediaCount}
        onOpenChange={(open) => {
          if (!open) closeMediaPreview();
        }}
        onPrevious={goToPreviousMedia}
        onNext={goToNextMedia}
        onPreviousPost={goToPreviousPost}
        onNextPost={goToNextPost}
        onOpenTask={(taskId) => onFocusTask?.(taskId)}
      />

    </main>
  );
}
