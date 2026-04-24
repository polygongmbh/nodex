import { HandHelping, MessageSquare, Package } from "lucide-react";
import { TaskStateIcon, TaskStateDefIcon, getTaskStateToneClass } from "@/components/tasks/task-state-ui";
import { getTaskStateRegistry } from "@/domain/task-states/task-state-config";
import type { ReactNode } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskAttachmentList } from "@/components/tasks/TaskAttachmentList";
import { TaskTagChipInline, hasTaskMetadataChips } from "@/components/tasks/TaskTagChipRow";
import { TaskBreadcrumbRow } from "@/components/tasks/task-card/TaskBreadcrumbRow";
import { TaskSurface } from "@/components/tasks/task-card/TaskSurface";
import { useTaskStatusMenu } from "@/components/tasks/task-card/use-task-status-menu";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { getStandaloneEmbeddableUrls, linkifyContent } from "@/lib/linkify";
import { cn } from "@/lib/utils";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { isRawNostrEventShortcutClick } from "@/lib/raw-nostr-shortcut";
import { hasTextSelection } from "@/lib/click-intent";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { getTaskTooltipPreview, shouldCollapseTaskContent } from "@/lib/task-content-preview";
import { formatAuthorMetaParts } from "@/types/person";
import { toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";
import { isTaskLockedUntilStart } from "@/lib/task-dates";
import { getCommentCreatedTooltip, getTaskCreatedTooltip } from "@/lib/task-timestamp-tooltip";
import { useTranslation } from "react-i18next";
import { getTaskStatus, type Nip99ListingStatus, type RawNostrEvent, type Task } from "@/types";
import type { Person } from "@/types/person";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";
import { getPersonShortcutIntent, toPersonShortcutInteraction } from "@/components/people/person-shortcuts";

interface FeedTaskCardProps {
  task: Task;
  people: Person[];
  currentUser?: Person;
  resolvedAuthor: Person;
  breadcrumb: { id: string; text: string }[];
  focusedTaskId: string | null;
  isKeyboardFocused: boolean;
  isMobile: boolean;
  isSlimDesktop: boolean;
  isXLDesktop: boolean;
  isInteractionBlocked: boolean;
  isPendingPublish: boolean;
  expandedContent: boolean;
  timeLabelFormatter: (date: Date) => string;
  onOpenTaskMedia: (taskId: string, url: string) => void;
  onToggleExpandedContent: (taskId: string) => void;
  onOpenRawEvent: (event: RawNostrEvent) => void;
  renderPriorityChip: (task: Task) => ReactNode;
  renderDueDateChip: (task: Task) => ReactNode;
}

export function FeedTaskCard({
  task,
  people,
  currentUser,
  resolvedAuthor,
  breadcrumb,
  focusedTaskId,
  isKeyboardFocused,
  isMobile,
  isSlimDesktop,
  isXLDesktop,
  isInteractionBlocked,
  isPendingPublish,
  expandedContent,
  timeLabelFormatter,
  onOpenTaskMedia,
  onToggleExpandedContent,
  onOpenRawEvent,
  renderPriorityChip,
  renderDueDateChip,
}: FeedTaskCardProps) {
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { focusTask } = useTaskViewServices();
  const { relays } = useFeedSurfaceState();
  const activeRelayCount = relays.filter((relay) => relay.isActive).length;
  const getStatusToggleHint = (status?: Task["status"]): string => {
    const alternateKey = getAlternateModifierLabel();
    if (status === "active") return t("hints.statusToggle.active", { alternateKey });
    if (status === "done") return t("hints.statusToggle.done");
    if (status === "closed") return t("hints.statusToggle.closed");
    return t("hints.statusToggle.open", { alternateKey });
  };
  const NPUB_DISPLAY_PATTERN = /npub1[023456789acdefghjklmnpqrstuvwxyz…]+/i;
  const handleAuthorShortcut = (event: React.MouseEvent<HTMLElement>, person: Person) => {
    event.stopPropagation();
    const shortcutIntent = getPersonShortcutIntent(event);
    if (!shortcutIntent) return;
    event.preventDefault();
    void dispatchFeedInteraction(toPersonShortcutInteraction(person, shortcutIntent));
  };
  const formatFeedNpubLabel = (value: string, showFull: boolean): string => {
    if (showFull || value.length <= 11) return value;
    return `${value.slice(0, 8)}…${value.slice(-3)}`;
  };
  const {
    canCompleteTask,
    statusMenuOpen,
    statusButtonTitle,
    triggerProps,
    handleOpenChange,
    dispatchStatusChange,
  } = useTaskStatusMenu({
    task,
    currentUser,
    people,
    isInteractionBlocked,
    getStatusToggleHint,
  });
  const isComment = task.taskType === "comment";
  const isListing = Boolean(task.feedMessageType);
  const listingStatus: Nip99ListingStatus = task.nip99?.status === "sold" ? "sold" : "active";
  const isSoldListing = isListing && listingStatus === "sold";
  const isCompletedVisual = isTaskTerminalStatus(task.status) || isSoldListing;
  const isLockedUntilStart = isTaskLockedUntilStart(task);
  const feedMessageLabel =
    task.feedMessageType === "offer"
      ? "Offer"
      : task.feedMessageType === "request"
        ? "Request"
        : t("tasks.comment");
  const authorMeta = formatAuthorMetaParts({
    id: resolvedAuthor.id,
    displayName: resolvedAuthor.displayName,
    name: resolvedAuthor.name,
  });
  const authorUserFacingId = toUserFacingPubkey(resolvedAuthor.id);
  const isPubkeyPrimary =
    authorMeta.primary === resolvedAuthor.id ||
    authorMeta.primary === authorUserFacingId;
  const displayNpub = formatFeedNpubLabel(authorUserFacingId, isXLDesktop);
  const primaryAuthorLabel = isPubkeyPrimary ? displayNpub : authorMeta.primary;
  const hasPrimaryAuthorLabel = primaryAuthorLabel.length > 0;
  const secondaryAuthorLabel = (() => {
    if (!authorMeta.secondary) return "";
    if (!NPUB_DISPLAY_PATTERN.test(authorMeta.secondary)) return authorMeta.secondary;
    if (isSlimDesktop) {
      return authorMeta.secondary
        .replace(NPUB_DISPLAY_PATTERN, "")
        .replace(/\s*[·•]\s*$/, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    return authorMeta.secondary.replace(NPUB_DISPLAY_PATTERN, displayNpub);
  })();
  const timeLabel = timeLabelFormatter(task.timestamp);
  const hasCollapsibleContent = shouldCollapseTaskContent(task.content);
  const isActiveTask = focusedTaskId === task.id;
  const canUpdateListingStatus =
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

  const tooltipPreview = getTaskTooltipPreview(task.content);
  const tooltipTypeLabel = isComment ? t("tasks.comment").toLowerCase() : t("tasks.task").toLowerCase();
  const surfaceTitle = tooltipPreview
    ? t("tasks.focusTaskWithPreview", { type: tooltipTypeLabel, preview: tooltipPreview })
    : t("tasks.focusTaskTitle", { type: tooltipTypeLabel });

  return (
    <TaskSurface
      taskId={task.id}
      title={surfaceTitle}
      onClick={(event) => {
        if (task.rawNostrEvent && isRawNostrEventShortcutClick(event)) {
          event.preventDefault();
          event.stopPropagation();
          onOpenRawEvent(task.rawNostrEvent);
          return;
        }
        if (hasTextSelection()) return;
        focusTask(task.id);
      }}
      className={cn(
        `border-b border-border transition-colors cursor-pointer ${TASK_INTERACTION_STYLES.cardSurface}`,
        isMobile ? "py-3" : breadcrumb.length > 0 ? "pb-4 pt-2.5" : "py-4",
        isCompletedVisual && "opacity-60",
        isLockedUntilStart && "opacity-50 grayscale",
        isKeyboardFocused && "ring-2 ring-primary ring-inset bg-primary/5"
      )}
    >
      <div className={cn(isMobile ? "px-3" : "px-3")}>
        <TaskBreadcrumbRow
          breadcrumbs={breadcrumb}
          onFocusTask={focusTask}
          className="mb-1.5 overflow-hidden"
          itemClassName="min-w-0"
          separator="/"
        />
        <div className={cn("flex items-start gap-3", isMobile && "gap-2.5")}>
          {!isComment ? (
            <DropdownMenu
              open={statusMenuOpen}
              onOpenChange={handleOpenChange}
            >
              <DropdownMenuTrigger asChild>
                <button
                  {...triggerProps}
                  disabled={!canCompleteTask}
                  aria-label={t("tasks.actions.setStatus")}
                  title={statusButtonTitle}
                  className={cn(
                    "flex-shrink-0 mt-0.5 rounded transition-colors",
                    isMobile ? "p-1" : "p-0.5",
                    canCompleteTask ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                  )}
                >
                  <TaskStateIcon
                    status={getTaskStatus(task)}
                    size={isMobile ? "w-5 h-5" : "w-5 h-5"}
                  />
                </button>
              </DropdownMenuTrigger>
              {canCompleteTask ? (
                <DropdownMenuContent align="start">
                  {getTaskStateRegistry().map((state) => (
                    <DropdownMenuItem key={state.id} onClick={(event) => { event.stopPropagation(); dispatchStatusChange(state.id); }}>
                      <TaskStateDefIcon state={state} className="mr-2" />
                      {state.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              ) : null}
            </DropdownMenu>
          ) : isListing ? (
            <button
              type="button"
              disabled={!canUpdateListingStatus}
              onClick={(event) => {
                event.stopPropagation();
                if (!canUpdateListingStatus) return;
                void dispatchFeedInteraction({
                  type: "task.listingStatus.change",
                  taskId: task.id,
                  status: listingStatus === "sold" ? "active" : "sold",
                });
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
                isMobile ? "p-1" : "p-0.5",
                canUpdateListingStatus ? "hover:bg-muted cursor-pointer" : "cursor-default"
              )}
            >
              {task.feedMessageType === "offer" ? (
                <Package className={cn("text-muted-foreground", "w-5 h-5")} />
              ) : (
                <HandHelping className={cn("text-muted-foreground", "w-5 h-5")} />
              )}
            </button>
          ) : (
            <MessageSquare className={cn("text-muted-foreground flex-shrink-0 mt-0.5", isMobile ? "w-5 h-5 mx-1" : "w-5 h-5")} />
          )}
          <PersonHoverCard person={resolvedAuthor}>
            <button
              type="button"
              className="rounded-full transition-shadow hover:ring-2 hover:ring-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label={t("people.actions.openMenu", { name: authorMeta.primary })}
              onClick={(event) => handleAuthorShortcut(event, resolvedAuthor)}
            >
              <UserAvatar
                id={resolvedAuthor.id}
                displayName={resolvedAuthor.displayName}
                avatarUrl={resolvedAuthor.avatar}
                className={cn("flex-shrink-0", isMobile ? "w-7 h-7" : "w-8 h-8")}
                beamTestId={`feed-beam-${task.id}`}
              />
            </button>
          </PersonHoverCard>
          <div className="flex-1 min-w-0">
            <div className={cn("mb-1 flex min-w-0 items-start text-muted-foreground", isMobile ? "gap-1 text-xs" : "gap-2 text-sm")}>
              <div className={cn("min-w-0 flex-1 flex-wrap items-center", isMobile ? "gap-1" : "gap-2", "inline-flex")}>
                {hasPrimaryAuthorLabel ? (
                  <>
                    <PersonHoverCard person={resolvedAuthor}>
                      <button
                        type="button"
                        className={cn(
                          "font-medium text-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 rounded min-w-0",
                          isMobile && "max-w-full"
                        )}
                        aria-label={t("people.actions.openMenu", { name: authorMeta.primary })}
                        onClick={(event) => handleAuthorShortcut(event, resolvedAuthor)}
                      >
                        <span title={authorMeta.primary} data-testid={`feed-author-primary-${task.id}`} className="inline-block max-w-full align-bottom truncate">
                          {primaryAuthorLabel}
                        </span>
                        {secondaryAuthorLabel && !isMobile ? (
                          <span data-testid={`feed-author-secondary-${task.id}`} className="opacity-60 inline">
                            {` (${secondaryAuthorLabel})`}
                          </span>
                        ) : null}
                      </button>
                    </PersonHoverCard>
                    <span className="shrink-0">·</span>
                  </>
                ) : null}
                {!isComment && typeof task.priority === "number" ? (
                  <>
                    {renderPriorityChip(task)}
                    <span className="shrink-0">·</span>
                  </>
                ) : null}
                {isComment && !isMobile ? (
                  <>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{feedMessageLabel}</span>
                    {isListing ? (
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
                    ) : null}
                    <span className="shrink-0">·</span>
                  </>
                ) : null}
                {task.dueDate ? (
                  <>
                    {renderDueDateChip(task)}
                    <span className="shrink-0">·</span>
                  </>
                ) : null}
                {hasTaskMetadataChips(task, activeRelayCount) ? (
                  <>
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <TaskTagChipInline task={task} people={people} showEmptyPlaceholder={false} />
                    </span>
                  </>
                ) : null}
              </div>
              <span
                className="ml-auto shrink-0 text-right"
                title={isComment ? getCommentCreatedTooltip(task.timestamp) : getTaskCreatedTooltip(task.timestamp)}
              >
                {timeLabel}
              </span>
              {isPendingPublish ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void dispatchFeedInteraction({ type: "task.undoPendingPublish", taskId: task.id });
                  }}
                  className="ml-auto shrink-0 text-warning hover:text-warning/80 font-medium"
                  title={t("composer:toasts.actions.undo")}
                >
                  {t("composer:toasts.actions.undo")}
                </button>
              ) : null}
            </div>
            <div
              className={cn(
                `text-sm leading-relaxed ${TASK_INTERACTION_STYLES.hoverText}`,
                hasCollapsibleContent && !expandedContent && !isActiveTask
                  ? "whitespace-pre-line line-clamp-3 overflow-hidden"
                  : "whitespace-pre-wrap",
                isCompletedVisual && "line-through text-muted-foreground"
              )}
            >
              {linkifyContent(task.content, (tag) => {
                void dispatchFeedInteraction({ type: "filter.applyHashtagExclusive", tag });
              }, {
                plainHashtags: isCompletedVisual,
                people,
                disableStandaloneEmbeds: hasCollapsibleContent && !expandedContent && !isActiveTask,
                onStandaloneMediaClick: (url) => onOpenTaskMedia(task.id, url),
                getStandaloneMediaCaption: (url) => mediaCaptionByUrl.get(url.trim().toLowerCase()),
              })}
            </div>
            {hasCollapsibleContent && !isActiveTask ? (
              <button
                type="button"
                className="mt-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpandedContent(task.id);
                }}
              >
                {expandedContent ? t("tasks.actions.showLess") : t("tasks.actions.showMore")}
              </button>
            ) : null}
            <TaskAttachmentList
              attachments={attachmentsWithoutInlineEmbeds}
              onMediaClick={(url) => onOpenTaskMedia(task.id, url)}
            />
          </div>
        </div>
      </div>
    </TaskSurface>
  );
}
