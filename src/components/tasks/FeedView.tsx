import { startTransition, useDeferredValue, useEffect, useRef, useMemo, useState, useCallback, type UIEvent } from "react";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { Circle, CircleDot, CheckCircle2, MessageSquare, Package, HandHelping, Calendar, Clock, X } from "lucide-react";
import {
  Task,
  Relay,
  Channel,
  ChannelMatchMode,
  Person,
  TaskCreateResult,
  OnNewTask,
  SharedTaskViewContext,
  TaskDateType,
  Nip99ListingStatus,
  ComposeRestoreRequest,
  PublishedAttachment,
  Nip99Metadata,
  TaskStateUpdate,
  TaskStatus,
  RawNostrEvent,
} from "@/types";
import { SharedViewComposer } from "./SharedViewComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getStandaloneEmbeddableUrls, linkifyContent } from "@/lib/linkify";
import { TaskMentionChips, hasTaskMentionChips } from "./TaskMentionChips";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { shouldAutoOpenStatusMenuOnFocus } from "@/lib/status-menu-focus";
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/domain/content/task-permissions";
import { formatAuthorMetaParts } from "@/lib/person-label";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { buildComposePrefillFromFiltersAndContext } from "@/lib/compose-prefill";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
import { getDueDateColorClass } from "@/domain/content/task-sorting";
import { useTranslation } from "react-i18next";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";
import { useTaskViewFiltering } from "@/features/feed-page/controllers/use-task-view-filtering";
import { TaskAttachmentList } from "@/components/tasks/TaskAttachmentList";
import { TaskLocationChip } from "@/components/tasks/TaskLocationChip";
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
import { useTaskMediaPreview } from "@/hooks/use-task-media-preview";
import { TaskMediaLightbox } from "@/components/tasks/TaskMediaLightbox";
import { getCommentCreatedTooltip, getStatusUpdatedTooltip, getTaskCreatedTooltip } from "@/lib/task-timestamp-tooltip";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import {
  handleTaskStatusToggleClick,
  shouldOpenStatusMenuForDirectSelection,
} from "@/lib/task-status-toggle";
import { FilteredEmptyState } from "@/components/tasks/FilteredEmptyState";
import { buildEmptyScopeModel } from "@/lib/empty-scope";
import { HydrationStatusRow } from "@/components/tasks/HydrationStatusRow";
import { TaskDueDateEditorForm, TaskPrioritySelect } from "./TaskMetadataEditors";
import { isRawNostrEventShortcutClick } from "@/lib/raw-nostr-shortcut";
import { RawNostrEventDialog } from "@/components/tasks/RawNostrEventDialog";

function formatCompactRelativeTime(date: Date): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) return "now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d`;
  return format(date, "MMM d");
}

interface FeedViewProps extends SharedTaskViewContext {
  onToggleComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onUpdateDueDate?: (taskId: string, dueDate: Date | undefined, dueTime?: string, dateType?: TaskDateType) => void;
  onUpdatePriority?: (taskId: string, priority: number) => void;
  onListingStatusChange?: (taskId: string, status: Nip99ListingStatus) => void;
  onFocusSidebar?: () => void;
  isMobile?: boolean;
  onSignInClick?: () => void;
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  onUndoPendingPublish?: (taskId: string) => void;
  isPendingPublishTask?: (taskId: string) => boolean;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  isInteractionBlocked?: boolean;
  isHydrating?: boolean;
}

type FeedEntry =
  | { type: "task"; id: string; timestamp: Date; task: Task }
  | { type: "state-update"; id: string; timestamp: Date; task: Task; update: TaskStateUpdate };

const INITIAL_VISIBLE_FEED_ENTRIES = 40;
const FEED_REVEAL_BATCH_SIZE = 30;
const FEED_REVEAL_DELAY_MS = 80;
const FEED_REVEAL_SCROLL_THRESHOLD_PX = 720;

interface FeedDueDateChipProps {
  task: Task;
  editable: boolean;
  dueDateColor: string;
  onUpdateDueDate?: (taskId: string, dueDate: Date | undefined, dueTime?: string, dateType?: TaskDateType) => void;
}

function FeedDueDateChip({
  task,
  editable,
  dueDateColor,
  onUpdateDueDate,
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
            onUpdateDueDate={onUpdateDueDate}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}

interface FeedPriorityChipProps {
  task: Task;
  editable: boolean;
  onUpdatePriority?: (taskId: string, priority: number) => void;
}

function FeedPriorityChip({ task, editable, onUpdatePriority }: FeedPriorityChipProps) {
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
      onUpdatePriority={onUpdatePriority}
    />
  );
}

export function FeedView({
  tasks,
  allTasks,
  relays,
  channels,
  channelMatchMode = "and",
  composeChannels,
  people,
  currentUser,
  searchQuery,
  onNewTask,
  onToggleComplete,
  onStatusChange,
  onUpdateDueDate,
  onUpdatePriority,
  onListingStatusChange,
  focusedTaskId,
  onFocusTask,
  onFocusSidebar,
  isMobile = false,
  onSignInClick,
  onHashtagClick,
  forceShowComposer = false,
  composeGuideActivationSignal,
  onAuthorClick,
  onClearChannelFilter,
  onClearPersonFilter,
  onUndoPendingPublish,
  isPendingPublishTask,
  composeRestoreRequest = null,
  mentionRequest = null,
  isInteractionBlocked = false,
  isHydrating = false,
}: FeedViewProps) {
  const { t, i18n } = useTranslation();
  const getStatusToggleHint = (status?: Task["status"]): string => {
    const alternateKey = getAlternateModifierLabel();
    if (status === "in-progress") return t("hints.statusToggle.inProgress", { alternateKey });
    if (status === "done") return t("hints.statusToggle.done");
    if (status === "closed") return t("hints.statusToggle.closed");
    return t("hints.statusToggle.todo", { alternateKey });
  };

  const SLIM_DESKTOP_QUERY = "(min-width: 768px) and (max-width: 1023px)";
  const truncateMobilePubkey = (value: string): string => {
    if (!isMobile) return value;
    if (value.length <= 18) return value;
    return `${value.slice(0, 10)}…${value.slice(-6)}`;
  };
  const truncateSlimDesktopPubkey = (value: string): string => {
    if (value.length <= 24) return value;
    return `${value.slice(0, 12)}…${value.slice(-8)}`;
  };

  const { user } = useNDK();
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [isSlimDesktop, setIsSlimDesktop] = useState(false);
  const [rawEventDialogOpen, setRawEventDialogOpen] = useState(false);
  const [activeRawEvent, setActiveRawEvent] = useState<RawNostrEvent | null>(null);
  const SHARED_COMPOSE_DRAFT_KEY = COMPOSE_DRAFT_STORAGE_KEY;

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

  const filteredFeedTasks = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    includeFocusedTask: true,
    hideClosedTasks: true,
    searchQuery: deferredSearchQuery,
    people,
    channels,
    channelMatchMode,
  });
  const neutralChannels = useMemo(
    () => channels.map((channel) => ({ ...channel, filterState: "neutral" as const })),
    [channels]
  );
  const unfilteredFeedTasks = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    includeFocusedTask: true,
    hideClosedTasks: true,
    searchQuery: "",
    people,
    channels: neutralChannels,
    channelMatchMode,
  });
  const feedTasks = useMemo(
    () => [...filteredFeedTasks].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    [filteredFeedTasks]
  );
  const allFeedEntries = useMemo<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [];
    for (const task of [...unfilteredFeedTasks].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())) {
      entries.push({ type: "task", id: task.id, timestamp: task.timestamp, task });
      for (const update of task.stateUpdates || []) {
        entries.push({
          type: "state-update",
          id: `${task.id}-state-${update.id}`,
          timestamp: update.timestamp,
          task,
          update,
        });
      }
    }
    return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [unfilteredFeedTasks]);
  const feedEntries = useMemo<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [];
    for (const task of feedTasks) {
      entries.push({ type: "task", id: task.id, timestamp: task.timestamp, task });
      for (const update of task.stateUpdates || []) {
        entries.push({
          type: "state-update",
          id: `${task.id}-state-${update.id}`,
          timestamp: update.timestamp,
          task,
          update,
        });
      }
    }
    return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [feedTasks]);
  const activeChannelFiltersKey = useMemo(
    () => channels
      .filter((channel) => channel.filterState && channel.filterState !== "neutral")
      .map((channel) => `${channel.id}:${channel.filterState}`)
      .sort()
      .join(","),
    [channels]
  );
  const selectedPeopleKey = useMemo(
    () => people
      .filter((person) => person.isSelected)
      .map((person) => person.id)
      .sort()
      .join(","),
    [people]
  );
  const feedDisclosureKey = useMemo(
    () => [
      focusedTaskId || "",
      deferredSearchQuery.trim().toLowerCase(),
      channelMatchMode,
      activeChannelFiltersKey,
      selectedPeopleKey,
    ].join("|"),
    [activeChannelFiltersKey, channelMatchMode, deferredSearchQuery, focusedTaskId, selectedPeopleKey]
  );
  const [visibleEntryCount, setVisibleEntryCount] = useState(INITIAL_VISIBLE_FEED_ENTRIES);
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const peopleById = useMemo(
    () =>
      new Map(
        people.map((person) => [person.id.toLowerCase(), person] as const)
      ),
    [people]
  );
  const scopeModel = useMemo(
    () =>
      buildEmptyScopeModel({
        relays,
        channels,
        people,
        searchQuery: deferredSearchQuery,
        contextTaskTitle: focusedTaskId
          ? taskById.get(focusedTaskId)?.content
          : "",
        locale: i18n.resolvedLanguage || i18n.language || "en",
        t,
      }),
    [channels, deferredSearchQuery, focusedTaskId, i18n.language, i18n.resolvedLanguage, people, relays, t, taskById]
  );
  const hasSourceFeedContent = allFeedEntries.length > 0;
  const shouldShowMobileScopeFallback =
    isMobile && scopeModel.hasActiveFilters && feedEntries.length === 0 && hasSourceFeedContent;
  const activeFeedEntries = shouldShowMobileScopeFallback ? allFeedEntries : feedEntries;
  const displayedFeedEntries = useMemo(
    () => activeFeedEntries.slice(0, visibleEntryCount),
    [activeFeedEntries, visibleEntryCount]
  );
  const shouldShowInlineEmptyHint =
    !isMobile && scopeModel.hasActiveFilters && feedEntries.length === 0 && hasSourceFeedContent;
  const shouldShowScopeFooterHint =
    !isMobile && scopeModel.hasActiveFilters && feedEntries.length > 0;
  const shouldShowScreenEmptyState = feedEntries.length === 0 && !shouldShowMobileScopeFallback && !shouldShowInlineEmptyHint;
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
  } = useTaskMediaPreview(shouldShowMobileScopeFallback ? unfilteredFeedTasks : feedTasks);

  // Task IDs for keyboard navigation
  const taskIds = useMemo(() => feedTasks.map(t => t.id), [feedTasks]);

  // Keyboard navigation
  const { focusedTaskId: keyboardFocusedTaskId } = useTaskNavigation({
    taskIds,
    onSelectTask: (id) => onFocusTask?.(id),
    onGoBack: () => onFocusTask?.(null),
    onFocusSidebar,
    enabled: !isMobile,
  });

  // Scroll focused task into view
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const revealMoreEntries = useCallback((reason: "timer" | "scroll" | "focus") => {
    if (activeFeedEntries.length <= visibleEntryCount) return;
    startTransition(() => {
      setVisibleEntryCount((previous) => {
        const next = Math.min(activeFeedEntries.length, previous + FEED_REVEAL_BATCH_SIZE);
        if (next !== previous) {
          nostrDevLog("feed", "Revealed incremental feed batch", {
            reason,
            visibleEntryCount: next,
            totalEntryCount: activeFeedEntries.length,
          });
        }
        return next;
      });
    });
  }, [activeFeedEntries.length, visibleEntryCount]);

  useEffect(() => {
    startTransition(() => {
      setVisibleEntryCount(INITIAL_VISIBLE_FEED_ENTRIES);
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
      setVisibleEntryCount((previous) => {
        const next = Math.min(activeFeedEntries.length, focusedIndex + 1 + FEED_REVEAL_BATCH_SIZE);
        if (next !== previous) {
          nostrDevLog("feed", "Expanded feed window to include focused task", {
            focusedTaskId,
            visibleEntryCount: next,
            totalEntryCount: activeFeedEntries.length,
          });
        }
        return next;
      });
    });
  }, [activeFeedEntries, focusedTaskId, visibleEntryCount]);

  const handleFeedScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const remainingDistance = container.scrollHeight - (container.scrollTop + container.clientHeight);
    if (remainingDistance > FEED_REVEAL_SCROLL_THRESHOLD_PX) return;
    revealMoreEntries("scroll");
  }, [revealMoreEntries]);

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
    return !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  };
  const getStatusButtonTitle = (task: Task) => {
    if (canCompleteTask(task)) return getStatusToggleHint(task.status);
    return getTaskStatusChangeBlockedReason(task, currentUser, isInteractionBlocked, people) || getStatusToggleHint(task.status);
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
    const breadcrumb: { id: string; text: string }[] = [];
    let current = task;
    while (current.parentId) {
      const parent = taskById.get(current.parentId);
      if (parent) {
        breadcrumb.unshift({
          id: parent.id,
          text: parent.content
        });
        current = parent;
      } else {
        break;
      }
    }
    return breadcrumb;
  };

  const focusedTask = focusedTaskId ? taskById.get(focusedTaskId) || null : null;
  const [statusMenuOpenByTaskId, setStatusMenuOpenByTaskId] = useState<Record<string, boolean>>({});
  const statusTriggerPointerDownTaskIdsRef = useRef<Set<string>>(new Set());
  const allowStatusMenuOpenTaskIdsRef = useRef<Set<string>>(new Set());
  const statusMenuOpenedOnPointerDownTaskIdsRef = useRef<Set<string>>(new Set());

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

  const renderFeedEntry = (entry: FeedEntry) => {
    if (entry.type === "state-update") {
      const { task, update } = entry;
      const resolvedUpdateAuthor =
        peopleById.get(update.authorPubkey.toLowerCase()) || task.author;
      const updateAuthorMeta = formatAuthorMetaParts({
        personId: resolvedUpdateAuthor.id,
        displayName: resolvedUpdateAuthor.displayName,
        username: resolvedUpdateAuthor.name,
      });
      const updateTimeLabel = isMobile
        ? formatCompactRelativeTime(update.timestamp)
        : formatDistanceToNow(update.timestamp, { addSuffix: true });
      const taskSummary = task.content.slice(0, 40) + (task.content.length > 40 ? "..." : "");
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
          onClick={() => onFocusTask?.(task.id)}
          className={cn(
            "border-b border-border px-4 py-1.5 hover:bg-card/50 transition-colors cursor-pointer",
            isMobile && "px-3 py-1.5"
          )}
        >
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
            <div className="min-w-0 flex-1 text-xs text-muted-foreground inline-flex items-center gap-1 overflow-hidden whitespace-nowrap">
              <span>{stateLabel}</span>
              {showStatusDescription && (
                <span className="truncate">{`: ${statusDescription}`}</span>
              )}
              <span className="shrink-0">·</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onFocusTask?.(task.id);
                }}
                className={cn(TASK_INTERACTION_STYLES.hoverLinkText, "font-semibold text-foreground shrink-0")}
                title={t("tasks.focusBreadcrumbTitle", { title: taskSummary })}
                aria-label={t("tasks.focusBreadcrumbTitle", { title: taskSummary })}
              >
                {taskSummary}
              </button>
              <span className="shrink-0">·</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAuthorClick?.(resolvedUpdateAuthor);
                }}
                className="hover:text-foreground shrink-0"
                aria-label={t("tasks.actions.filterAndMention", { authorName: updateAuthorMeta.primary })}
                title={resolvedUpdateAuthor.id}
              >
                {updateAuthorMeta.primary}
              </button>
              <span className="shrink-0">·</span>
              <span className="shrink-0" title={getStatusUpdatedTooltip(update.timestamp)}>
                {updateTimeLabel}
              </span>
            </div>
          </div>
        </div>
      );
    }

    const task = entry.task;
    const isComment = task.taskType === "comment";
    const isListing = Boolean(task.feedMessageType);
    const listingStatus: Nip99ListingStatus = task.nip99?.status === "sold" ? "sold" : "active";
    const isSoldListing = isListing && listingStatus === "sold";
    const isCompletedVisual = isTaskTerminalStatus(task.status) || isSoldListing;
    const feedMessageLabel =
      task.feedMessageType === "offer"
        ? "Offer"
        : task.feedMessageType === "request"
          ? "Request"
          : t("tasks.comment");
    const breadcrumb = getParentBreadcrumb(task);
    const isKeyboardFocused = keyboardFocusedTaskId === task.id;
    const isLockedUntilStart = isTaskLockedUntilStart(task);
    const resolvedAuthor = peopleById.get(task.author.id.toLowerCase()) ?? task.author;
    const authorMeta = formatAuthorMetaParts({
      personId: resolvedAuthor.id,
      displayName: resolvedAuthor.displayName,
      username: resolvedAuthor.name,
    });
    const isPubkeyPrimary = authorMeta.primary === resolvedAuthor.id;
    const primaryAuthorLabelRaw = (() => {
      if (!isPubkeyPrimary) return authorMeta.primary;
      if (isMobile) return truncateMobilePubkey(authorMeta.primary);
      if (isSlimDesktop) return truncateSlimDesktopPubkey(authorMeta.primary);
      return authorMeta.primary;
    })();
    const primaryAuthorLabel =
      isMobile && primaryAuthorLabelRaw.length > 22
        ? `${primaryAuthorLabelRaw.slice(0, 19)}…`
        : primaryAuthorLabelRaw;
    const timeLabel = isMobile
      ? formatCompactRelativeTime(task.timestamp)
      : formatDistanceToNow(task.timestamp, { addSuffix: true });
    const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
    const isPendingPublish = Boolean(isPendingPublishTask?.(task.id));
    const canUpdateListingStatus =
      Boolean(onListingStatusChange) &&
      !isInteractionBlocked &&
      isListing &&
      Boolean(currentUser?.id && currentUser.id.toLowerCase() === task.author.id.toLowerCase());
    const standaloneEmbedUrls = new Set(
      getStandaloneEmbeddableUrls(task.content).map((url) => url.trim().toLowerCase())
    );
    const mediaCaptionByUrl = new Map<string, string>();
    for (const attachment of task.attachments || []) {
      const normalizedUrl = attachment.url?.trim().toLowerCase();
      const caption = attachment.alt?.trim() || attachment.name?.trim();
      if (normalizedUrl && caption) {
        mediaCaptionByUrl.set(normalizedUrl, caption);
      }
    }
    const attachmentsWithoutInlineEmbeds = (task.attachments || []).filter((attachment) => {
      const normalizedUrl = attachment.url?.trim().toLowerCase();
      return !normalizedUrl || !standaloneEmbedUrls.has(normalizedUrl);
    });

    return (
      <div
        key={task.id}
        data-task-id={task.id}
        onClick={(event) => {
          if (task.rawNostrEvent && isRawNostrEventShortcutClick(event)) {
            event.preventDefault();
            event.stopPropagation();
            setActiveRawEvent(task.rawNostrEvent);
            setRawEventDialogOpen(true);
            return;
          }
          onFocusTask?.(task.id);
        }}
        className={cn(
          "border-b border-border hover:bg-card/50 transition-colors cursor-pointer",
          isMobile
            ? "p-3"
            : breadcrumb.length > 0
              ? "px-4 pb-4 pt-2.5"
              : "p-4",
          isCompletedVisual && "opacity-60",
          isLockedUntilStart && "opacity-50 grayscale",
          isKeyboardFocused && "ring-2 ring-primary ring-inset bg-primary/5"
        )}
      >
        {/* Parent breadcrumb - clickable */}
        {breadcrumb.length > 0 && (
          <div className="mb-1.5 flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted-foreground">
            {breadcrumb.map((crumb, i) => (
              <span key={crumb.id} className="flex min-w-0 items-center gap-1">
                {i > 0 && <span className="shrink-0">/</span>}
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onFocusTask?.(crumb.id);
                  }}
                  className={cn(
                    TASK_INTERACTION_STYLES.hoverLinkText,
                    "min-w-0 cursor-pointer truncate whitespace-nowrap text-left",
                    breadcrumb.length > 1 ? "max-w-[18rem] sm:max-w-[22rem]" : "max-w-full"
                  )}
                  title={t("tasks.focusBreadcrumbTitle", { title: crumb.text })}
                  aria-label={t("tasks.focusBreadcrumbTitle", { title: crumb.text })}
                >
                  {crumb.text}
                </button>
              </span>
            ))}
          </div>
        )}

        <div className={cn("flex items-start gap-3", isMobile && "gap-2.5")}>
          {/* Status toggle or comment icon */}
          {!isComment ? (
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
                  onClick={(e) => {
                    if (!canCompleteTask(task)) return;
                    if (statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id)) {
                      e.stopPropagation();
                      return;
                    }
                    handleTaskStatusToggleClick(e, {
                      status: task.status,
                      hasStatusChangeHandler: Boolean(onStatusChange),
                      isMenuOpen: Boolean(statusMenuOpenByTaskId[task.id]),
                      openMenu: () => openStatusMenu(task.id),
                      closeMenu: () => closeStatusMenu(task.id),
                      allowMenuOpen: () => allowStatusMenuOpen(task.id),
                      clearMenuOpenIntent: () => clearStatusMenuOpenIntent(task.id),
                      toggleStatus: () => onToggleComplete(task.id),
                      focusTask: () => onFocusTask?.(task.id),
                    });
                  }}
                  onFocus={(e) => {
                    if (!onStatusChange || !canCompleteTask(task)) return;
                    if (
                      shouldAutoOpenStatusMenuOnFocus(
                        e.currentTarget,
                        statusTriggerPointerDownTaskIdsRef.current.has(task.id)
                      )
                    ) {
                      allowStatusMenuOpen(task.id);
                      openStatusMenu(task.id);
                    }
                    statusTriggerPointerDownTaskIdsRef.current.delete(task.id);
                  }}
                  onPointerDown={() => {
                    statusTriggerPointerDownTaskIdsRef.current.add(task.id);
                    clearStatusMenuOpenIntent(task.id);
                    statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id);
                  }}
                  onPointerDownCapture={(e) => {
                    if (!canCompleteTask(task)) return;
                    if (
                      shouldOpenStatusMenuForDirectSelection({
                        status: task.status,
                        altKey: e.altKey,
                        hasStatusChangeHandler: Boolean(onStatusChange),
                      })
                    ) {
                      e.preventDefault();
                      allowStatusMenuOpen(task.id);
                      statusMenuOpenedOnPointerDownTaskIdsRef.current.add(task.id);
                      openStatusMenu(task.id);
                    }
                  }}
                  onBlur={() => {
                    statusTriggerPointerDownTaskIdsRef.current.delete(task.id);
                    clearStatusMenuOpenIntent(task.id);
                    statusMenuOpenedOnPointerDownTaskIdsRef.current.delete(task.id);
                  }}
                  disabled={!canCompleteTask(task)}
                  aria-label={t("tasks.actions.setStatus")}
                  title={getStatusButtonTitle(task)}
                  className={cn(
                    "flex-shrink-0 mt-0.5 rounded transition-colors",
                    isMobile ? "p-1.5" : "p-0.5",
                    canCompleteTask(task) ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                  )}
                >
                  {task.status === "done" ? (
                    <CheckCircle2 className={cn("text-primary", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                  ) : task.status === "closed" ? (
                    <X className={cn("text-muted-foreground", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                  ) : task.status === "in-progress" ? (
                    <CircleDot className={cn("text-warning", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                  ) : (
                    <Circle className={cn("text-muted-foreground", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                  )}
                </button>
              </DropdownMenuTrigger>
              {onStatusChange && canCompleteTask(task) && (
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      onStatusChange(task.id, "todo");
                    }}
                  >
                    <Circle className="w-4 h-4 mr-2 text-muted-foreground" />
                    {t("listView.status.todo")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      onStatusChange(task.id, "in-progress");
                    }}
                  >
                    <CircleDot className="w-4 h-4 mr-2 text-warning" />
                    {t("listView.status.inProgress")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      onStatusChange(task.id, "done");
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                    {t("listView.status.done")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      onStatusChange(task.id, "closed");
                    }}
                  >
                    <X className="w-4 h-4 mr-2 text-muted-foreground" />
                    {t("listView.status.closed")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              )}
            </DropdownMenu>
          ) : (
            isListing ? (
              <button
                type="button"
                disabled={!canUpdateListingStatus}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!canUpdateListingStatus || !onListingStatusChange) return;
                  onListingStatusChange(task.id, listingStatus === "sold" ? "active" : "sold");
                }}
                title={
                  canUpdateListingStatus
                    ? listingStatus === "sold"
                      ? "Mark listing active"
                      : "Mark listing sold"
                    : listingStatus === "sold"
                      ? "Listing sold"
                      : "Listing active"
                }
                aria-label={listingStatus === "sold" ? "Listing sold" : "Listing active"}
                className={cn(
                  "flex-shrink-0 mt-0.5 rounded transition-colors",
                  isMobile ? "p-1.5" : "p-0.5",
                  canUpdateListingStatus ? "hover:bg-muted cursor-pointer" : "cursor-default"
                )}
              >
                {task.feedMessageType === "offer" ? (
                  <Package
                    className={cn(
                      listingStatus === "sold" ? "text-muted-foreground" : "text-muted-foreground",
                      isMobile ? "w-4 h-4" : "w-5 h-5"
                    )}
                  />
                ) : (
                  <HandHelping
                    className={cn(
                      listingStatus === "sold" ? "text-muted-foreground" : "text-muted-foreground",
                      isMobile ? "w-4 h-4" : "w-5 h-5"
                    )}
                  />
                )}
              </button>
            ) : (
              <MessageSquare className={cn("text-muted-foreground flex-shrink-0 mt-0.5", isMobile ? "w-4 h-4 mx-1.5" : "w-5 h-5")} />
            )
          )}

          {/* Avatar */}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAuthorClick?.(resolvedAuthor);
            }}
            className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label={t("tasks.actions.filterAndMention", { authorName: resolvedAuthor.displayName })}
            title={t("tasks.actions.filterAndMention", { authorName: resolvedAuthor.displayName })}
          >
            <UserAvatar
              id={resolvedAuthor.id}
              displayName={resolvedAuthor.displayName}
              avatarUrl={resolvedAuthor.avatar}
              className={cn("flex-shrink-0", isMobile ? "w-7 h-7" : "w-8 h-8")}
              beamTestId={`feed-beam-${task.id}`}
            />
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div
              className={cn(
                "flex items-center min-w-0 text-muted-foreground mb-1",
                isMobile ? "gap-1 text-xs" : "gap-2 text-sm",
                "flex-wrap"
              )}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAuthorClick?.(resolvedAuthor);
                }}
                className={cn(
                  "font-medium text-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 rounded min-w-0",
                  isMobile && "max-w-[45vw]"
                )}
                aria-label={t("tasks.actions.filterAndMention", { authorName: authorMeta.primary })}
                title={resolvedAuthor.id}
              >
                <span
                  title={authorMeta.primary}
                  data-testid={`feed-author-primary-${task.id}`}
                  className={cn(
                    "truncate",
                    isSlimDesktop ? "block" : "inline-block max-w-full align-bottom"
                  )}
                >
                  {primaryAuthorLabel}
                </span>
                {authorMeta.secondary && !isMobile && (
                  <span
                    data-testid={`feed-author-secondary-${task.id}`}
                    className={cn("opacity-60", isSlimDesktop ? "block" : "inline")}
                  >
                    {isSlimDesktop ? `(${authorMeta.secondary})` : ` (${authorMeta.secondary})`}
                  </span>
                )}
              </button>
              <span className="shrink-0">·</span>
              <span
                className="shrink-0"
                title={isComment ? getCommentCreatedTooltip(task.timestamp) : getTaskCreatedTooltip(task.timestamp)}
              >
                {timeLabel}
              </span>
              {!isComment && typeof task.priority === "number" && (
                <>
                  <span className="shrink-0">·</span>
                  <FeedPriorityChip
                    task={task}
                    editable={canCompleteTask(task)}
                    onUpdatePriority={onUpdatePriority}
                  />
                </>
              )}
              {isComment && !isMobile && (
                <>
                  <span className="shrink-0">·</span>
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{feedMessageLabel}</span>
                  {isListing && (
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        listingStatus === "sold"
                          ? "bg-muted text-muted-foreground line-through"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {listingStatus}
                    </span>
                  )}
                </>
              )}
              {task.dueDate && (
                <>
                  <span className="shrink-0">·</span>
                  <FeedDueDateChip
                    task={task}
                    editable={canCompleteTask(task)}
                    dueDateColor={dueDateColor}
                    onUpdateDueDate={onUpdateDueDate}
                  />
                </>
              )}
              {(hasTaskMentionChips(task) || task.tags.length > 0 || task.locationGeohash) && (
                <>
                  <span className="shrink-0">·</span>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <TaskMentionChips
                      task={task}
                      people={people}
                      onPersonClick={onAuthorClick}
                      inline
                    />
                    {task.locationGeohash && (
                      <TaskLocationChip
                        geohash={task.locationGeohash}
                        className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground"
                      />
                    )}
                    {task.tags.map((tag) => (
                      <button
                        key={tag}
                        data-onboarding="content-hashtag"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onHashtagClick?.(tag);
                        }}
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${TASK_INTERACTION_STYLES.hashtagChip}`}
                        aria-label={`Filter to #${tag}`}
                        title={`Filter to #${tag}`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </span>
                </>
              )}
              {isPendingPublish && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onUndoPendingPublish?.(task.id);
                  }}
                  className="ml-auto shrink-0 text-warning hover:text-warning/80 font-medium"
                  title={t("toasts.actions.undo")}
                >
                  {t("toasts.actions.undo")}
                </button>
              )}
            </div>

            <div
              className={cn(
                `text-sm leading-relaxed whitespace-pre-wrap ${TASK_INTERACTION_STYLES.hoverText}`,
                isCompletedVisual && "line-through text-muted-foreground"
              )}
            >
              {linkifyContent(task.content, onHashtagClick, {
                plainHashtags: isCompletedVisual,
                people,
                onMentionClick: onAuthorClick,
                onStandaloneMediaClick: (url) => openTaskMedia(task.id, url),
                getStandaloneMediaCaption: (url) => mediaCaptionByUrl.get(url.trim().toLowerCase()),
              })}
            </div>
            <TaskAttachmentList
              attachments={attachmentsWithoutInlineEmbeds}
              onMediaClick={(url) => openTaskMedia(task.id, url)}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      {!isMobile && (
        isHydrating ? (
          <HydrationStatusRow />
        ) : focusedTaskId ? (
          <FocusedTaskBreadcrumb
            allTasks={allTasks}
            focusedTaskId={focusedTaskId}
            onFocusTask={onFocusTask}
          />
        ) : null
      )}

      <SharedViewComposer
        visible={!isMobile && (Boolean(user) || forceShowComposer)}
        onSubmit={handleNewTask}
        relays={relays}
        channels={channels}
        composeChannels={composeChannels}
        people={people}
        onCancel={() => {}}
        draftStorageKey={SHARED_COMPOSE_DRAFT_KEY}
        parentId={focusedTaskId || undefined}
        onSignInClick={onSignInClick}
        onClearChannelFilter={onClearChannelFilter}
        onClearPersonFilter={onClearPersonFilter}
        forceExpanded={forceShowComposer}
        forceExpandSignal={composeGuideActivationSignal}
        mentionRequest={mentionRequest}
        composeRestoreRequest={composeRestoreRequest}
        className="relative z-20 border-b border-border px-4 py-3 bg-background/95 backdrop-blur-sm"
        defaultContent={buildComposePrefillFromFiltersAndContext(channels, focusedTask?.tags)}
        allowFeedMessageTypes
      />

      {/* Feed List */}
      <div
        ref={scrollContainerRef}
        className="scrollbar-thin scrollbar-main-view flex-1 overflow-y-auto"
        data-onboarding="task-list"
        onScroll={handleFeedScroll}
      >
        {shouldShowMobileScopeFallback ? (
          <FilteredEmptyState
            variant="feed"
            relays={relays}
            channels={channels}
            people={people}
            searchQuery={searchQuery}
            contextTaskTitle={focusedTask?.content}
            mode="mobile"
          />
        ) : null}
        {shouldShowScreenEmptyState ? (
          <FilteredEmptyState
            variant="feed"
            relays={relays}
            channels={channels}
            people={people}
            searchQuery={searchQuery}
            contextTaskTitle={focusedTask?.content}
          />
        ) : (
          <>
            {displayedFeedEntries.map(renderFeedEntry)}
            {shouldShowScopeFooterHint ? (
              <FilteredEmptyState
                variant="feed"
                relays={relays}
                channels={channels}
                people={people}
                searchQuery={searchQuery}
                contextTaskTitle={focusedTask?.content}
                mode="footer"
              />
            ) : null}
            {shouldShowInlineEmptyHint ? (
              <FilteredEmptyState
                variant="feed"
                relays={relays}
                channels={channels}
                people={people}
                searchQuery={searchQuery}
                contextTaskTitle={focusedTask?.content}
                mode="inline"
              />
            ) : null}
          </>
        )}
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
      <RawNostrEventDialog
        open={rawEventDialogOpen}
        onOpenChange={setRawEventDialogOpen}
        event={activeRawEvent}
      />

    </main>
  );
}
