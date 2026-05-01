import { memo, useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Calendar, Clock, ArrowUpDown, RotateCcw, ListTodo, Activity, Flag, Tags } from "lucide-react";
import { TaskStateIcon, TaskStateDefIcon, getTaskStateBadgeClasses } from "@/components/tasks/task-state-ui";
import { getTaskStateRegistry, resolveTaskStateFromStatus, toTaskStatusFromStateDefinition } from "@/domain/task-states/task-state-config";
import { getTaskStatusType, type Task, type ComposeRestoreRequest, type TaskStatusType } from "@/types";
import type { Person } from "@/types/person";
import { SharedViewComposer } from "./SharedViewComposer";
import { TaskMentionTagChipRow } from "./TaskTagChipRow";
import { ListTaskRow } from "./list/ListTaskRow";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { sortTasks, buildChildrenMap, SortContext, getDueDateColorClass } from "@/domain/content/task-sorting";
import { evaluateTaskPriorities } from "@/domain/content/task-priority-evaluation";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import type { DisplayDepthMode } from "@/features/feed-page/interactions/feed-interaction-intent";
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
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { ScopeFooterHint } from "@/components/tasks/ScopeFooterHint";
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
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";

interface ListViewProps {
  tasks: Task[];
  allTasks: Task[];
  currentUser?: Person;
  focusedTaskId: string | null;
  searchQueryOverride?: string;
  composeRestoreRequest?: ComposeRestoreRequest | null;
  depthMode?: DisplayDepthMode;
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
// columns: status toggle | task | status | due date | priority | tags
const LIST_GRID_BASE_CLASS =
  "grid-cols-[2.5rem_minmax(0,1fr)_fit-content(7.5rem)_5.5rem_minmax(0,1fr)]";
const LIST_GRID_LG_CLASS =
  "lg:grid-cols-[2.5rem_minmax(0,1fr)_fit-content(8.5rem)_6rem_minmax(0,1fr)]";
const LIST_GRID_XL_CLASS =
  "xl:grid-cols-[2.5rem_minmax(0,3fr)_fit-content(10.75rem)_6.5rem_minmax(0,2fr)]";
const LIST_GRID_2XL_CLASS =
  "2xl:grid-cols-[2.5rem_minmax(0,2fr)_fit-content(8.75rem)_minmax(0,1fr)_8.5rem_minmax(0,1fr)]";
const LIST_GRID_TEMPLATE_CLASS = `grid ${LIST_GRID_BASE_CLASS} ${LIST_GRID_LG_CLASS} ${LIST_GRID_XL_CLASS} ${LIST_GRID_2XL_CLASS}`;
const LIST_SUBGRID_ROW_CLASS = "col-span-full grid grid-cols-subgrid";

interface PriorityCellProps {
  taskId: string;
  taskContent: string;
  priority?: number;
  editable: boolean;
}

function getTableContentPreview(content: string): string {
  return formatBreadcrumbLabel(content);
}

const PriorityCell = memo(function PriorityCell({
  taskId,
  taskContent,
  priority,
  editable,
}: PriorityCellProps) {
  const hasPriority = typeof priority === "number";
  return (
    <TaskPrioritySelect
      taskId={editable ? taskId : undefined}
      priority={priority}
      compactLabel={false}
      className={cn(
        "h-7 rounded-md border-none bg-transparent px-2 text-xs shadow-none transition-colors hover:bg-muted/60 focus:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent",
        hasPriority ? "text-foreground" : "text-muted-foreground"
      )}
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
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { authPolicy, focusSidebar, focusTask } = useTaskViewServices();
  const { channels, people } = useFeedSurfaceState();
  const interactionModel = useFeedViewInteractionModel();
  const effectiveForceShowComposer = forceShowComposer ?? interactionModel.forceShowComposer;
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
  const priorityScores = useMemo(() => evaluateTaskPriorities(allTasks), [allTasks]);
  
  const sortContext: SortContext = useMemo(() => {
    const childrenMap = buildChildrenMap(allTasks);
    sortContextRef.current = {
      childrenMap,
      allTasks,
      taskById: taskLookup,
      priorityScores,
    };
    return sortContextRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortVersion, priorityScores, taskLookup]);

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
          const statusOrder: Record<TaskStatusType, number> = {
            "active": 0,
            "open": 1,
            "done": 2,
            "closed": 3,
          };
          comparison =
            (statusOrder[getTaskStatusType(a.status)] ?? 1) - (statusOrder[getTaskStatusType(b.status)] ?? 1);
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
  const dispatchStatusChange = (taskId: string, stateId: string) => {
    const state = getTaskStateRegistry().find((entry) => entry.id === stateId);
    if (!state) return;
    void dispatchFeedInteraction({ type: "task.changeStatus", taskId, status: toTaskStatusFromStateDefinition(state) });
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
    const status = task.status;
    const editable = canCompleteTask(task);
    const statusClassName = cn(
      "text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap",
      getTaskStateBadgeClasses(getTaskStatusType(status))
    );

    const stateDef = resolveTaskStateFromStatus(status);
    const statusLabel = stateDef.label;

    if (!editable) {
      // When the user isn't signed in, render the cell normally — the row is
      // still non-interactive but shouldn't draw extra attention to that fact.
      // Only show the muted/locked treatment when signed-in users hit a
      // task-specific restriction (e.g. owned by someone else).
      const showLockedTreatment = authPolicy.isSignedIn;
      return (
        <span className={cn(statusClassName, showLockedTreatment && "opacity-60 cursor-not-allowed")}>
          {statusLabel}
        </span>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(statusClassName, "cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all")}>
            {statusLabel}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {getTaskStateRegistry().map((state) => (
            <DropdownMenuItem
              key={state.id}
              onClick={() => dispatchStatusChange(task.id, state.id)}
              className={cn(stateDef.id === state.id && "bg-muted")}
            >
              <TaskStateDefIcon state={state} className="mr-2" />
              {state.label}
            </DropdownMenuItem>
          ))}
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
          editable
            ? "cursor-pointer hover:bg-muted/50"
            : authPolicy.isSignedIn
              ? "cursor-not-allowed opacity-60"
              : "cursor-default"
        )}
      >
        {task.dueDate ? (
          <>
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline uppercase tracking-wide">
              {t(`tasks.dates.${task.dateType || "due"}`)}
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
      <TaskMentionTagChipRow
        task={task}
        className="min-w-0"
      />
    );
  };

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      {(authPolicy.canOpenCompose || effectiveForceShowComposer) && (
        <SharedViewComposer
          onCancel={() => {}}
          focusedTaskId={focusedTaskId}
          forceExpanded={effectiveForceShowComposer}
          forceExpandSignal={composeGuideActivationSignal}
          composeRestoreRequest={composeRestoreRequest}
          className="relative z-20 border-b border-border px-3 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0"
          defaultContent={composerDefaultContent}
          allowComment={false}
        />
      )}

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
                        editable={editable && !isTaskTerminalStatus(task.status)}
                      />
                    )}
                    renderTagsCell={(task) => <TagsCell task={task} />}
                  />
                );
              })}
              {shouldShowScopeFooterHint ? (
                <div className="col-span-full p-0">
                  <ScopeFooterHint />
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
