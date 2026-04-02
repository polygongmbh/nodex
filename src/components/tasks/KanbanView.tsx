import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Plus, X, Circle, CircleDot, CheckCircle2, Calendar, Clock, Layers, Lock } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import {
  Task,
  Person,
  TaskInitialStatus,
  TaskStatus,
  ComposeRestoreRequest,
} from "@/types";
import { TaskCreateComposer } from "./TaskCreateComposer";
import { linkifyContent } from "@/lib/linkify";
import { TaskTagChipRow } from "./TaskTagChipRow";
import { hasTaskMentionChips } from "./TaskMentionChips";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getDueDateColorClass } from "@/domain/content/task-sorting";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import { sortByLatestModified } from "@/lib/kanban-sorting";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { hasTextSelection } from "@/lib/click-intent";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
import type { KanbanDepthMode } from "./DesktopSearchDock";
import { useTranslation } from "react-i18next";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useKanbanViewState } from "@/features/feed-page/controllers/use-task-view-states";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useTaskViewServices } from "./use-task-view-services";
import { TaskPrioritySelect } from "./TaskMetadataEditors";

interface KanbanViewProps {
  tasks: Task[];
  allTasks: Task[];
  currentUser?: Person;
  focusedTaskId?: string | null;
  searchQueryOverride?: string;
  composeRestoreRequest?: ComposeRestoreRequest | null;
  depthMode: KanbanDepthMode;
  compactTaskCardsEnabled?: boolean;
  isPendingPublishTask?: (taskId: string) => boolean;
  isInteractionBlocked?: boolean;
  isHydrating?: boolean;
}

const getColumns = (t: (key: string) => string): { id: TaskStatus; label: string; icon: React.ReactNode; color: string }[] => [
  { id: "todo", label: t("listView.status.todo"), icon: <Circle className="w-4 h-4" />, color: "text-muted-foreground" },
  { id: "in-progress", label: t("listView.status.inProgress"), icon: <CircleDot className="w-4 h-4" />, color: "text-warning" },
  { id: "done", label: t("listView.status.done"), icon: <CheckCircle2 className="w-4 h-4" />, color: "text-primary" },
  { id: "closed", label: t("listView.status.closed"), icon: <X className="w-4 h-4" />, color: "text-muted-foreground" },
];

export function KanbanView({
  tasks,
  allTasks,
  currentUser,
  searchQueryOverride,
  depthMode,
  focusedTaskId,
  compactTaskCardsEnabled = false,
  isPendingPublishTask,
  composeRestoreRequest = null,
  isInteractionBlocked = false,
}: KanbanViewProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { authPolicy, guardModify, focusSidebar, focusTask } = useTaskViewServices();
  const { people } = useFeedSurfaceState();
  const columns = useMemo(() => getColumns((key) => t(key)), [t]);
  const [composingColumn, setComposingColumn] = useState<TaskInitialStatus | null>(null);
  const [expandedChipRows, setExpandedChipRows] = useState<Record<string, boolean>>({});
  const [optimisticStatusByTaskId, setOptimisticStatusByTaskId] = useState<Record<string, TaskStatus>>({});
  const { kanbanTasks, getAncestorChain, showContext } = useKanbanViewState({
    tasks,
    allTasks,
    focusedTaskId,
    searchQueryOverride,
    depthMode,
  });

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      "todo": [],
      "in-progress": [],
      "done": [],
      "closed": [],
    };
    
    kanbanTasks.forEach(task => {
      const status = optimisticStatusByTaskId[task.id] || task.status || "todo";
      grouped[status].push(task);
    });

    // Active columns retain the filtered order from the shared state hook.
    grouped["done"] = sortByLatestModified(grouped["done"]);
    grouped["closed"] = sortByLatestModified(grouped["closed"]);

    return grouped;
  }, [kanbanTasks, optimisticStatusByTaskId]);
  const canonicalStatusByTaskId = useMemo(() => {
    const map = new Map<string, TaskStatus>();
    for (const task of kanbanTasks) {
      map.set(task.id, task.status || "todo");
    }
    return map;
  }, [kanbanTasks]);

  useEffect(() => {
    setOptimisticStatusByTaskId((previous) => {
      const next: Record<string, TaskStatus> = {};
      let changed = false;
      for (const [taskId, status] of Object.entries(previous)) {
        const canonicalStatus = canonicalStatusByTaskId.get(taskId);
        if (!canonicalStatus) {
          changed = true;
          continue;
        }
        if (canonicalStatus === status) {
          changed = true;
          continue;
        }
        next[taskId] = status;
      }
      return changed ? next : previous;
    });
  }, [canonicalStatusByTaskId]);
  const getTaskEffectiveStatus = useCallback(
    (task: Task): TaskStatus => optimisticStatusByTaskId[task.id] || task.status || "todo",
    [optimisticStatusByTaskId]
  );
  const hasChildren = useCallback(
    (taskId: string): boolean => allTasks.some((task) => task.taskType === "task" && task.parentId === taskId),
    [allTasks]
  );
  const dispatchStatusChange = useCallback(
    (taskId: string, newStatus: TaskStatus) => {
      void dispatchFeedInteraction({ type: "task.changeStatus", taskId, status: newStatus });
    },
    [dispatchFeedInteraction]
  );
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (isInteractionBlocked) {
      guardModify();
      return;
    }
    
    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId as TaskStatus;
    const task = kanbanTasks.find((item) => item.id === taskId);
    if (!task || !canUserChangeTaskStatus(task, currentUser)) return;
    const currentStatus = getTaskEffectiveStatus(task);
    if (newStatus === currentStatus) return;

    setOptimisticStatusByTaskId((previous) => ({ ...previous, [taskId]: newStatus }));
    
    dispatchStatusChange(taskId, newStatus);
  };

  // Flatten all visible task IDs for keyboard navigation (across all columns)
  const allVisibleTaskIds = useMemo(() => {
    return [
      ...tasksByStatus["todo"],
      ...tasksByStatus["in-progress"],
      ...tasksByStatus["done"],
      ...tasksByStatus["closed"],
    ].map((task) => task.id);
  }, [tasksByStatus]);

  // Column-aware task IDs for Kanban navigation
  const columnTaskIds = useMemo(() => [
    tasksByStatus["todo"].map(t => t.id),
    tasksByStatus["in-progress"].map(t => t.id),
    tasksByStatus["done"].map(t => t.id),
    tasksByStatus["closed"].map(t => t.id),
  ], [tasksByStatus]);

  // Track keyboard focus state
  const [keyboardFocusedTaskId, setKeyboardFocusedTaskId] = useState<string | null>(null);
  const keyboardFocusedTaskIdRef = useRef<string | null>(null);
  const pendingRefocusRef = useRef<string | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    keyboardFocusedTaskIdRef.current = keyboardFocusedTaskId;
  }, [keyboardFocusedTaskId]);

  // Handle moving task left (to previous column) - preserves focus
  const handleMoveLeft = () => {
    if (isInteractionBlocked) {
      guardModify();
      return;
    }
    const focusedId = keyboardFocusedTaskIdRef.current;
    if (!focusedId) return;
    const task = kanbanTasks.find(t => t.id === focusedId);
    if (!task) return;
    if (!canUserChangeTaskStatus(task, currentUser)) return;
    
    const currentStatus = getTaskEffectiveStatus(task);
    let newStatus: TaskStatus;
    
    if (currentStatus === "closed") newStatus = "done";
    else if (currentStatus === "done") newStatus = "in-progress";
    else if (currentStatus === "in-progress") newStatus = "todo";
    else return; // Already at leftmost
    
    pendingRefocusRef.current = focusedId;
    dispatchStatusChange(focusedId, newStatus);
  };

  // Handle moving task right (to next column) - preserves focus
  const handleMoveRight = () => {
    if (isInteractionBlocked) {
      guardModify();
      return;
    }
    const focusedId = keyboardFocusedTaskIdRef.current;
    if (!focusedId) return;
    const task = kanbanTasks.find(t => t.id === focusedId);
    if (!task) return;
    if (!canUserChangeTaskStatus(task, currentUser)) return;
    
    const currentStatus = getTaskEffectiveStatus(task);
    let newStatus: TaskStatus;
    
    if (currentStatus === "todo") newStatus = "in-progress";
    else if (currentStatus === "in-progress") newStatus = "done";
    else if (currentStatus === "done") newStatus = "closed";
    else return; // Already at rightmost
    
    pendingRefocusRef.current = focusedId;
    dispatchStatusChange(focusedId, newStatus);
  };

  // Keyboard navigation - Kanban mode: arrows navigate, Shift+arrows/HJKL move tasks
  const { focusedTaskId: navFocusedTaskId, setFocusByTaskId } = useTaskNavigation({
    taskIds: allVisibleTaskIds,
    onSelectTask: focusTask,
    onMoveLeft: handleMoveLeft,
    onMoveRight: handleMoveRight,
    onFocusSidebar: focusSidebar,
    enabled: composingColumn === null,
    kanbanMode: true,
    columnTaskIds,
  });

  // Sync navigation focus with local state
  useEffect(() => {
    setKeyboardFocusedTaskId(navFocusedTaskId);
  }, [navFocusedTaskId]);

  // After tasksByStatus updates, re-apply focus if we have a pending refocus
  useEffect(() => {
    if (pendingRefocusRef.current) {
      const taskIdToFocus = pendingRefocusRef.current;
      pendingRefocusRef.current = null;
      // Use requestAnimationFrame to ensure the state has fully updated
      requestAnimationFrame(() => {
        setFocusByTaskId(taskIdToFocus);
      });
    }
  }, [tasksByStatus, setFocusByTaskId]);

  // Scroll focused task into view
  const columnsContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (keyboardFocusedTaskId && columnsContainerRef.current) {
      const element = columnsContainerRef.current.querySelector(
        `[data-task-id="${keyboardFocusedTaskId}"]`
      );
      if (element) {
        element.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [keyboardFocusedTaskId]);
  
  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Kanban Columns */}
      <div
        ref={columnsContainerRef}
        className="scrollbar-auto relative flex-1 overflow-x-auto overflow-y-hidden px-4 pt-4"
        data-onboarding="kanban-board"
      >
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full min-w-max" data-onboarding="kanban-columns">
            {columns.map((column) => (
              <div
                key={column.id}
                className="flex flex-col w-80 xl:w-[24rem] 2xl:w-[28rem] bg-muted/30 rounded-lg flex-shrink-0"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={column.color}>{column.icon}</span>
                    <span className="font-medium">{column.label}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {tasksByStatus[column.id].length}
                    </span>
                  </div>
                  {authPolicy.canOpenCompose && !isInteractionBlocked && column.id !== "closed" && (
                    <button
                      onClick={() => setComposingColumn(column.id as TaskInitialStatus)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      data-onboarding="kanban-add-task"
                    >
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                </div>

                {/* Task Composer */}
                {composingColumn === column.id && (
                  <div className="p-3 border-b border-border bg-card/50 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{t("kanban.newTaskIn", { column: column.label })}</span>
                      <button
                        onClick={() => setComposingColumn(null)}
                        className="p-0.5 rounded hover:bg-muted"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                      <TaskCreateComposer
                        onCancel={() => setComposingColumn(null)}
                        compact
                        parentId={focusedTaskId || undefined}
                        initialStatus={composingColumn || undefined}
                        closeOnSuccess
                        allowComment={false}
                        composeRestoreRequest={composeRestoreRequest}
                      />
                  </div>
                )}

                {/* Column Content - Droppable */}
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      className={cn(
                        "flex-1 min-h-0 overflow-x-hidden overflow-y-auto p-2",
                        snapshot.isDraggingOver && "bg-primary/5"
                      )}
                    >
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="flex h-full min-h-full min-w-0 flex-col gap-2"
                      >
                        {tasksByStatus[column.id].map((task, index) => {
                          const ancestorChain =
                            !compactTaskCardsEnabled && showContext ? getAncestorChain(task.id) : [];
                          const displayStatus = getTaskEffectiveStatus(task);
                          const dueDateColor = getDueDateColorClass(task.dueDate, displayStatus);
                          const isKeyboardFocused = keyboardFocusedTaskId === task.id;
                          const isLockedUntilStart = isTaskLockedUntilStart(task);
                          const canChangeStatus = !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
                          const isPendingPublish = Boolean(isPendingPublishTask?.(task.id));
                          const hasMetadataChips =
                            !compactTaskCardsEnabled &&
                            (hasTaskMentionChips(task) || task.tags.length > 0);
                          
                          return (
                            <Draggable
                              key={task.id}
                              draggableId={task.id}
                              index={index}
                              isDragDisabled={!canChangeStatus}
                              disableInteractiveElementBlocking={canChangeStatus}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  data-task-id={task.id}
                                  onClick={() => {
                                    if (!hasTextSelection() && hasChildren(task.id)) {
                                      focusTask(task.id);
                                    }
                                  }}
                                  className={cn(
                                    `relative min-w-0 bg-card border border-border rounded-lg p-3 shadow-sm transition-shadow cursor-pointer ${TASK_INTERACTION_STYLES.cardSurface}`,
                                    snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : "",
                                    !canChangeStatus && "border-dashed border-muted-foreground/60 bg-muted/40",
                                    isTaskTerminalStatus(displayStatus) && "opacity-70",
                                    isLockedUntilStart && "opacity-50 grayscale",
                                    isKeyboardFocused && !snapshot.isDragging && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                                  )}
                                >
                                  {!canChangeStatus && (
                                    <div
                                      className="absolute right-2 top-2 rounded-full bg-muted/80 p-1 text-muted-foreground"
                                      title={t("tasks.readOnly")}
                                      aria-label={t("tasks.readOnly")}
                                    >
                                      <Lock className="h-3 w-3" />
                                    </div>
                                  )}

                                  {/* Parent chain for context */}
                                  {ancestorChain.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground mb-2">
                                        {ancestorChain.map((ancestor, i) => (
                                        <span key={ancestor.id} className="flex max-w-[50%] items-center gap-1">
                                          {i > 0 && <span className="text-muted-foreground/50">›</span>}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
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

                                  {/* Content */}
                                  <div className="flex items-start gap-2">
                                    <div
                                      className={cn(
                                        `min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-line line-clamp-2 overflow-hidden ${TASK_INTERACTION_STYLES.hoverText}`,
                                        isTaskTerminalStatus(displayStatus) && "line-through text-muted-foreground"
                                      )}
                                    >
                                      {linkifyContent(task.content, (tag) => {
                                        void dispatchFeedInteraction({ type: "filter.applyHashtagExclusive", tag });
                                      }, {
                                        plainHashtags: isTaskTerminalStatus(displayStatus),
                                        people,
                                        disableStandaloneEmbeds: true,
                                      })}
                                    </div>
                                    {typeof task.priority === "number" && (
                                      <TaskPrioritySelect
                                        id={`kanban-priority-${task.id}`}
                                        taskId={task.id}
                                        priority={task.priority}
                                        ariaLabel={t("composer.labels.priority")}
                                        disabled={!canChangeStatus}
                                        stopPropagation
                                        className={cn(
                                          "ml-auto h-6 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning focus:outline-none",
                                          canChangeStatus && "cursor-pointer hover:bg-warning/20",
                                          !canChangeStatus && "cursor-not-allowed opacity-60"
                                        )}
                                      />
                                    )}
                                  </div>
                                  {/* Due date with color coding */}
                                  {task.dueDate && (
                                    <div
                                      className={cn("flex items-center gap-1.5 text-xs mt-2", dueDateColor)}
                                      data-testid={`kanban-due-row-${task.id}`}
                                    >
                                      <Calendar className="w-3 h-3" />
                                      <span className="uppercase tracking-wide">{getTaskDateTypeLabel(task.dateType)}</span>
                                      <span>{format(task.dueDate, "MMM d")}</span>
                                      {task.dueTime && (
                                        <>
                                          <Clock className="w-3 h-3" />
                                          <span>{task.dueTime}</span>
                                        </>
                                      )}
                                    </div>
                                  )}
                                  {hasMetadataChips && (
                                    <TaskTagChipRow
                                      task={task}
                                      expanded={Boolean(expandedChipRows[task.id])}
                                      onToggleExpanded={(expanded) =>
                                        setExpandedChipRows((prev) => ({ ...prev, [task.id]: expanded }))
                                      }
                                      className="mt-2"
                                      showEmptyPlaceholder={false}
                                      testId={`kanban-chip-row-${task.id}`}
                                    />
                                  )}
                                  {isPendingPublish && (
                                    <div className="mt-2">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void dispatchFeedInteraction({ type: "task.undoPendingPublish", taskId: task.id });
                                        }}
                                        className="text-xs font-medium text-warning hover:text-warning/80"
                                        title={t("toasts.actions.undo")}
                                      >
                                        {t("toasts.actions.undo")}
                                      </button>
                                    </div>
                                  )}
                                  {/* Children indicator */}
                                  {!compactTaskCardsEnabled && hasChildren(task.id) && (
                                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                                      <Layers className="w-3 h-3" />
                                      <span>{t("kanban.hasSubtasks")}</span>
                                    </div>
                                  )}

                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {tasksByStatus[column.id].length === 0 && <div className="flex-1 min-h-[96px]" aria-hidden="true" />}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      </div>
    </main>
  );
}
