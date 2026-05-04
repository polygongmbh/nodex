import { useCallback, useEffect, useLayoutEffect, useRef, useMemo, useState, type UIEvent } from "react";
import { MessageSquare, Package, HandHelping, Calendar, Clock } from "lucide-react";
import { TaskStateIcon } from "@/components/tasks/task-state-ui";
import {   Task, ComposeRestoreRequest, RawNostrEvent, getTaskStatusType, normalizeTaskStatus } from "@/types";
import type { Person } from "@/types/person";
import { SharedViewComposer } from "./SharedViewComposer";
import { FeedTaskCard } from "./feed/FeedTaskCard";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { useScrollCapture } from "@/features/feed-page/views/scroll-capture-context";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import { formatAuthorMetaParts } from "@/types/person";
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
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { ScopeFooterHint } from "@/components/tasks/ScopeFooterHint";
import { TaskDueDateEditorForm, TaskPrioritySelect } from "./TaskMetadataEditors";
import { hasTextSelection } from "@/lib/click-intent";
import { RawNostrEventDialog } from "@/components/tasks/RawNostrEventDialog";
import { useFeedViewInteractionModel } from "@/features/feed-page/interactions/feed-view-interaction-context";
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { getTrimmedFirstTaskContentLine } from "@/lib/task-content-preview";
import { formatTimelineTimestamp } from "@/lib/timeline-timestamp";
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
import { InteractivePersonName } from "@/components/people/InteractivePersonName";
import { useFeedHydrationWindow } from "./use-feed-hydration-window";

interface FeedViewProps {
  tasks: Task[];
  allTasks: Task[];
  currentUser?: Person;
  focusedTaskId: string | null;
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

const FEED_REVEAL_SCROLL_THRESHOLD_PX = 2000;
const FEED_REVEAL_SCROLL_THRESHOLD_VIEWPORT_RATIO = 0.75;
const DESKTOP_FEED_ROW_CONTENT_PADDING = "px-3";

interface FeedDueDateChipProps {
  task: Task;
  editable: boolean;
  dueDateColor: string;
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
  if (typeof task.priority !== "number") return null;

  return (
    <TaskPrioritySelect
      id={`feed-priority-${task.id}`}
      taskId={editable ? task.id : undefined}
      priority={task.priority}
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
  focusedTaskId = null,
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
  const { t, i18n } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { authPolicy, focusSidebar, focusTask } = useTaskViewServices();
  const { relays, channels, people, quickFilters, channelMatchMode = "and" } = useFeedSurfaceState();
  const { peopleById } = useFeedPersonLookup();
  const interactionModel = useFeedViewInteractionModel();
  const effectiveForceShowComposer = forceShowComposer ?? interactionModel.forceShowComposer;
  const getStatusToggleHint = (status?: Task["status"]): string => {
    const alternateKey = getAlternateModifierLabel();
    const statusType = getTaskStatusType(status);
    if (statusType === "active") return t("hints.statusToggle.active", { alternateKey });
    if (statusType === "done") return t("hints.statusToggle.done");
    if (statusType === "closed") return t("hints.statusToggle.closed");
    return t("hints.statusToggle.open", { alternateKey });
  };

  const SLIM_DESKTOP_QUERY = "(min-width: 768px) and (max-width: 1023px)";
  const XL_DESKTOP_QUERY = "(min-width: 1280px)";
  const [isSlimDesktop, setIsSlimDesktop] = useState(false);
  const [isXLDesktop, setIsXLDesktop] = useState(false);
  const [rawEventDialogOpen, setRawEventDialogOpen] = useState(false);
  const [activeRawEvent, setActiveRawEvent] = useState<RawNostrEvent | null>(null);
  const {
    searchQuery,
    focusedTask,
    taskById,
    feedTasks,
    feedEntries,
    activeFeedEntries,
    mediaPreviewTasks,
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

  const {
    hasMoreEntries,
    visibleEntryCount,
    revealMoreEntries,
    revealEntriesThroughIndex,
  } = useFeedHydrationWindow({
    focusedTaskId,
    totalEntryCount: activeFeedEntries.length,
  });
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
  const currentScrollTopRef = useRef(0);
  const [pendingScrollTop, setPendingScrollTop] = useState<number | null>(null);
  const scrollCaptureRef = useScrollCapture();
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => { currentScrollTopRef.current = el.scrollTop; };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);
  useEffect(() => {
    scrollCaptureRef.current = {
      getScrollTop: () => currentScrollTopRef.current,
      setScrollTop: setPendingScrollTop,
    };
    return () => { scrollCaptureRef.current = null; };
  }, [scrollCaptureRef]);
  useLayoutEffect(() => {
    if (pendingScrollTop !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = pendingScrollTop;
      currentScrollTopRef.current = pendingScrollTop;
      setPendingScrollTop(null);
    }
  }, [pendingScrollTop]);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  const getRevealThresholdPx = (container: HTMLDivElement) =>
    Math.max(
      FEED_REVEAL_SCROLL_THRESHOLD_PX,
      Math.round(container.clientHeight * FEED_REVEAL_SCROLL_THRESHOLD_VIEWPORT_RATIO)
    );

  const isWithinRevealThreshold = (container: HTMLDivElement) => {
    const remainingDistance = container.scrollHeight - (container.scrollTop + container.clientHeight);
    return remainingDistance <= getRevealThresholdPx(container);
  };

  useEffect(() => {
    if (!focusedTaskId) return;
    const focusedIndex = activeFeedEntries.findIndex(
      (entry) => entry.type === "task" && entry.task.id === focusedTaskId
    );
    if (focusedIndex === -1 || focusedIndex < visibleEntryCount) return;
    nostrDevLog("feed", "Expanded feed window to include focused task", {
      focusedTaskId,
      visibleEntryCount: focusedIndex + 1,
      totalEntryCount: activeFeedEntries.length,
    });
    revealEntriesThroughIndex(focusedIndex);
  }, [activeFeedEntries, focusedTaskId, revealEntriesThroughIndex, visibleEntryCount]);

  const handleFeedScroll = (event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if (!isWithinRevealThreshold(container)) return;
    revealMoreEntries("scroll");
  };

  useEffect(() => {
    if (!hasMoreEntries) return;
    const root = scrollContainerRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        revealMoreEntries("scroll");
      },
      {
        root,
        rootMargin: `0px 0px ${getRevealThresholdPx(root)}px 0px`,
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasMoreEntries, revealMoreEntries, visibleEntryCount]);

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

  const canCompleteTask = useCallback((task: Task) => {
    return !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  }, [currentUser, isInteractionBlocked]);
  const getStateLabel = (status: Task["status"]) => t(`status.${status || "open"}`);
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
  const timeLabelFormatter = useCallback(
    (date: Date) => formatTimelineTimestamp(date, i18n.resolvedLanguage),
    [i18n.resolvedLanguage]
  );
  const handleToggleExpandedContent = useCallback((taskId: string) => {
    setExpandedContentByTaskId((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  }, []);
  const handleOpenRawEvent = useCallback((event: RawNostrEvent) => {
    setActiveRawEvent(event);
    setRawEventDialogOpen(true);
  }, []);
  const renderPriorityChip = useCallback((task: Task) => (
    <FeedPriorityChip
      task={task}
      editable={canCompleteTask(task) && !isTaskTerminalStatus(task.status)}
    />
  ), [canCompleteTask]);
  const renderDueDateChip = useCallback((task: Task) => (
    <FeedDueDateChip
      task={task}
      editable={canCompleteTask(task)}
      dueDateColor={getDueDateColorClass(task.dueDate, task.status)}
    />
  ), [canCompleteTask]);

  const renderFeedEntry = (entry: FeedEntry) => {
    if (entry.type === "state-update" && entry.update) {
      const { task, update } = entry;
      const resolvedUpdateAuthor =
        peopleById.get(update.authorPubkey.toLowerCase()) ||
        task.author;
      const updateAuthorMeta = formatAuthorMetaParts({
        pubkey: resolvedUpdateAuthor.pubkey,
        displayName: resolvedUpdateAuthor.displayName,
        name: resolvedUpdateAuthor.name,
      });
      const updateAuthorUserFacingId = toUserFacingPubkey(resolvedUpdateAuthor.pubkey);
      const updateTimeLabel = formatTimelineTimestamp(update.timestamp, i18n.resolvedLanguage);
      const breadcrumbTaskSummary = formatBreadcrumbLabel(task.content);
      const taskTooltipTitle = getTrimmedFirstTaskContentLine(task.content) || breadcrumbTaskSummary;
      const normalizedUpdateStatus = normalizeTaskStatus(update.status);
      const typeLabel = getStateLabel(normalizedUpdateStatus.type);
      const statusDescription = normalizedUpdateStatus.description?.trim();
      const isDefaultInProgressDescription =
        normalizedUpdateStatus.type === "active" &&
        normalizeLabelText(statusDescription) === normalizeLabelText("In Progress");
      // Prefer the specific state description (e.g. "Backlog") over the generic type label
      // ("Open"). Fall back to the type label when there is no meaningful description.
      const displayLabel =
        statusDescription && !isDefaultInProgressDescription ? statusDescription : typeLabel;

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
              <TaskStateIcon
                status={update.status}
                size={isMobile ? "w-3 h-3" : "w-3.5 h-3.5"}
                className="flex-shrink-0"
              />
              <div className="min-w-0 flex-1 text-xs text-muted-foreground inline-flex items-center gap-2">
                <div className="min-w-0 inline-flex flex-1 items-center gap-1 overflow-hidden whitespace-nowrap">
                  <span className="truncate">{displayLabel}</span>
                  <span className="shrink-0">·</span>
                  <span className="shrink-0 text-foreground">
                    <InteractivePersonName person={resolvedUpdateAuthor}>
                      {updateAuthorMeta.primary}
                    </InteractivePersonName>
                  </span>
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
                <span className="ml-auto shrink-0 text-right" title={getStatusUpdatedTooltip(update.timestamp)}>
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
      peopleById.get(task.author.pubkey.toLowerCase()) ??
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
        isActiveTask={focusedTaskId === task.id}
        isKeyboardFocused={isKeyboardFocused}
        isMobile={isMobile}
        isSlimDesktop={isSlimDesktop}
        isXLDesktop={isXLDesktop}
        isInteractionBlocked={isInteractionBlocked}
        isPendingPublish={isPendingPublish}
        expandedContent={isContentExpanded}
        timeLabelFormatter={timeLabelFormatter}
        onOpenTaskMedia={openTaskMedia}
        onToggleExpandedContent={handleToggleExpandedContent}
        onOpenRawEvent={handleOpenRawEvent}
        renderPriorityChip={renderPriorityChip}
        renderDueDateChip={renderDueDateChip}
      />
    );
  };

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      {!isMobile && (authPolicy.canOpenCompose || effectiveForceShowComposer) && (
        <SharedViewComposer
          onCancel={() => {}}
          focusedTaskId={focusedTaskId}
          forceExpanded={effectiveForceShowComposer}
          forceExpandSignal={composeGuideActivationSignal}
          mentionRequest={mentionRequest}
          onMentionRequestConsumed={onMentionRequestConsumed}
          composeRestoreRequest={composeRestoreRequest}
          className="relative z-20 border-b border-border px-3 py-3 bg-background/95 backdrop-blur-sm"
          defaultContent={composerDefaultContent}
          allowFeedMessageTypes
        />
      )}

      {/* Feed List */}
      <div
        ref={scrollContainerRef}
        className="scrollbar-main-view flex-1 overflow-y-auto"
        style={pendingScrollTop !== null ? { overflowAnchor: "none" } : undefined}
        data-onboarding="task-list"
        onScroll={handleFeedScroll}
      >
        {displayedFeedEntries.map(renderFeedEntry)}
        {hasMoreEntries ? (
          <div className="flex justify-center px-4 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t("feed.loadingMoreEvents")}
            </p>
          </div>
        ) : null}
        {hasMoreEntries ? <div ref={loadMoreSentinelRef} aria-hidden="true" className="h-px w-full" /> : null}
        {shouldShowScopeFooterHint && !hasMoreEntries && !isHydrating ? (
          <ScopeFooterHint />
        ) : null}
      </div>
      {mediaController.activeMediaIndex !== null && (
        <TaskViewMediaLightbox controller={mediaController} onOpenTask={focusTask} />
      )}
      <RawNostrEventDialog
        open={rawEventDialogOpen}
        onOpenChange={setRawEventDialogOpen}
        event={activeRawEvent}
      />

      </main>
  );
}
