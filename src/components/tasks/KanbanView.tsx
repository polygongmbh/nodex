import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { Plus, X } from "lucide-react";
import { TaskStateDefIcon, getTaskStateToneClass } from "@/components/tasks/task-state-ui";
import {
  getTaskStateRegistry,
  resolveTaskStateFromStatus,
  toTaskStatusFromStateDefinition,
  type TaskStateDefinition,
} from "@/domain/task-states/task-state-config";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { getTaskStatusType, normalizeTaskStatus, type Task, type TaskStatus, type ComposeRestoreRequest } from "@/types";
import type { Person } from "@/types/person";
import { TaskCreateComposer } from "./TaskCreateComposer";
import { KanbanTaskCard } from "./kanban/KanbanTaskCard";
import { cn } from "@/lib/utils";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import type { DisplayDepthMode } from "@/features/feed-page/interactions/feed-interaction-intent";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { sortKanbanColumnTasks, useKanbanViewState } from "@/features/feed-page/controllers/use-task-view-states";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useTaskViewServices } from "./use-task-view-services";
import { buildChildrenMap, type SortContext } from "@/domain/content/task-sorting";
import { evaluateTaskPriorities } from "@/domain/content/task-priority-evaluation";

interface KanbanViewProps {
  tasks: Task[];
  allTasks: Task[];
  currentUser?: Person;
  focusedTaskId: string | null;
  searchQueryOverride?: string;
  composeRestoreRequest?: ComposeRestoreRequest | null;
  depthMode: DisplayDepthMode;
  isPendingPublishTask?: (taskId: string) => boolean;
  isInteractionBlocked?: boolean;
  isHydrating?: boolean;
}

interface KanbanColumn {
  id: string;
  label: string;
  state: TaskStateDefinition;
  color: string;
}

function getColumns(tasks: Task[]): KanbanColumn[] {
  const registry = getTaskStateRegistry();
  const columns: KanbanColumn[] = [];
  const seen = new Set<string>();

  for (const state of registry.filter((entry) => entry.visibleByDefault)) {
    seen.add(state.id);
    columns.push({
      id: state.id,
      label: state.label,
      state,
      color: getTaskStateToneClass(state.type),
    });
  }

  for (const task of tasks) {
    const resolvedState = resolveTaskStateFromStatus(task.status, registry);
    if (seen.has(resolvedState.id)) continue;
    seen.add(resolvedState.id);
    columns.push({
      id: resolvedState.id,
      label: resolvedState.label,
      state: resolvedState,
      color: getTaskStateToneClass(resolvedState.type),
    });
  }

  return columns;
}

// Sub-components using @dnd-kit hooks — must be separate components so hooks run per instance

interface DroppableColumnContentProps {
  id: string;
  isDraggingOver: boolean;
  children: React.ReactNode;
  className?: string;
}

function DroppableColumnContent({ id, children, className }: DroppableColumnContentProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-droppable-id={id}
      className={cn(className, isOver && "bg-primary/5")}
    >
      {children}
    </div>
  );
}

interface DraggableCardWrapperProps {
  id: string;
  disabled: boolean;
  isActiveOverlay?: boolean;
  children: React.ReactNode;
}

function DraggableCardWrapper({ id, disabled, isActiveOverlay, children }: DraggableCardWrapperProps) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-draggable-id={id}
      data-dnd-handle="true"
      className={cn(
        isDragging && !isActiveOverlay && "opacity-40",
        isDragging && !isActiveOverlay && "shadow-lg ring-2 ring-primary/20"
      )}
    >
      {children}
    </div>
  );
}

export function KanbanView({
  tasks,
  allTasks,
  currentUser,
  searchQueryOverride,
  depthMode,
  focusedTaskId,
  isPendingPublishTask,
  composeRestoreRequest = null,
  isInteractionBlocked = false,
}: KanbanViewProps) {
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const compactTaskCardsEnabled = usePreferencesStore(s => s.compactTaskCardsEnabled);
  const { authPolicy, guardModify, focusSidebar, focusTask } = useTaskViewServices();
  const { people } = useFeedSurfaceState();
  const [optimisticStatusByTaskId, setOptimisticStatusByTaskId] = useState<Record<string, TaskStatus>>({});
  const [composingColumnId, setComposingColumnId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const { kanbanTasks, getAncestorChain, showContext } = useKanbanViewState({
    tasks,
    allTasks,
    focusedTaskId,
    searchQueryOverride,
    depthMode,
  });
  const sortContext = useMemo<SortContext>(() => {
    const childrenMap = buildChildrenMap(allTasks);
    const priorityScores = evaluateTaskPriorities(allTasks);
    return {
      childrenMap,
      allTasks,
      taskById: new Map(allTasks.map((task) => [task.id, task] as const)),
      priorityScores,
    };
  }, [allTasks]);

  const columns = useMemo(() => getColumns(kanbanTasks), [kanbanTasks]);
  const tasksByColumnId = useMemo(() => {
    const grouped: Record<string, Task[]> = Object.fromEntries(columns.map((column) => [column.id, []]));

    for (const task of kanbanTasks) {
      const effectiveStatus = optimisticStatusByTaskId[task.id] || task.status;
      const columnId = resolveTaskStateFromStatus(effectiveStatus).id;
      grouped[columnId] ||= [];
      grouped[columnId].push(task);
    }

    for (const column of columns) {
      grouped[column.id] = sortKanbanColumnTasks(grouped[column.id] || [], column.state.type, sortContext);
    }

    return grouped;
  }, [columns, kanbanTasks, optimisticStatusByTaskId, sortContext]);
  const canonicalStateIdByTaskId = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of kanbanTasks) {
      map.set(task.id, resolveTaskStateFromStatus(task.status).id);
    }
    return map;
  }, [kanbanTasks]);

  useEffect(() => {
    setOptimisticStatusByTaskId((previous) => {
      const next: Record<string, TaskStatus> = {};
      let changed = false;
      for (const [taskId, status] of Object.entries(previous)) {
        const canonicalStateId = canonicalStateIdByTaskId.get(taskId);
        const optimisticStateId = resolveTaskStateFromStatus(status).id;
        if (!canonicalStateId) {
          changed = true;
          continue;
        }
        if (canonicalStateId === optimisticStateId) {
          changed = true;
          continue;
        }
        next[taskId] = status;
      }
      return changed ? next : previous;
    });
  }, [canonicalStateIdByTaskId]);
  const getTaskEffectiveStatus = useCallback(
    (task: Task): TaskStatus => optimisticStatusByTaskId[task.id] || task.status,
    [optimisticStatusByTaskId]
  );
  const hasChildren = useCallback(
    (taskId: string): boolean => allTasks.some((task) => task.taskType === "task" && task.parentId === taskId),
    [allTasks]
  );
  const dispatchStatusChange = useCallback(
    (taskId: string, status: TaskStatus) => {
      void dispatchFeedInteraction({ type: "task.changeStatus", taskId, status });
    },
    [dispatchFeedInteraction]
  );

  // Scroll container ref — declared early so edge-scroll callbacks can close over it
  const columnsContainerRef = useRef<HTMLDivElement>(null);

  // Edge-scroll during drag: scroll the board when the pointer nears the horizontal edges.
  // Safe with @dnd-kit/core because DragOverlay renders in a viewport-fixed portal and
  // collision detection calls getBoundingClientRect() on each sensor move event (no stale cache).
  const isDraggingRef = useRef(false);
  const pointerXRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent) => {
    pointerXRef.current = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
  }, []);

  const startEdgeScroll = useCallback(() => {
    const container = columnsContainerRef.current;
    if (!container) return;
    const EDGE_ZONE = 120;
    const MAX_SPEED = 16;
    const tick = () => {
      if (!isDraggingRef.current) return;
      const rect = container.getBoundingClientRect();
      const x = pointerXRef.current;
      const leftDist = x - rect.left;
      const rightDist = rect.right - x;
      if (leftDist < EDGE_ZONE && leftDist >= 0) {
        container.scrollLeft -= Math.round(MAX_SPEED * (1 - leftDist / EDGE_ZONE));
      } else if (rightDist < EDGE_ZONE && rightDist >= 0) {
        container.scrollLeft += Math.round(MAX_SPEED * (1 - rightDist / EDGE_ZONE));
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  const stopEdgeScroll = useCallback(() => {
    isDraggingRef.current = false;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    window.removeEventListener("mousemove", handlePointerMove);
    window.removeEventListener("touchmove", handlePointerMove as EventListener);
  }, [handlePointerMove]);

  useEffect(() => () => { stopEdgeScroll(); }, [stopEdgeScroll]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
    isDraggingRef.current = true;
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("touchmove", handlePointerMove as EventListener);
    startEdgeScroll();
  }, [handlePointerMove, startEdgeScroll]);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    stopEdgeScroll();

    const taskId = String(event.active.id);
    const destColumnId = event.over ? String(event.over.id) : null;
    if (!destColumnId) return;
    if (isInteractionBlocked) {
      guardModify();
      return;
    }

    const targetColumn = columns.find((column) => column.id === destColumnId);
    const task = kanbanTasks.find((item) => item.id === taskId);
    if (!task || !targetColumn || !canUserChangeTaskStatus(task, currentUser)) return;
    const nextStatus = toTaskStatusFromStateDefinition(targetColumn.state);
    const currentStateId = resolveTaskStateFromStatus(getTaskEffectiveStatus(task)).id;
    if (targetColumn.id === currentStateId) return;

    setOptimisticStatusByTaskId((previous) => ({ ...previous, [taskId]: nextStatus }));
    dispatchStatusChange(taskId, nextStatus);
  };

  // Flatten all visible task IDs for keyboard navigation (across all columns)
  const allVisibleTaskIds = useMemo(() => {
    return columns.flatMap((column) => (tasksByColumnId[column.id] || []).map((task) => task.id));
  }, [columns, tasksByColumnId]);

  // Column-aware task IDs for Kanban navigation
  const columnTaskIds = useMemo(
    () => columns.map((column) => (tasksByColumnId[column.id] || []).map((task) => task.id)),
    [columns, tasksByColumnId]
  );

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
    if (!canUserChangeTaskStatus(task, currentUser)) {
      guardModify();
      return;
    }

    const currentColumnIndex = columns.findIndex(
      (column) => column.id === resolveTaskStateFromStatus(getTaskEffectiveStatus(task)).id
    );
    if (currentColumnIndex <= 0) return;
    const newStatus = toTaskStatusFromStateDefinition(columns[currentColumnIndex - 1].state);

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
    if (!canUserChangeTaskStatus(task, currentUser)) {
      guardModify();
      return;
    }

    const currentColumnIndex = columns.findIndex(
      (column) => column.id === resolveTaskStateFromStatus(getTaskEffectiveStatus(task)).id
    );
    if (currentColumnIndex < 0 || currentColumnIndex >= columns.length - 1) return;
    const newStatus = toTaskStatusFromStateDefinition(columns[currentColumnIndex + 1].state);

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
    enabled: composingColumnId === null,
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
      requestAnimationFrame(() => {
        setFocusByTaskId(taskIdToFocus);
      });
    }
  }, [tasksByColumnId, setFocusByTaskId]);

  // Scroll focused task into view
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

  const activeTask = activeTaskId ? kanbanTasks.find(t => t.id === activeTaskId) : null;

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Kanban Columns */}
      <div
        ref={columnsContainerRef}
        className="scrollbar-auto relative flex-1 overflow-x-auto overflow-y-hidden px-4 pt-4"
        data-onboarding="kanban-board"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full min-w-max" data-onboarding="kanban-columns">
            {columns.map((column) => (
              <div
                key={column.id}
                className="flex flex-col w-80 xl:w-[24rem] 2xl:w-[28rem] bg-muted/30 rounded-lg flex-shrink-0"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={column.color}><TaskStateDefIcon state={column.state} /></span>
                    <span className="font-medium">{column.label}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {(tasksByColumnId[column.id] || []).length}
                    </span>
                  </div>
                  {authPolicy.canOpenCompose && !isInteractionBlocked && column.state.type !== "closed" && (
                    <button
                      onClick={() => setComposingColumnId(column.id)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      data-onboarding="kanban-add-task"
                    >
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                </div>

                {/* Task Composer */}
                {composingColumnId === column.id && (
                  <div className="p-3 border-b border-border bg-card/50 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{t("kanban.newTaskIn", { column: column.label })}</span>
                      <button
                        onClick={() => setComposingColumnId(null)}
                        className="p-0.5 rounded hover:bg-muted"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                      <TaskCreateComposer
                        key={column.id}
                        onCancel={() => setComposingColumnId(null)}
                        compact
                        focusedTaskId={focusedTaskId}
                        initialStatus={toTaskStatusFromStateDefinition(
                          column.state.type === "closed"
                            ? { ...column.state, id: "open", type: "open", label: "Open" }
                            : column.state
                        )}
                        closeOnSuccess
                        allowComment={false}
                        composeRestoreRequest={composeRestoreRequest}
                      />
                  </div>
                )}

                {/* Column Content - Droppable */}
                <DroppableColumnContent
                  id={column.id}
                  isDraggingOver={false}
                  className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto p-2"
                >
                  <div className="flex h-full min-h-full min-w-0 flex-col gap-2">
                    {(tasksByColumnId[column.id] || []).map((task) => {
                      const canChangeStatus = !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
                      return (
                        <DraggableCardWrapper
                          key={task.id}
                          id={task.id}
                          disabled={!canChangeStatus}
                        >
                          <KanbanTaskCard
                            task={task}
                            currentUser={currentUser}
                            people={people}
                            displayStatus={getTaskEffectiveStatus(task)}
                            ancestorChain={!compactTaskCardsEnabled && showContext ? getAncestorChain(task.id) : []}
                            showContext={showContext}
                            compactTaskCardsEnabled={compactTaskCardsEnabled}
                            isKeyboardFocused={keyboardFocusedTaskId === task.id && activeTaskId === null}
                            isInteractionBlocked={isInteractionBlocked}
                            isPendingPublish={Boolean(isPendingPublishTask?.(task.id))}
                            hasChildren={hasChildren}
                          />
                        </DraggableCardWrapper>
                      );
                    })}
                    {(tasksByColumnId[column.id] || []).length === 0 && <div className="flex-1 min-h-[96px]" aria-hidden="true" />}
                    {/* Bottom buffer so the last card isn't flush against the scroll edge */}
                    <div className="h-6 shrink-0" aria-hidden="true" />
                  </div>
                </DroppableColumnContent>
              </div>
            ))}
          </div>

          {/* Viewport-fixed overlay card — not trapped in any scroll container */}
          <DragOverlay>
            {activeTask ? (
              <div className="shadow-2xl ring-2 ring-primary/30 rounded-lg rotate-1 scale-105">
                <KanbanTaskCard
                  task={activeTask}
                  currentUser={currentUser}
                  people={people}
                  displayStatus={getTaskEffectiveStatus(activeTask)}
                  ancestorChain={!compactTaskCardsEnabled && showContext ? getAncestorChain(activeTask.id) : []}
                  showContext={showContext}
                  compactTaskCardsEnabled={compactTaskCardsEnabled}
                  isKeyboardFocused={false}
                  isInteractionBlocked={isInteractionBlocked}
                  isPendingPublish={Boolean(isPendingPublishTask?.(activeTask.id))}
                  hasChildren={hasChildren}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </main>
  );
}
