import { useEffect, useRef, useMemo, useState } from "react";
import { useNDK } from "@/lib/nostr/ndk-context";
import { Circle, CircleDot, CheckCircle2, MessageSquare, Package, HandHelping, Calendar, Clock } from "lucide-react";
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
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/lib/task-permissions";
import { formatAuthorMetaParts } from "@/lib/person-label";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { buildComposePrefillFromFiltersAndContext } from "@/lib/compose-prefill";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
import { getDueDateColorClass } from "@/lib/taskSorting";
import { useTranslation } from "react-i18next";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";
import { useTaskViewFiltering } from "@/hooks/use-task-view-filtering";
import { TaskAttachmentList } from "@/components/tasks/TaskAttachmentList";
import { TaskLocationChip } from "@/components/tasks/TaskLocationChip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTaskMediaPreview } from "@/hooks/use-task-media-preview";
import { TaskMediaLightbox } from "@/components/tasks/TaskMediaLightbox";

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
  onStatusChange?: (taskId: string, status: "todo" | "in-progress" | "done") => void;
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
}

type FeedEntry =
  | { type: "task"; id: string; timestamp: Date; task: Task }
  | { type: "state-update"; id: string; timestamp: Date; task: Task; update: TaskStateUpdate };

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
  onUndoPendingPublish,
  isPendingPublishTask,
  composeRestoreRequest = null,
  mentionRequest = null,
  isInteractionBlocked = false,
}: FeedViewProps) {
  const { t } = useTranslation();
  const getStatusToggleHint = (status?: Task["status"]): string => {
    const alternateKey = getAlternateModifierLabel();
    if (status === "in-progress") return t("hints.statusToggle.inProgress", { alternateKey });
    if (status === "done") return t("hints.statusToggle.done");
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
  const [isSlimDesktop, setIsSlimDesktop] = useState(false);
  const SHARED_COMPOSE_DRAFT_KEY = "nodex.compose-draft.feed-tree";

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
    searchQuery,
    people,
    channels,
    channelMatchMode,
  });
  const feedTasks = useMemo(
    () => [...filteredFeedTasks].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    [filteredFeedTasks]
  );
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
  } = useTaskMediaPreview(feedTasks);

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
    if (status === "in-progress") return t("listView.status.inProgress");
    return t("listView.status.todo");
  };

  const getParentBreadcrumb = (task: Task): { id: string; text: string }[] => {
    const breadcrumb: { id: string; text: string }[] = [];
    let current = task;
    while (current.parentId) {
      const parent = allTasks.find(t => t.id === current.parentId);
      if (parent) {
        breadcrumb.unshift({
          id: parent.id,
          text: parent.content.slice(0, 20) + (parent.content.length > 20 ? "..." : "")
        });
        current = parent;
      } else {
        break;
      }
    }
    return breadcrumb;
  };

  const focusedTask = focusedTaskId ? allTasks.find(t => t.id === focusedTaskId) : null;
  const [statusMenuOpenByTaskId, setStatusMenuOpenByTaskId] = useState<Record<string, boolean>>({});
  const statusTriggerPointerDownTaskIdsRef = useRef<Set<string>>(new Set());
  const allowStatusMenuOpenTaskIdsRef = useRef<Set<string>>(new Set());

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

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      {!isMobile && focusedTaskId && (
        <FocusedTaskBreadcrumb
          allTasks={allTasks}
          focusedTaskId={focusedTaskId}
          onFocusTask={onFocusTask}
        />
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
        forceExpanded={forceShowComposer}
        forceExpandSignal={composeGuideActivationSignal}
        mentionRequest={mentionRequest}
        composeRestoreRequest={composeRestoreRequest}
        className="relative z-20 border-b border-border px-4 py-3 bg-background/95 backdrop-blur-sm"
        defaultContent={buildComposePrefillFromFiltersAndContext(channels, focusedTask?.tags)}
        allowFeedMessageTypes
      />

      {/* Feed List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto" data-onboarding="task-list">
        {feedEntries.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>{t("tasks.empty.feed")}</p>
          </div>
        ) : (
          feedEntries.map((entry) => {
            if (entry.type === "state-update") {
              const { task, update } = entry;
              const resolvedUpdateAuthor =
                people.find((person) => person.id.toLowerCase() === update.authorPubkey.toLowerCase()) || task.author;
              const updateAuthorMeta = formatAuthorMetaParts({
                personId: resolvedUpdateAuthor.id,
                displayName: resolvedUpdateAuthor.displayName,
                username: resolvedUpdateAuthor.name,
              });
              const updateTimeLabel = isMobile
                ? formatCompactRelativeTime(update.timestamp)
                : formatDistanceToNow(update.timestamp, { addSuffix: true });
              const taskSummary = task.content.slice(0, 40) + (task.content.length > 40 ? "..." : "");

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
                    ) : update.status === "in-progress" ? (
                      <CircleDot className={cn("text-warning flex-shrink-0", isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} />
                    ) : (
                      <Circle className={cn("text-muted-foreground flex-shrink-0", isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} />
                    )}
                    <div className="min-w-0 flex-1 text-xs text-muted-foreground inline-flex items-center gap-1 overflow-hidden whitespace-nowrap">
                      <span className="font-medium text-foreground">{getStateLabel(update.status)}</span>
                      {update.statusDescription && (
                        <span className="truncate">{` ${update.statusDescription}`}</span>
                      )}
                      <span className="shrink-0">·</span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onFocusTask?.(task.id);
                        }}
                        className={cn(TASK_INTERACTION_STYLES.hoverLinkText, "font-medium shrink-0")}
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
                      <span className="shrink-0">{updateTimeLabel}</span>
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
            const isCompletedVisual = task.status === "done" || isSoldListing;
            const feedMessageLabel =
              task.feedMessageType === "offer"
                ? "Offer"
                : task.feedMessageType === "request"
                  ? "Request"
                  : t("tasks.comment");
            const breadcrumb = getParentBreadcrumb(task);
            const isKeyboardFocused = keyboardFocusedTaskId === task.id;
            const isLockedUntilStart = isTaskLockedUntilStart(task);
            const resolvedAuthor = people.find((person) => person.id === task.author.id) ?? task.author;
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
                onClick={() => onFocusTask?.(task.id)}
                className={cn(
                  "border-b border-border p-4 hover:bg-card/50 transition-colors cursor-pointer",
                  isMobile && "p-3",
                  isCompletedVisual && "opacity-60",
                  isLockedUntilStart && "opacity-50 grayscale",
                  isKeyboardFocused && "ring-2 ring-primary ring-inset bg-primary/5"
                )}
              >
                {/* Parent breadcrumb - clickable */}
                {breadcrumb.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    {breadcrumb.map((crumb, i) => (
                      <span key={crumb.id} className="flex items-center gap-1">
                        {i > 0 && <span>/</span>}
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onFocusTask?.(crumb.id);
                          }}
                          className={`${TASK_INTERACTION_STYLES.hoverLinkText} cursor-pointer`}
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
                          return;
                        }
                        if (allowStatusMenuOpenTaskIdsRef.current.has(task.id)) {
                          openStatusMenu(task.id);
                        } else {
                          closeStatusMenu(task.id);
                        }
                        clearStatusMenuOpenIntent(task.id);
                      }}
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => {
                            if (!canCompleteTask(task)) return;
                            if (task.status === "done" && onStatusChange) {
                              const isMenuOpen = Boolean(statusMenuOpenByTaskId[task.id]);
                              if (isMenuOpen) {
                                closeStatusMenu(task.id);
                                clearStatusMenuOpenIntent(task.id);
                              } else {
                                allowStatusMenuOpen(task.id);
                                openStatusMenu(task.id);
                              }
                              return;
                            }
                            if (e.altKey && onStatusChange) {
                              allowStatusMenuOpen(task.id);
                              openStatusMenu(task.id);
                              return;
                            }
                            closeStatusMenu(task.id);
                            clearStatusMenuOpenIntent(task.id);
                            onToggleComplete(task.id);
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
                          }}
                          onBlur={() => {
                            statusTriggerPointerDownTaskIdsRef.current.delete(task.id);
                            clearStatusMenuOpenIntent(task.id);
                          }}
                          disabled={!canCompleteTask(task)}
                          aria-label={t("tasks.actions.setStatus")}
                          title={getStatusButtonTitle(task)}
                          className={cn(
                            "flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors",
                            canCompleteTask(task) ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                          )}
                        >
                          {task.status === "done" ? (
                            <CheckCircle2 className={cn("text-primary", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                          ) : task.status === "in-progress" ? (
                            <CircleDot className={cn("text-warning", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                          ) : (
                            <Circle className={cn("text-muted-foreground", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      {onStatusChange && canCompleteTask(task) && (
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, "todo")}>
                            <Circle className="w-4 h-4 mr-2 text-muted-foreground" />
                            {t("listView.status.todo")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, "in-progress")}>
                            <CircleDot className="w-4 h-4 mr-2 text-warning" />
                            {t("listView.status.inProgress")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, "done")}>
                            <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                            {t("listView.status.done")}
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
                          "flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors",
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
                      <MessageSquare className={cn("text-muted-foreground flex-shrink-0 mt-0.5", isMobile ? "w-4 h-4" : "w-5 h-5")} />
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
                      <span className="shrink-0">{timeLabel}</span>
                      {!isComment && typeof task.priority === "number" && (
                        <>
                          <span className="shrink-0">·</span>
                          <span className="text-xs bg-warning/15 text-warning px-1.5 py-0.5 rounded">
                            P{task.priority}
                          </span>
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
                          <span className={cn("inline-flex items-center gap-1", dueDateColor)}>
                            <Calendar className="w-3 h-3" />
                            <span className="uppercase tracking-wide">{getTaskDateTypeLabel(task.dateType)}</span>
                            <span>{format(task.dueDate, "MMM d, yyyy")}</span>
                            {task.dueTime && (
                              <>
                                <Clock className="w-3 h-3 ml-1" />
                                <span>{task.dueTime}</span>
                              </>
                            )}
                          </span>
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

                    {/* Clickable content to focus */}
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
          })
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

    </main>
  );
}
