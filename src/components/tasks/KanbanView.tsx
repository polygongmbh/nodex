import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNDK } from "@/lib/nostr/ndk-context";
import { Plus, X, Circle, CircleDot, CheckCircle2, Calendar, Clock, Layers, Lock } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import {
  Task,
  TaskCreateResult,
  TaskDateType,
  TaskStatus,
  SharedTaskViewContext,
  ComposeRestoreRequest,
  PublishedAttachment,
  Nip99Metadata,
} from "@/types";
import { TaskComposer } from "./TaskComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { getStandaloneEmbeddableUrls, linkifyContent } from "@/lib/linkify";
import { TaskTagChipRow } from "./TaskTagChipRow";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDueDateColorClass, sortTasks, buildChildrenMap, SortContext } from "@/lib/taskSorting";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { canUserChangeTaskStatus } from "@/lib/task-permissions";
import { sortByLatestModified } from "@/lib/kanban-sorting";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
import type { KanbanDepthMode } from "./DesktopSearchDock";
import { useTranslation } from "react-i18next";
import { useTaskViewFiltering } from "@/hooks/use-task-view-filtering";
import { filterTasksByDepthMode } from "@/lib/depth-mode-filter";
import { TaskAttachmentList } from "./TaskAttachmentList";
import { useTaskMediaPreview } from "@/hooks/use-task-media-preview";
import { TaskMediaLightbox } from "@/components/tasks/TaskMediaLightbox";

interface KanbanViewProps extends SharedTaskViewContext {
  depthMode: KanbanDepthMode;
  onToggleComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void;
  onFocusSidebar?: () => void;
  onUndoPendingPublish?: (taskId: string) => void;
  isPendingPublishTask?: (taskId: string) => boolean;
  isInteractionBlocked?: boolean;
  onInteractionBlocked?: () => void;
}

const getColumns = (t: (key: string) => string): { id: TaskStatus; label: string; icon: React.ReactNode; color: string }[] => [
  { id: "todo", label: t("listView.status.todo"), icon: <Circle className="w-4 h-4" />, color: "text-muted-foreground" },
  { id: "in-progress", label: t("listView.status.inProgress"), icon: <CircleDot className="w-4 h-4" />, color: "text-warning" },
  { id: "done", label: t("listView.status.done"), icon: <CheckCircle2 className="w-4 h-4" />, color: "text-primary" },
];
const ACTIVE_KANBAN_STATUSES: TaskStatus[] = ["todo", "in-progress"];

export function KanbanView({
  tasks,
  allTasks,
  relays,
  channels,
  channelMatchMode = "and",
  composeChannels,
  people,
  currentUser,
  searchQuery,
  depthMode,
  onNewTask,
  onToggleComplete,
  focusedTaskId,
  onFocusTask,
  onStatusChange,
  onFocusSidebar,
  onHashtagClick,
  onAuthorClick,
  onUndoPendingPublish,
  isPendingPublishTask,
  composeRestoreRequest = null,
  isInteractionBlocked = false,
  onInteractionBlocked,
}: KanbanViewProps) {
  const { t } = useTranslation();
  const { user } = useNDK();
  const columns = useMemo(() => getColumns((key) => t(key)), [t]);
  const [composingColumn, setComposingColumn] = useState<TaskStatus | null>(null);
  const [expandedChipRows, setExpandedChipRows] = useState<Record<string, boolean>>({});

  // Build children map
  const childrenMap = useMemo(() => buildChildrenMap(allTasks), [allTasks]);
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);

  const sortContext: SortContext = useMemo(() => ({
    childrenMap,
    allTasks,
    taskById,
  }), [childrenMap, allTasks, taskById]);

  // Check if task has children
  const hasChildren = useCallback((taskId: string): boolean => {
    const children = childrenMap.get(taskId) || [];
    return children.some(c => c.taskType === "task");
  }, [childrenMap]);

  // Get depth of task from root
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
  
  const kanbanTasks = useMemo(() => {
    return filterTasksByDepthMode({
      tasks: filteredTaskCandidates,
      depthMode,
      focusedTaskId,
      getDepth,
      hasChildren,
    });
  }, [
    depthMode,
    filteredTaskCandidates,
    focusedTaskId,
    getDepth,
    hasChildren,
  ]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      "todo": [],
      "in-progress": [],
      "done": [],
    };
    
    kanbanTasks.forEach(task => {
      const status = task.status || "todo";
      grouped[status].push(task);
    });

    // Keep done column strictly chronological; apply shared priority ordering elsewhere.
    for (const status of ACTIVE_KANBAN_STATUSES) {
      grouped[status] = sortTasks(grouped[status], sortContext);
    }
    grouped["done"] = sortByLatestModified(grouped["done"]);

    return grouped;
  }, [kanbanTasks, sortContext]);
  const orderedKanbanTasks = useMemo(
    () => [...tasksByStatus["todo"], ...tasksByStatus["in-progress"], ...tasksByStatus["done"]],
    [tasksByStatus]
  );
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
  } = useTaskMediaPreview(orderedKanbanTasks);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (isInteractionBlocked) {
      onInteractionBlocked?.();
      return;
    }
    
    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId as TaskStatus;
    const task = kanbanTasks.find((item) => item.id === taskId);
    if (!task || !canUserChangeTaskStatus(task, currentUser)) return;
    
    if (onStatusChange) {
      onStatusChange(taskId, newStatus);
    } else {
      // Fallback to toggle if no status change handler
      onToggleComplete(taskId);
    }
  };

  const handleNewTask = async (
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
    const result = await Promise.resolve(onNewTask(
      content,
      taskTags,
      taskRelays,
      taskType,
      dueDate,
      dueTime,
      dateType,
      focusedTaskId || undefined,
      composingColumn || undefined,
      explicitMentionPubkeys,
      priority,
      attachments,
      nip99
    ));
    if (result.ok) {
      setComposingColumn(null);
    }
    return result;
  };

  // Flatten all visible task IDs for keyboard navigation (across all columns)
  const allVisibleTaskIds = useMemo(() => {
    return [...tasksByStatus["todo"], ...tasksByStatus["in-progress"], ...tasksByStatus["done"]].map(t => t.id);
  }, [tasksByStatus]);

  // Column-aware task IDs for Kanban navigation
  const columnTaskIds = useMemo(() => [
    tasksByStatus["todo"].map(t => t.id),
    tasksByStatus["in-progress"].map(t => t.id),
    tasksByStatus["done"].map(t => t.id),
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
  const handleMoveLeft = useCallback(() => {
    if (isInteractionBlocked) {
      onInteractionBlocked?.();
      return;
    }
    const focusedId = keyboardFocusedTaskIdRef.current;
    if (!focusedId) return;
    const task = kanbanTasks.find(t => t.id === focusedId);
    if (!task) return;
    if (!canUserChangeTaskStatus(task, currentUser)) return;
    
    const currentStatus = task.status || "todo";
    let newStatus: TaskStatus;
    
    if (currentStatus === "done") newStatus = "in-progress";
    else if (currentStatus === "in-progress") newStatus = "todo";
    else return; // Already at leftmost
    
    pendingRefocusRef.current = focusedId;
    onStatusChange?.(focusedId, newStatus);
  }, [currentUser, isInteractionBlocked, kanbanTasks, onInteractionBlocked, onStatusChange]);

  // Handle moving task right (to next column) - preserves focus
  const handleMoveRight = useCallback(() => {
    if (isInteractionBlocked) {
      onInteractionBlocked?.();
      return;
    }
    const focusedId = keyboardFocusedTaskIdRef.current;
    if (!focusedId) return;
    const task = kanbanTasks.find(t => t.id === focusedId);
    if (!task) return;
    if (!canUserChangeTaskStatus(task, currentUser)) return;
    
    const currentStatus = task.status || "todo";
    let newStatus: TaskStatus;
    
    if (currentStatus === "todo") newStatus = "in-progress";
    else if (currentStatus === "in-progress") newStatus = "done";
    else return; // Already at rightmost
    
    pendingRefocusRef.current = focusedId;
    onStatusChange?.(focusedId, newStatus);
  }, [currentUser, isInteractionBlocked, kanbanTasks, onInteractionBlocked, onStatusChange]);

  // Keyboard navigation - Kanban mode: arrows navigate, Shift+arrows/HJKL move tasks
  const { focusedTaskId: navFocusedTaskId, setFocusByTaskId } = useTaskNavigation({
    taskIds: allVisibleTaskIds,
    onSelectTask: (id) => onFocusTask?.(id),
    onMoveLeft: handleMoveLeft,
    onMoveRight: handleMoveRight,
    onFocusSidebar,
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
  
  // Determine if we should show context (depth > 1 or leaves mode)
  const showContext = depthMode !== "1";

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden">
      {focusedTaskId && (
        <FocusedTaskBreadcrumb
          allTasks={allTasks}
          focusedTaskId={focusedTaskId}
          onFocusTask={onFocusTask}
        />
      )}

      {/* Kanban Columns */}
      <div
        ref={columnsContainerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden p-4"
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
                  {user && !isInteractionBlocked && (
                    <button
                      onClick={() => setComposingColumn(column.id)}
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
                      <TaskComposer
                        onSubmit={handleNewTask}
                        relays={relays}
                        channels={composeChannels || channels}
                        people={people}
                      onCancel={() => setComposingColumn(null)}
                      compact
                      allowComment={false}
                      composeRestoreRequest={composeRestoreRequest}
                    />
                  </div>
                )}

                {/* Column Content - Droppable */}
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <ScrollArea 
                      className={cn(
                        "flex-1 p-2",
                        snapshot.isDraggingOver && "bg-primary/5"
                      )}
                    >
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="space-y-2 min-h-[100px]"
                      >
                        {tasksByStatus[column.id].map((task, index) => {
                          const ancestorChain = showContext ? getAncestorChain(task.id) : [];
                          const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
                          const isKeyboardFocused = keyboardFocusedTaskId === task.id;
                          const isLockedUntilStart = isTaskLockedUntilStart(task);
                          const canChangeStatus = !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
                          const isPendingPublish = Boolean(isPendingPublishTask?.(task.id));
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
                                  onClick={() => onFocusTask?.(task.id)}
                                  className={cn(
                                    "relative bg-card border border-border rounded-lg p-3 shadow-sm transition-shadow cursor-pointer",
                                    snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : "hover:shadow-md",
                                    !canChangeStatus && "border-dashed border-muted-foreground/60 bg-muted/40",
                                    task.status === "done" && "opacity-70",
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
                                        <span key={ancestor.id} className="flex items-center gap-1">
                                          {i > 0 && <span className="text-muted-foreground/50">›</span>}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                            onFocusTask?.(ancestor.id);
                                          }}
                                          className={`${TASK_INTERACTION_STYLES.hoverLinkText} truncate max-w-[80px]`}
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
                                  <div
                                    className={cn(
                                      `text-sm leading-relaxed whitespace-pre-wrap ${TASK_INTERACTION_STYLES.hoverText}`,
                                      task.status === "done" && "line-through text-muted-foreground"
                                    )}
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
                                    onMediaClick={(url) => openTaskMedia(task.id, url)}
                                  />
                                  {isPendingPublish && (
                                    <div className="mt-2">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          onUndoPendingPublish?.(task.id);
                                        }}
                                        className="text-xs font-medium text-warning hover:text-warning/80"
                                        title={t("toasts.actions.undo")}
                                      >
                                        {t("toasts.actions.undo")}
                                      </button>
                                    </div>
                                  )}
                                  {/* Children indicator */}
                                  {hasChildren(task.id) && (
                                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                                      <Layers className="w-3 h-3" />
                                      <span>{t("kanban.hasSubtasks")}</span>
                                    </div>
                                  )}

                                  {/* Due date with color coding */}
                                  {task.dueDate && (
                                    <div className={cn("flex items-center gap-1.5 text-xs mt-2", dueDateColor)}>
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

                                  <TaskTagChipRow
                                    task={task}
                                    people={people}
                                    className="mt-2"
                                    expanded={Boolean(expandedChipRows[task.id])}
                                    onToggleExpanded={(expanded) =>
                                      setExpandedChipRows((prev) => ({ ...prev, [task.id]: expanded }))
                                    }
                                    onHashtagClick={onHashtagClick}
                                    onPersonClick={onAuthorClick}
                                  />
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    </ScrollArea>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
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
