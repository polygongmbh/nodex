import { memo, useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Circle, CircleDot, CheckCircle2, Calendar, Clock, ArrowUpDown, RotateCcw, ListTodo, Activity, Flag, Tags, X } from "lucide-react";
import {
  Task,
  Person,
  ComposeRestoreRequest,
  TaskStatus,
} from "@/types";
import { SharedViewComposer } from "./SharedViewComposer";
import { TaskTagChipRow } from "./TaskTagChipRow";
import { ListTaskRow } from "./list/ListTaskRow";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { sortTasks, buildChildrenMap, SortContext, getDueDateColorClass } from "@/domain/content/task-sorting";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import type { KanbanDepthMode } from "./DesktopSearchDock";
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
import { FilteredEmptyState } from "@/components/tasks/FilteredEmptyState";
import { TaskDueDateEditorForm, TaskPrioritySelect } from "./TaskMetadataEditors";
import { useFeedViewInteractionModel } from "@/features/feed-page/interactions/feed-view-interaction-context";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import {
  getAncestorChainFromSource,
  useListViewState,
} from "@/features/feed-page/controllers/use-task-view-states";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { TaskViewMediaLightbox, useTaskViewMedia } from "./task-view-media";
import { useTaskViewServices } from "./use-task-view-services";

interface ListViewProps {
  tasks: Task[];
  allTasks: Task[];
  currentUser?: Person;
  focusedTaskId?: string | null;
  searchQueryOverride?: string;
  composeRestoreRequest?: ComposeRestoreRequest | null;
  depthMode?: KanbanDepthMode;
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  isInteractionBlocked?: boolean;
  isHydrating?: boolean;
}

type SortField = "priority" | "content" | "status" | "dueDate" | "timestamp";
type SortDirection = "asc" | "desc";
const TABLE_CELL_PADDING_CLASS = "px-3 py-2";
const LIST_HEADER_CELL_CLASS = `${TABLE_CELL_PADDING_CLASS} min-w-0`;
const LIST_BODY_CELL_CLASS = `${TABLE_CELL_PADDING_CLASS} min-w-0`;
const LIST_GRID_TEMPLATE_CLASS =
  "grid grid-cols-[2.5rem_minmax(0,1fr)_fit-content(7.5rem)_6rem_fit-content(11.5rem)] lg:grid-cols-[2.5rem_minmax(0,1fr)_fit-content(8.5rem)_6.5rem_fit-content(12.5rem)] xl:grid-cols-[2.5rem_minmax(0,1fr)_fit-content(10.75rem)_7.25rem_fit-content(23.25rem)] 2xl:grid-cols-[2.5rem_minmax(0,1fr)_fit-content(9.5rem)_fit-content(16.5rem)_9rem_fit-content(38rem)]";
const LIST_SUBGRID_ROW_CLASS = "col-span-full grid grid-cols-subgrid";

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
      className="h-7 w-full min-w-0 max-w-full rounded-md border-none bg-transparent px-2 text-xs text-foreground shadow-none focus:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
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
  currentUser,
  searchQueryOverride,
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
  const { authPolicy, focusSidebar, focusTask } = useTaskViewServices();
  const { channels, people } = useFeedSurfaceState();
  const interactionModel = useFeedViewInteractionModel();
  const effectiveForceShowComposer = forceShowComposer ?? interactionModel.forceShowComposer;
  const SHARED_COMPOSE_DRAFT_KEY = COMPOSE_DRAFT_STORAGE_KEY;
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  
  // Track sort version - incremented on view/filter changes, not status changes
  const [sortVersion, setSortVersion] = useState(0);
  const {
    searchQuery,
    focusedTask,
    filteredTaskCandidates,
    hasSelectedScope,
    composerDefaultContent,
  } = useListViewState({
    tasks,
    allTasks,
    focusedTaskId,
    searchQueryOverride,
    depthMode,
  });
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

  // Build children map for sorting context - memoize based on sortVersion to prevent re-sorting on status changes
  const sortContextRef = useRef<SortContext | null>(null);
  const taskLookup = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  
  const sortContext: SortContext = useMemo(() => {
    const childrenMap = buildChildrenMap(allTasks);
    sortContextRef.current = {
      childrenMap,
      allTasks,
      taskById: taskLookup,
    };
    return sortContextRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortVersion, taskLookup]);

  const hasChildren = useCallback((taskId: string): boolean => {
    return allTasks.some((task) => task.taskType === "task" && task.parentId === taskId);
  }, [allTasks]);

  const getDepth = useCallback((taskId: string): number => {
    const task = taskLookup.get(taskId);
    if (!task?.parentId) return 1;
    return 1 + getDepth(task.parentId);
  }, [taskLookup]);

  const getAncestorChain = useCallback((taskId: string): { id: string; text: string }[] => {
    return getAncestorChainFromSource({ taskById: taskLookup }, taskId, focusedTaskId);
  }, [focusedTaskId, taskLookup]);

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
  const shouldShowScopeFooterHint = hasSelectedScope && listTasks.length > 0;
  const mediaController = useTaskViewMedia(listTasks);

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

  const canCompleteTask = (task: Task) => {
    return authPolicy.canModifyContent && !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  };
  const dispatchStatusChange = (taskId: string, status: TaskStatus) => {
    void dispatchFeedInteraction({ type: "task.changeStatus", taskId, status });
  };
  const dispatchToggleComplete = (taskId: string) => {
    void dispatchFeedInteraction({ type: "task.toggleComplete", taskId });
  };
  const getStatusToggleHint = () => t("tasks.actions.setStatus");

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
          "flex w-full min-w-0 items-center gap-1.5 overflow-hidden px-2 py-1 text-sm rounded transition-colors",
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
            <span className="truncate">{format(task.dueDate, "MMM d, yyyy")}</span>
            {task.dueTime && (
              <span className="hidden 2xl:inline-flex shrink-0 items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{task.dueTime}</span>
              </span>
            )}
          </>
        ) : (
          <span className="truncate text-muted-foreground">{t("listView.dates.setDate")}</span>
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
        layout="scroll"
        className="min-w-0"
      />
    );
  };

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      <SharedViewComposer
        visible={authPolicy.canOpenCompose || effectiveForceShowComposer}
        onCancel={() => {}}
        draftStorageKey={SHARED_COMPOSE_DRAFT_KEY}
        parentId={focusedTaskId || undefined}
        forceExpanded={effectiveForceShowComposer}
        forceExpandSignal={composeGuideActivationSignal}
        composeRestoreRequest={composeRestoreRequest}
        className="relative z-20 border-b border-border px-3 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0"
        defaultContent={composerDefaultContent}
        allowComment={false}
      />

      {/* Table */}
      <div ref={tableContainerRef} className="scrollbar-main-view flex-1 overflow-x-auto">
        <div
          role="table"
          aria-label={t("listView.sort.task")}
          className={cn("min-w-full", LIST_GRID_TEMPLATE_CLASS)}
        >
          <div role="rowgroup" className="contents">
            <div
              role="row"
              className={cn(
                LIST_SUBGRID_ROW_CLASS,
                "sticky top-0 z-10 items-center border-b border-border bg-background"
              )}
            >
              <div role="columnheader" className="min-w-0 px-2 py-2 2xl:px-3">
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
              </div>
              <div role="columnheader" className={cn(LIST_HEADER_CELL_CLASS, "text-left")}>
                <SortButton field="content">
                  <span className="inline-flex items-center gap-1">
                    <ListTodo className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.task")}
                  </span>
                </SortButton>
              </div>
              <div role="columnheader" className={cn(LIST_HEADER_CELL_CLASS, "hidden 2xl:flex items-center text-left")}>
                <SortButton field="status">
                  <span className="inline-flex items-center gap-1">
                    <Activity className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.status")}
                  </span>
                </SortButton>
              </div>
              <div role="columnheader" className={cn(LIST_HEADER_CELL_CLASS, "text-left")}>
                <SortButton field="dueDate">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.dueDate")}
                  </span>
                </SortButton>
              </div>
              <div role="columnheader" className={cn(LIST_HEADER_CELL_CLASS, "text-left")}>
                <SortButton field="priority">
                  <span className="inline-flex items-center gap-1">
                    <Flag className="w-3 h-3 text-muted-foreground" />
                    {t("listView.sort.priority")}
                  </span>
                </SortButton>
              </div>
              <div role="columnheader" className={cn(LIST_HEADER_CELL_CLASS, "text-left")}>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Tags className="w-3 h-3" />
                  {t("tasks.tags")}
                </span>
              </div>
            </div>
          </div>
          <div role="rowgroup" className="contents">
            <>
              {listTasks.map((task) => {
                const ancestorChain = getAncestorChain(task.id);
                const isKeyboardFocused = keyboardFocusedTaskId === task.id;
                const contentPreview = getTableContentPreview(task.content);
                
                return (
                  <ListTaskRow
                    key={task.id}
                    task={task}
                    currentUser={currentUser}
                    people={people}
                    ancestorChain={ancestorChain}
                    isKeyboardFocused={isKeyboardFocused}
                    isInteractionBlocked={isInteractionBlocked}
                    getStatusToggleHint={getStatusToggleHint}
                    rowClassName={LIST_SUBGRID_ROW_CLASS}
                    bodyCellClassName={LIST_BODY_CELL_CLASS}
                    contentPreview={contentPreview}
                    renderStatusCell={(task) => <StatusCell task={task} />}
                    renderDueDateCell={(task) => <DueDateCell task={task} />}
                    renderPriorityCell={(task, editable) => (
                      <PriorityCell
                        taskId={task.id}
                        taskContent={task.content}
                        priority={task.priority}
                        editable={editable}
                      />
                    )}
                    renderTagsCell={(task) => <TagsCell task={task} />}
                  />
                );
              })}
              {shouldShowScopeFooterHint ? (
                <div className="col-span-full p-0">
                    <FilteredEmptyState
                      isHydrating={isHydrating}
                      searchQuery={searchQuery}
                      contextTaskTitle={focusedTask?.content}
                      mode="footer"
                      className="py-6"
                    />
                </div>
              ) : null}
            </>
          </div>
        </div>
      </div>
      <TaskViewMediaLightbox controller={mediaController} onOpenTask={focusTask} />

    </main>
  );
}
