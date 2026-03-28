import { memo, useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Circle, CircleDot, CheckCircle2, Calendar, Clock, ArrowUpDown, RotateCcw, ListTodo, Activity, Flag, Tags, X } from "lucide-react";
import {
  Task,
  TaskCreateResult,
  SharedTaskViewContext,
  TaskDateType,
  ComposeRestoreRequest,
  PublishedAttachment,
  Nip99Metadata,
  TaskStatus,
} from "@/types";
import { SharedViewComposer } from "./SharedViewComposer";
import { TaskTagChipRow } from "./TaskTagChipRow";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { sortTasks, buildChildrenMap, SortContext, getDueDateColorClass } from "@/domain/content/task-sorting";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/domain/content/task-permissions";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { hasTextSelection } from "@/lib/click-intent";
import { buildComposePrefillFromFiltersAndContext } from "@/lib/compose-prefill";
import { isTaskLockedUntilStart } from "@/lib/task-dates";
import { useTaskMediaPreview } from "@/hooks/use-task-media-preview";
import { TaskMediaLightbox } from "@/components/tasks/TaskMediaLightbox";
import type { KanbanDepthMode } from "./DesktopSearchDock";
import { useTaskViewFiltering } from "@/features/feed-page/controllers/use-task-view-filtering";
import { filterTasksByDepthMode } from "@/domain/content/depth-mode-filter";
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
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import {
  handleTaskStatusToggleClick,
  shouldOpenStatusMenuForDirectSelection,
} from "@/lib/task-status-toggle";
import { FilteredEmptyState } from "@/components/tasks/FilteredEmptyState";
import { TaskDueDateEditorForm, TaskPrioritySelect } from "./TaskMetadataEditors";
import { useFeedViewInteractionModel } from "@/features/feed-page/interactions/feed-view-interaction-context";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { useFeedTaskCommands } from "@/features/feed-page/views/feed-task-command-context";
import { useEmptyScopeModel } from "@/features/feed-page/controllers/use-empty-scope-model";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";

interface ListViewProps extends SharedTaskViewContext {
  depthMode?: KanbanDepthMode;
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  isInteractionBlocked?: boolean;
  isHydrating?: boolean;
}

type SortField = "priority" | "content" | "status" | "dueDate" | "timestamp";
type SortDirection = "asc" | "desc";
const TABLE_CELL_PADDING_CLASS = "px-3 py-2";

interface PriorityCellProps {
  taskId: string;
  taskContent: string;
  priority?: number;
  editable: boolean;
}

function getTableContentPreview(content: string): string {
  return content.trim();
}

const PriorityCell = memo(function PriorityCell({
  taskId,
  taskContent,
  priority,
  editable,
}: PriorityCellProps) {
  return (
    <TaskPrioritySelect
      taskId={taskId}
      priority={priority}
      ariaLabel={`Priority for ${taskContent}`}
      disabled={!editable}
      includeEmptyOption
      className="h-7 rounded-md border-none bg-transparent px-2 text-xs text-foreground shadow-none focus:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
    />
  );
}, (prev, next) =>
  prev.taskId === next.taskId &&
  prev.taskContent === next.taskContent &&
  prev.priority === next.priority &&
  prev.editable === next.editable
);

export function ListView({
  tasks,
  allTasks,
  relays: relaysProp,
  channels: channelsProp,
  channelMatchMode: channelMatchModeProp,
  people: peopleProp,
  currentUser,
  searchQuery: searchQueryProp,
  depthMode = "leaves",
  focusedTaskId,
  forceShowComposer,
  composeGuideActivationSignal,
  composeRestoreRequest = null,
  isInteractionBlocked = false,
  isHydrating = false,
}: ListViewProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { onNewTask } = useFeedTaskCommands();
  const surface = useFeedSurfaceState();
  const relays = relaysProp ?? surface.relays;
  const channels = channelsProp ?? surface.channels;
  const channelMatchMode = channelMatchModeProp ?? surface.channelMatchMode ?? "and";
  const people = peopleProp ?? surface.people;
  const searchQuery = searchQueryProp ?? surface.searchQuery;
  const interactionModel = useFeedViewInteractionModel();
  const authPolicy = useAuthActionPolicy();
  const effectiveForceShowComposer = forceShowComposer ?? interactionModel.forceShowComposer;
  const focusTask = (taskId: string | null) => {
    void dispatchFeedInteraction({ type: "task.focus.change", taskId });
  };
  const focusSidebar = () => {
    void dispatchFeedInteraction({ type: "ui.focusSidebar" });
  };
  const SHARED_COMPOSE_DRAFT_KEY = COMPOSE_DRAFT_STORAGE_KEY;
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  
  // Track sort version - incremented on view/filter changes, not status changes
  const [sortVersion, setSortVersion] = useState(0);
  const [expandedChipRows, setExpandedChipRows] = useState<Record<string, boolean>>({});
  const [showAllTagsOnWideScreens, setShowAllTagsOnWideScreens] = useState(false);
  const prevTasksRef = useRef<string>("");
  const prevSearchRef = useRef(searchQuery);
  const prevFocusedRef = useRef(focusedTaskId);
  const [statusMenuOpenByTaskId, setStatusMenuOpenByTaskId] = useState<Record<string, boolean>>({});
  const allowStatusMenuOpenTaskIdsRef = useRef<Set<string>>(new Set());
  const statusMenuOpenedOnPointerDownTaskIdsRef = useRef<Set<string>>(new Set());

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
          text: formatBreadcrumbLabel(parent.content)
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

  const baseListTaskCandidates = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    searchQuery: "",
    people,
    channels: channels.map((channel) => ({ ...channel, filterState: "neutral" })),
    channelMatchMode,
    taskPredicate: (task) => task.taskType === "task",
  });

  const sortListTasks = useCallback((taskCandidates: Task[]) => {
    let filtered = filterTasksByDepthMode({
      tasks: taskCandidates,
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
          const statusOrder: Record<TaskStatus, number> = {
            "in-progress": 0,
            "todo": 1,
            "done": 2,
            "closed": 3,
          };
          comparison =
            (statusOrder[a.status || "todo"] ?? 1) - (statusOrder[b.status || "todo"] ?? 1);
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
    focusedTaskId,
    getDepth,
    hasChildren,
    sortContext,
    sortDirection,
    sortField,
    sortVersion,
  ]);
  const listTasks = useMemo(
    () => sortListTasks(filteredTaskCandidates),
    [filteredTaskCandidates, sortListTasks]
  );
  const baseListTasks = useMemo(
    () => sortListTasks(baseListTaskCandidates),
    [baseListTaskCandidates, sortListTasks]
  );
  const scopeModel = useEmptyScopeModel({
    relays,
    channels,
    people,
    searchQuery,
    focusedTaskId,
    allTasks,
  });
  const hasSourceListContent = baseListTasks.length > 0;
  const shouldShowInlineEmptyHint =
    scopeModel.hasActiveFilters && listTasks.length === 0 && hasSourceListContent;
  const shouldShowScopeFooterHint =
    scopeModel.hasSelectedScope && listTasks.length > 0;
  const shouldShowScreenEmptyState = listTasks.length === 0 && !shouldShowInlineEmptyHint;
  const {
    mediaItems,
    activeMediaIndex,
    activeMediaItem,
    activePostMediaIndex,
    activePostMediaCount,
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
    return authPolicy.canModifyContent && !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  };
  const dispatchStatusChange = (taskId: string, status: TaskStatus) => {
    void dispatchFeedInteraction({ type: "task.changeStatus", taskId, status });
  };
  const dispatchToggleComplete = (taskId: string) => {
    void dispatchFeedInteraction({ type: "task.toggleComplete", taskId });
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
    onSelectTask: focusTask,
    onGoBack: () => focusTask(null),
    onFocusSidebar: focusSidebar,
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
      "text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap",
      status === "done" ? "bg-primary/10 text-primary" :
      status === "closed" ? "bg-muted/80 text-muted-foreground" :
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
          ) : status === "done" ? t("listView.status.done") : status === "closed" ? t("listView.status.closed") : t("listView.status.todo")}
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
            ) : status === "done" ? t("listView.status.done") : status === "closed" ? t("listView.status.closed") : t("listView.status.todo")}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem 
            onClick={() => dispatchStatusChange(task.id, "todo")}
            className={cn(status === "todo" && "bg-muted")}
          >
            <Circle className="w-4 h-4 mr-2 text-muted-foreground" />
            {t("listView.status.todo")}
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => dispatchStatusChange(task.id, "in-progress")}
            className={cn(status === "in-progress" && "bg-muted")}
          >
            <CircleDot className="w-4 h-4 mr-2 text-warning" />
            {t("listView.status.inProgress")}
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => dispatchStatusChange(task.id, "done")}
            className={cn(status === "done" && "bg-muted")}
          >
            <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
            {t("listView.status.done")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => dispatchStatusChange(task.id, "closed")}
            className={cn(status === "closed" && "bg-muted")}
          >
            <X className="w-4 h-4 mr-2 text-muted-foreground" />
            {t("listView.status.closed")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // Editable due date cell
  const DueDateCell = ({ task }: { task: Task }) => {
    const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
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
          <TaskDueDateEditorForm
            taskId={task.id}
            dueDate={task.dueDate}
            dueTime={task.dueTime}
            dateType={task.dateType}
            idPrefix="list"
          />
        </PopoverContent>
      </Popover>
    );
  };

  // Editable tags cell
  const TagsCell = ({ task }: { task: Task }) => {
    return (
      <TaskTagChipRow
        task={task}
        expanded={Boolean(expandedChipRows[task.id])}
        maxVisibleTags={2}
        showAllTags={showAllTagsOnWideScreens}
        onToggleExpanded={(expanded) =>
          setExpandedChipRows((prev) => ({ ...prev, [task.id]: expanded }))
        }
      />
    );
  };

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      <SharedViewComposer
        visible={authPolicy.canOpenCompose || effectiveForceShowComposer}
        onSubmit={handleNewTask}
        onCancel={() => {}}
        draftStorageKey={SHARED_COMPOSE_DRAFT_KEY}
        parentId={focusedTaskId || undefined}
        forceExpanded={effectiveForceShowComposer}
        forceExpandSignal={composeGuideActivationSignal}
        composeRestoreRequest={composeRestoreRequest}
        className="relative z-20 border-b border-border px-3 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0"
        defaultContent={buildComposePrefillFromFiltersAndContext(channels, focusedTask?.tags)}
        allowComment={false}
      />

      {/* Table */}
      <div ref={tableContainerRef} className="scrollbar-main-view flex-1 overflow-x-auto">
        <table className="w-full min-w-full table-auto 2xl:table-fixed">
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
              <th className={cn("text-left w-auto min-w-[22rem]", TABLE_CELL_PADDING_CLASS)}>
                <SortButton field="content">
                  <span className="inline-flex items-center gap-1">
                    <ListTodo className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.task")}
                  </span>
                </SortButton>
              </th>
              <th className={cn("hidden 2xl:table-cell text-left 2xl:w-28", TABLE_CELL_PADDING_CLASS)}>
                <SortButton field="status">
                  <span className="inline-flex items-center gap-1">
                    <Activity className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.status")}
                  </span>
                </SortButton>
              </th>
              <th className={cn("text-left w-40 lg:w-44 xl:w-56 2xl:w-[19rem]", TABLE_CELL_PADDING_CLASS)}>
                <SortButton field="dueDate">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.dueDate")}
                  </span>
                </SortButton>
              </th>
              <th className={cn("text-left w-24", TABLE_CELL_PADDING_CLASS)}>
                <SortButton field="priority">
                  <span className="inline-flex items-center gap-1">
                    <Flag className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.priority")}
                  </span>
                </SortButton>
              </th>
              <th className={cn("text-left w-[clamp(8rem,15vw,20rem)] 2xl:w-[clamp(20rem,24vw,30rem)]", TABLE_CELL_PADDING_CLASS)}>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Tags className="w-3 h-3" />
                  {t("tasks.tags")}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shouldShowScreenEmptyState ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <FilteredEmptyState
                    variant="collection"
                    isHydrating={isHydrating}
                    searchQuery={searchQuery}
                    contextTaskTitle={focusedTask?.content}
                    className="py-8"
                  />
                </td>
              </tr>
            ) : (
              <>
                {listTasks.map((task) => {
                const ancestorChain = getAncestorChain(task.id);
                const isKeyboardFocused = keyboardFocusedTaskId === task.id;
                const isLockedUntilStart = isTaskLockedUntilStart(task);
                const contentPreview = getTableContentPreview(task.content);
                
                return (
                  <tr
                    key={task.id}
                    data-task-id={task.id}
                    className={cn(
                      "border-b border-border hover:bg-muted/30 transition-colors",
                      isTaskTerminalStatus(task.status) && "opacity-60",
                      isLockedUntilStart && "opacity-50 grayscale",
                      isKeyboardFocused && "ring-2 ring-primary ring-inset bg-primary/5"
                    )}
                  >
                    <td className="p-2 2xl:p-3 w-10">
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
                            onClick={(event) => {
                              if (!canCompleteTask(task)) return;
                              if (statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id)) {
                                event.stopPropagation();
                                return;
                              }
                              handleTaskStatusToggleClick(event, {
                                status: task.status,
                                hasStatusChangeHandler: canCompleteTask(task),
                                isMenuOpen: Boolean(statusMenuOpenByTaskId[task.id]),
                                openMenu: () => openStatusMenu(task.id),
                                closeMenu: () => closeStatusMenu(task.id),
                                allowMenuOpen: () => allowStatusMenuOpen(task.id),
                                clearMenuOpenIntent: () => clearStatusMenuOpenIntent(task.id),
                                toggleStatus: () => dispatchToggleComplete(task.id),
                                focusTask: () => focusTask(task.id),
                                focusOnQuickToggle: false,
                              });
                            }}
                            onPointerDown={(event) => {
                              if (!canCompleteTask(task)) return;
                              statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id);
                              if (
                                shouldOpenStatusMenuForDirectSelection({
                                  status: task.status,
                                  altKey: event.altKey,
                                  hasStatusChangeHandler: canCompleteTask(task),
                                })
                              ) {
                                event.preventDefault();
                                allowStatusMenuOpen(task.id);
                                statusMenuOpenedOnPointerDownTaskIdsRef.current.add(task.id);
                                openStatusMenu(task.id);
                              }
                            }}
                            disabled={!canCompleteTask(task)}
                            aria-label={t("tasks.actions.setStatus")}
                            title={getStatusButtonTitle(task)}
                            className={cn(
                              "p-0.5 rounded transition-colors",
                              canCompleteTask(task) ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
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
                        {canCompleteTask(task) && (
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                dispatchStatusChange(task.id, "todo");
                              }}
                              className={cn((task.status || "todo") === "todo" && "bg-muted")}
                            >
                              <Circle className="w-4 h-4 mr-2 text-muted-foreground" />
                              {t("listView.status.todo")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                dispatchStatusChange(task.id, "in-progress");
                              }}
                              className={cn(task.status === "in-progress" && "bg-muted")}
                            >
                              <CircleDot className="w-4 h-4 mr-2 text-warning" />
                              {t("listView.status.inProgress")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                dispatchStatusChange(task.id, "done");
                              }}
                              className={cn(task.status === "done" && "bg-muted")}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                              {t("listView.status.done")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                dispatchStatusChange(task.id, "closed");
                              }}
                              className={cn(task.status === "closed" && "bg-muted")}
                            >
                              <X className="w-4 h-4 mr-2 text-muted-foreground" />
                              {t("listView.status.closed")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        )}
                      </DropdownMenu>
                    </td>
                    <td className={cn("w-auto min-w-[22rem]", TABLE_CELL_PADDING_CLASS)}>
                      <div className="space-y-1">
                        {/* Parent context */}
                        {ancestorChain.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
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
                        <div
                          onClick={() => { if (!hasTextSelection()) focusTask(task.id); }}
                          className={cn(
                            `text-sm cursor-pointer whitespace-pre-line line-clamp-2 overflow-hidden ${TASK_INTERACTION_STYLES.hoverText}`,
                            isTaskTerminalStatus(task.status) && "line-through text-muted-foreground"
                          )}
                          title={t("tasks.focusTaskTitle", { type: t("tasks.task").toLowerCase() })}
                        >
                          {contentPreview}
                        </div>
                      </div>
                    </td>
                    <td className={cn("hidden 2xl:table-cell", TABLE_CELL_PADDING_CLASS)}>
                      <StatusCell task={task} />
                    </td>
                    <td className={cn("w-40 lg:w-44 xl:w-56 2xl:w-[19rem]", TABLE_CELL_PADDING_CLASS)}>
                      <DueDateCell task={task} />
                    </td>
                    <td className={cn("w-24", TABLE_CELL_PADDING_CLASS)}>
                      <PriorityCell
                        taskId={task.id}
                        taskContent={task.content}
                        priority={task.priority}
                        editable={canCompleteTask(task)}
                      />
                    </td>
                    <td className={cn("min-w-0 w-[clamp(8rem,15vw,20rem)] 2xl:w-[clamp(20rem,24vw,30rem)]", TABLE_CELL_PADDING_CLASS)}>
                      <TagsCell task={task} />
                    </td>
                  </tr>
                );
              })}
                {shouldShowScopeFooterHint ? (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <FilteredEmptyState
                        variant="collection"
                        isHydrating={isHydrating}
                        searchQuery={searchQuery}
                        contextTaskTitle={focusedTask?.content}
                        mode="footer"
                        className="py-6"
                      />
                    </td>
                  </tr>
                ) : null}
                {shouldShowInlineEmptyHint ? (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <FilteredEmptyState
                        variant="collection"
                        isHydrating={isHydrating}
                        searchQuery={searchQuery}
                        contextTaskTitle={focusedTask?.content}
                        mode="inline"
                        className="py-6"
                      />
                    </td>
                  </tr>
                ) : null}
              </>
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
        onOpenTask={focusTask}
      />

    </main>
  );
}
