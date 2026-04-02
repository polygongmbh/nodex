import { startTransition, useEffect, useRef, useMemo, useState, useCallback, type UIEvent } from "react";
import { Circle, CircleDot, CheckCircle2, MessageSquare, Package, HandHelping, Calendar, Clock, X } from "lucide-react";
import {
  Task,
  Person,
  ComposeRestoreRequest,
  RawNostrEvent,
} from "@/types";
import { SharedViewComposer } from "./SharedViewComposer";
import { FeedTaskCard } from "./feed/FeedTaskCard";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import { formatAuthorMetaParts } from "@/lib/person-label";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { getTaskDateTypeLabel } from "@/lib/task-dates";
import { getDueDateColorClass } from "@/domain/content/task-sorting";
import { useTranslation } from "react-i18next";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getCommentCreatedTooltip, getStatusUpdatedTooltip, getTaskCreatedTooltip } from "@/lib/task-timestamp-tooltip";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { FilteredEmptyState } from "@/components/tasks/FilteredEmptyState";
import { TaskDueDateEditorForm, TaskPrioritySelect } from "./TaskMetadataEditors";
import { hasTextSelection } from "@/lib/click-intent";
import { RawNostrEventDialog } from "@/components/tasks/RawNostrEventDialog";
import { useFeedViewInteractionModel } from "@/features/feed-page/interactions/feed-view-interaction-context";
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { getTrimmedFirstTaskContentLine } from "@/lib/task-content-preview";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import {
  getAncestorChainFromSource,
  useFeedViewState,
  type FeedEntry,
} from "@/features/feed-page/controllers/use-task-view-states";
import {
  useFeedPersonLookup,
  useFeedSurfaceState,
} from "@/features/feed-page/views/feed-surface-context";
import { TaskViewMediaLightbox, useTaskViewMedia } from "./task-view-media";
import { useTaskViewServices } from "./use-task-view-services";

function formatCompactRelativeTime(date: Date): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) return "now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d`;
  return format(date, "MMM d");
}

interface FeedViewProps {
  tasks: Task[];
  allTasks: Task[];
  currentUser?: Person;
  focusedTaskId?: string | null;
  searchQueryOverride?: string;
  composeRestoreRequest?: ComposeRestoreRequest | null;
  isMobile?: boolean;
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  isPendingPublishTask?: (taskId: string) => boolean;
  onMentionRequestConsumed?: (requestId: number) => void;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  isInteractionBlocked?: boolean;
  isHydrating?: boolean;
}

const INITIAL_VISIBLE_FEED_ENTRIES = 40;
const FEED_REVEAL_BATCH_SIZE = 30;
const FEED_REVEAL_DELAY_MS = 80;
const FEED_REVEAL_SCROLL_THRESHOLD_PX = 720;
const DESKTOP_FEED_ROW_CONTENT_PADDING = "px-3";

interface FeedDueDateChipProps {
  task: Task;
  editable: boolean;
  dueDateColor: string;
}

interface FeedDisclosureState {
  key: string;
  visibleEntryCount: number;
}

function FeedDueDateChip({
  task,
  editable,
  dueDateColor,
}: FeedDueDateChipProps) {
  if (!task.dueDate) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!editable}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1 rounded px-1 py-0.5 text-left transition-colors",
            dueDateColor,
            editable ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
          )}
        >
          <Calendar className="w-3 h-3" />
          <span className="uppercase tracking-wide">{getTaskDateTypeLabel(task.dateType)}</span>
          <span>{format(task.dueDate, "MMM d, yyyy")}</span>
          {task.dueTime && (
            <>
              <Clock className="w-3 h-3 ml-1" />
              <span>{task.dueTime}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      {editable && (
        <PopoverContent
          className="w-auto p-0"
          align="start"
          onClick={(event) => event.stopPropagation()}
        >
          <TaskDueDateEditorForm
            taskId={task.id}
            dueDate={task.dueDate}
            dueTime={task.dueTime}
            dateType={task.dateType}
            idPrefix="feed"
          />
        </PopoverContent>
      )}
    </Popover>
  );
}

interface FeedPriorityChipProps {
  task: Task;
  editable: boolean;
}

function FeedPriorityChip({ task, editable }: FeedPriorityChipProps) {
  const { t } = useTranslation();

  if (typeof task.priority !== "number") return null;

  return (
    <TaskPrioritySelect
      id={`feed-priority-${task.id}`}
      taskId={task.id}
      priority={task.priority}
      ariaLabel={t("composer.labels.priority")}
      disabled={!editable}
      stopPropagation
      className={cn(
        "rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning transition-colors focus:outline-none",
        editable && "cursor-pointer hover:bg-warning/20",
        !editable && "cursor-not-allowed opacity-60"
      )}
    />
  );
}

export function FeedView({
  tasks,
  allTasks,
  currentUser,
  focusedTaskId,
  searchQueryOverride,
  isMobile = false,
  forceShowComposer,
  composeGuideActivationSignal,
  isPendingPublishTask,
  composeRestoreRequest = null,
  onMentionRequestConsumed,
  mentionRequest = null,
  isInteractionBlocked = false,
  isHydrating = false,
}: FeedViewProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { authPolicy, focusSidebar, focusTask } = useTaskViewServices();
  const { channels, people } = useFeedSurfaceState();
  const { peopleById } = useFeedPersonLookup();
  const interactionModel = useFeedViewInteractionModel();
  const effectiveForceShowComposer = forceShowComposer ?? interactionModel.forceShowComposer;
  const getStatusToggleHint = (status?: Task["status"]): string => {
    const alternateKey = getAlternateModifierLabel();
    if (status === "in-progress") return t("hints.statusToggle.inProgress", { alternateKey });
    if (status === "done") return t("hints.statusToggle.done");
    if (status === "closed") return t("hints.statusToggle.closed");
    return t("hints.statusToggle.todo", { alternateKey });
  };

  const SLIM_DESKTOP_QUERY = "(min-width: 768px) and (max-width: 1023px)";
  const XL_DESKTOP_QUERY = "(min-width: 1280px)";
  const [isSlimDesktop, setIsSlimDesktop] = useState(false);
  const [isXLDesktop, setIsXLDesktop] = useState(false);
  const [rawEventDialogOpen, setRawEventDialogOpen] = useState(false);
  const [activeRawEvent, setActiveRawEvent] = useState<RawNostrEvent | null>(null);
  const SHARED_COMPOSE_DRAFT_KEY = COMPOSE_DRAFT_STORAGE_KEY;
  const {
    searchQuery,
    focusedTask,
    taskById,
    feedTasks,
    feedEntries,
    activeFeedEntries,
    mediaPreviewTasks,
    feedDisclosureKey,
    shouldShowMobileScopeFallback,
    shouldShowScopeFooterHint,
    composerDefaultContent,
  } = useFeedViewState({
    tasks,
    allTasks,
    focusedTaskId,
    searchQueryOverride,
    isMobile,
  });

  useEffect(() => {
    if (isMobile || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setIsSlimDesktop(false);
      return;
    }

    const mediaQuery = window.matchMedia(SLIM_DESKTOP_QUERY);
    const handleMediaQueryChange = () => {
      setIsSlimDesktop(mediaQuery.matches);
    };

    handleMediaQueryChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaQueryChange);
      return () => mediaQuery.removeEventListener("change", handleMediaQueryChange);
    }

    mediaQuery.addListener(handleMediaQueryChange);
    return () => mediaQuery.removeListener(handleMediaQueryChange);
  }, [isMobile]);

  useEffect(() => {
    if (isMobile || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setIsXLDesktop(false);
      return;
    }

    const mediaQuery = window.matchMedia(XL_DESKTOP_QUERY);
    const handleMediaQueryChange = () => {
      setIsXLDesktop(mediaQuery.matches);
    };

    handleMediaQueryChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaQueryChange);
      return () => mediaQuery.removeEventListener("change", handleMediaQueryChange);
    }

    mediaQuery.addListener(handleMediaQueryChange);
    return () => mediaQuery.removeListener(handleMediaQueryChange);
  }, [isMobile]);

  const [feedDisclosureState, setFeedDisclosureState] = useState<FeedDisclosureState>(() => ({
    key: feedDisclosureKey,
    visibleEntryCount: INITIAL_VISIBLE_FEED_ENTRIES,
  }));
  const visibleEntryCount =
    feedDisclosureState.key === feedDisclosureKey
      ? feedDisclosureState.visibleEntryCount
      : INITIAL_VISIBLE_FEED_ENTRIES;
  const displayedFeedEntries = useMemo(
    () => activeFeedEntries.slice(0, visibleEntryCount),
    [activeFeedEntries, visibleEntryCount]
  );
  const mediaController = useTaskViewMedia(mediaPreviewTasks);
  const { openTaskMedia } = mediaController;

  // Task IDs for keyboard navigation
  const taskIds = useMemo(() => feedTasks.map(t => t.id), [feedTasks]);

  // Keyboard navigation
  const { focusedTaskId: keyboardFocusedTaskId } = useTaskNavigation({
    taskIds,
    onSelectTask: focusTask,
    onGoBack: () => focusTask(null),
    onFocusSidebar: focusSidebar,
    enabled: !isMobile,
  });

  // Scroll focused task into view
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const revealMoreEntries = useCallback((reason: "timer" | "scroll" | "focus") => {
    if (activeFeedEntries.length <= visibleEntryCount) return;
    startTransition(() => {
      setFeedDisclosureState((previous) => {
        const previousVisibleCount =
          previous.key === feedDisclosureKey
            ? previous.visibleEntryCount
            : INITIAL_VISIBLE_FEED_ENTRIES;
        const next = Math.min(activeFeedEntries.length, previousVisibleCount + FEED_REVEAL_BATCH_SIZE);
        if (next !== previousVisibleCount) {
          nostrDevLog("feed", "Revealed incremental feed batch", {
            reason,
            visibleEntryCount: next,
            totalEntryCount: activeFeedEntries.length,
          });
        }
        return {
          key: feedDisclosureKey,
          visibleEntryCount: next,
        };
      });
    });
  }, [activeFeedEntries.length, feedDisclosureKey, visibleEntryCount]);

  useEffect(() => {
    startTransition(() => {
      setFeedDisclosureState({
        key: feedDisclosureKey,
        visibleEntryCount: INITIAL_VISIBLE_FEED_ENTRIES,
      });
    });
  }, [feedDisclosureKey]);

  useEffect(() => {
    if (activeFeedEntries.length <= visibleEntryCount) return;
    const timeoutId = window.setTimeout(() => {
      revealMoreEntries("timer");
    }, FEED_REVEAL_DELAY_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeFeedEntries.length, revealMoreEntries, visibleEntryCount]);

  useEffect(() => {
    if (!focusedTaskId) return;
    const focusedIndex = activeFeedEntries.findIndex(
      (entry) => entry.type === "task" && entry.task.id === focusedTaskId
    );
    if (focusedIndex === -1 || focusedIndex < visibleEntryCount) return;
    startTransition(() => {
      setFeedDisclosureState((previous) => {
        const previousVisibleCount =
          previous.key === feedDisclosureKey
            ? previous.visibleEntryCount
            : INITIAL_VISIBLE_FEED_ENTRIES;
        const next = Math.min(activeFeedEntries.length, focusedIndex + 1 + FEED_REVEAL_BATCH_SIZE);
        if (next !== previousVisibleCount) {
          nostrDevLog("feed", "Expanded feed window to include focused task", {
            focusedTaskId,
            visibleEntryCount: next,
            totalEntryCount: activeFeedEntries.length,
          });
        }
        return {
          key: feedDisclosureKey,
          visibleEntryCount: next,
        };
      });
    });
  }, [activeFeedEntries, feedDisclosureKey, focusedTaskId, visibleEntryCount]);

  const handleFeedScroll = (event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const remainingDistance = container.scrollHeight - (container.scrollTop + container.clientHeight);
    if (remainingDistance > FEED_REVEAL_SCROLL_THRESHOLD_PX) return;
    revealMoreEntries("scroll");
  };

  useEffect(() => {
    if (keyboardFocusedTaskId && scrollContainerRef.current) {
      const element = scrollContainerRef.current.querySelector(
        `[data-task-id="${keyboardFocusedTaskId}"]`
      );
      if (element) {
        element.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [keyboardFocusedTaskId]);

  const canCompleteTask = (task: Task) => {
    return !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  };
  const getStateLabel = (status: Task["status"]) => {
    if (status === "done") return t("listView.status.done");
    if (status === "closed") return t("listView.status.closed");
    if (status === "in-progress") return t("listView.status.inProgress");
    return t("listView.status.todo");
  };
  const normalizeLabelText = (value?: string) =>
    (value || "")
      .toLowerCase()
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const getParentBreadcrumb = (task: Task): { id: string; text: string }[] => {
    return getAncestorChainFromSource({ taskById }, task.id, focusedTaskId);
  };

  const [expandedContentByTaskId, setExpandedContentByTaskId] = useState<Record<string, boolean>>({});

  const renderFeedEntry = (entry: FeedEntry) => {
    if (entry.type === "state-update") {
      const { task, update } = entry;
      const resolvedUpdateAuthor =
        peopleById.get(update.authorPubkey.toLowerCase()) ||
        task.author;
      const updateAuthorMeta = formatAuthorMetaParts({
        personId: resolvedUpdateAuthor.id,
        displayName: resolvedUpdateAuthor.displayName,
        username: resolvedUpdateAuthor.name,
      });
      const updateAuthorUserFacingId = toUserFacingPubkey(resolvedUpdateAuthor.id);
      const updateTimeLabel = isMobile
        ? formatCompactRelativeTime(update.timestamp)
        : formatDistanceToNow(update.timestamp, { addSuffix: true });
      const breadcrumbTaskSummary = formatBreadcrumbLabel(task.content);
      const taskTooltipTitle = getTrimmedFirstTaskContentLine(task.content) || breadcrumbTaskSummary;
      const stateLabel = getStateLabel(update.status);
      const statusDescription = update.statusDescription?.trim();
      const isDefaultInProgressDescription =
        update.status === "in-progress" &&
        normalizeLabelText(statusDescription) === normalizeLabelText("In Progress");
      const showStatusDescription =
        Boolean(statusDescription) &&
        !isDefaultInProgressDescription &&
        normalizeLabelText(statusDescription) !== normalizeLabelText(stateLabel);

      return (
        <div
          key={entry.id}
          data-testid={`feed-state-entry-${update.id}`}
          onClick={() => { if (!hasTextSelection()) focusTask(task.id); }}
          className={cn(
            `border-b border-border py-1.5 transition-colors cursor-pointer ${TASK_INTERACTION_STYLES.cardSurface}`
          )}
        >
          <div className={cn(isMobile ? "px-3" : DESKTOP_FEED_ROW_CONTENT_PADDING)}>
            <div className="flex items-center gap-2 min-w-0">
              {update.status === "done" ? (
                <CheckCircle2 className={cn("text-primary flex-shrink-0", isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} />
              ) : update.status === "closed" ? (
                <X className={cn("text-muted-foreground flex-shrink-0", isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} />
              ) : update.status === "in-progress" ? (
                <CircleDot className={cn("text-warning flex-shrink-0", isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} />
              ) : (
                <Circle className={cn("text-muted-foreground flex-shrink-0", isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} />
              )}
              <div className="min-w-0 flex-1 text-xs text-muted-foreground inline-flex items-center gap-2">
                <div className="min-w-0 inline-flex flex-1 items-center gap-1 overflow-hidden whitespace-nowrap">
                  <span className="shrink-0">{stateLabel}</span>
                  {showStatusDescription && (
                    <span className="truncate">{`: ${statusDescription}`}</span>
                  )}
                  <span className="shrink-0">·</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void dispatchFeedInteraction({ type: "filter.applyAuthorExclusive", author: resolvedUpdateAuthor });
                    }}
                    className="hover:text-foreground shrink-0"
                    aria-label={t("tasks.actions.filterAndMention", { authorName: updateAuthorMeta.primary })}
                    title={updateAuthorUserFacingId}
                  >
                    {updateAuthorMeta.primary}
                  </button>
                  <span className="shrink-0">·</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      focusTask(task.id);
                    }}
                    className={cn(
                      TASK_INTERACTION_STYLES.hoverLinkText,
                      "min-w-0 max-w-[60vw] shrink truncate text-left font-semibold text-foreground"
                    )}
                    title={t("tasks.focusBreadcrumbTitle", { title: taskTooltipTitle })}
                    aria-label={t("tasks.focusBreadcrumbTitle", { title: taskTooltipTitle })}
                  >
                    {breadcrumbTaskSummary}
                  </button>
                </div>
                <span className="shrink-0" title={getStatusUpdatedTooltip(update.timestamp)}>
                  {updateTimeLabel}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const task = entry.task;
    const breadcrumb = getParentBreadcrumb(task);
    const isKeyboardFocused = keyboardFocusedTaskId === task.id;
    const resolvedAuthor =
      peopleById.get(task.author.id.toLowerCase()) ??
      task.author;
    const isPendingPublish = Boolean(isPendingPublishTask?.(task.id));
    const isContentExpanded = Boolean(expandedContentByTaskId[task.id]);

    return (
      <FeedTaskCard
        key={task.id}
        task={task}
        people={people}
        currentUser={currentUser}
        resolvedAuthor={resolvedAuthor}
        breadcrumb={breadcrumb}
        focusedTaskId={focusedTaskId}
        isKeyboardFocused={isKeyboardFocused}
        isMobile={isMobile}
        isSlimDesktop={isSlimDesktop}
        isXLDesktop={isXLDesktop}
        isInteractionBlocked={isInteractionBlocked}
        isPendingPublish={isPendingPublish}
        expandedContent={isContentExpanded}
        timeLabelFormatter={(date) =>
          isMobile ? formatCompactRelativeTime(date) : formatDistanceToNow(date, { addSuffix: true })
        }
        onOpenTaskMedia={openTaskMedia}
        onToggleExpandedContent={(taskId) => {
          setExpandedContentByTaskId((prev) => ({
            ...prev,
            [taskId]: !prev[taskId],
          }));
        }}
        onOpenRawEvent={(event) => {
          setActiveRawEvent(event);
          setRawEventDialogOpen(true);
        }}
        renderPriorityChip={(task) => (
          <FeedPriorityChip
            task={task}
            editable={canCompleteTask(task)}
          />
        )}
        renderDueDateChip={(task) => (
          <FeedDueDateChip
            task={task}
            editable={canCompleteTask(task)}
            dueDateColor={getDueDateColorClass(task.dueDate, task.status)}
          />
        )}
      />
    );
  };

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      <SharedViewComposer
        visible={!isMobile && (authPolicy.canOpenCompose || effectiveForceShowComposer)}
        onCancel={() => {}}
        draftStorageKey={SHARED_COMPOSE_DRAFT_KEY}
        parentId={focusedTaskId || undefined}
        forceExpanded={effectiveForceShowComposer}
        forceExpandSignal={composeGuideActivationSignal}
        mentionRequest={mentionRequest}
        onMentionRequestConsumed={onMentionRequestConsumed}
        composeRestoreRequest={composeRestoreRequest}
        className="relative z-20 border-b border-border px-3 py-3 bg-background/95 backdrop-blur-sm"
        defaultContent={composerDefaultContent}
        allowFeedMessageTypes
      />

      {/* Feed List */}
      <div
        ref={scrollContainerRef}
        className="scrollbar-main-view flex-1"
        data-onboarding="task-list"
        onScroll={handleFeedScroll}
      >
        {displayedFeedEntries.map(renderFeedEntry)}
        {shouldShowScopeFooterHint ? (
          <FilteredEmptyState
            isHydrating={isHydrating}
            searchQuery={searchQuery}
            contextTaskTitle={focusedTask?.content}
            mode="footer"
          />
        ) : null}
      </div>
      <TaskViewMediaLightbox controller={mediaController} onOpenTask={focusTask} />
      <RawNostrEventDialog
        open={rawEventDialogOpen}
        onOpenChange={setRawEventDialogOpen}
        event={activeRawEvent}
      />

      </main>
  );
}
