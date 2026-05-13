import { memo, useMemo, type ReactNode } from "react";
import { BadgeCheck, MessageSquare, Package } from "lucide-react";
import { isCommentKind, isListingKind } from "@/domain/content/task-kind";
import { getTaskStateToneClass } from "@/components/tasks/task-state-ui";
import { TaskStatusToggle } from "@/components/tasks/task-card/TaskStatusToggle";
import { TaskAttachmentList } from "@/components/tasks/TaskAttachmentList";
import { TaskTagChipInline, hasTaskMetadataChips } from "@/components/tasks/TaskTagChipRow";
import { TaskBreadcrumbRow } from "@/components/tasks/task-card/TaskBreadcrumbRow";
import { TaskSurface } from "@/components/tasks/task-card/TaskSurface";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { getStandaloneEmbeddableUrls, renderTaskContentWithProjectHeading } from "@/lib/linkify";
import { cn } from "@/lib/utils";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { isRawNostrEventShortcutClick } from "@/lib/raw-nostr-shortcut";
import { hasTextSelection } from "@/lib/click-intent";
import { isTaskTerminal } from "@/domain/content/task-state";
import { getTaskTooltipPreview, shouldCollapseTaskContent } from "@/lib/task-content-preview";
import { formatAuthorMetaParts } from "@/types/person";
import { toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { isTaskLockedUntilStart } from "@/lib/task-dates";
import { getCommentCreatedTooltip, getTaskCreatedTooltip } from "@/lib/task-timestamp-tooltip";
import { useTranslation } from "react-i18next";
import { type Nip99ListingStatus, type RawNostrEvent, type Task, getTaskState } from "@/types";
import type { Person } from "@/types/person";
import { InteractivePersonAvatar } from "@/components/people/InteractivePersonAvatar";
import { InteractivePersonName } from "@/components/people/InteractivePersonName";
import { ReactionsRow } from "@/components/tasks/ReactionsRow";
import { FeedTaskMenu } from "@/components/tasks/feed/FeedTaskMenu";
import { FeedTaskSwipeActions } from "@/components/tasks/feed/FeedTaskSwipeActions";
import { useReactions } from "@/features/feed-page/controllers/use-reactions";
import { useReactionsFor } from "@/features/feed-page/stores/reactions-registry";
import { useFeedTaskCommands } from "@/features/feed-page/controllers/feed-task-commands-context";

interface FeedTaskCardProps {
  task: Task;
  people: Person[];
  currentUser?: Person;
  resolvedAuthor: Person;
  breadcrumb: { id: string; text: string }[];
  isActiveTask: boolean;
  isKeyboardFocused: boolean;
  isMobile: boolean;
  isSlimDesktop: boolean;
  isXLDesktop: boolean;
  isInteractionBlocked: boolean;
  isPendingPublish: boolean;
  isNip05Verified: boolean;
  isProject: boolean;
  hasChildren: boolean;
  expandedContent: boolean;
  timeLabelFormatter: (date: Date) => string;
  onOpenTaskMedia: (taskId: string, url: string) => void;
  onToggleExpandedContent: (taskId: string) => void;
  onOpenRawEvent: (event: RawNostrEvent) => void;
  renderPriorityChip: (task: Task) => ReactNode;
  renderDueDateChip: (task: Task) => ReactNode;
}

export const FeedTaskCard = memo(function FeedTaskCard({
  task,
  people,
  currentUser,
  resolvedAuthor,
  breadcrumb,
  isActiveTask,
  isKeyboardFocused,
  isMobile,
  isSlimDesktop,
  isXLDesktop,
  isInteractionBlocked,
  isPendingPublish,
  isNip05Verified,
  isProject,
  hasChildren,
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
  const { react: publishReaction } = useReactions();
  const reactions = useReactionsFor(task.id);
  const taskCommands = useFeedTaskCommands();
  const hasAnyReaction = Object.keys(reactions?.totals ?? {}).length > 0;
  const handleMenuReact = (emoji: string) => {
    void publishReaction({ id: task.id, kind: task.kind, pubkey: task.author.pubkey }, emoji);
  };
  const { focusTask } = useTaskViewServices();
  const { relays } = useFeedSurfaceState();
  const activeRelayCount = relays.filter((relay) => relay.isActive).length;
  const NPUB_DISPLAY_PATTERN = /npub1[023456789acdefghjklmnpqrstuvwxyz…]+/i;
  const formatFeedNpubLabel = (value: string, showFull: boolean): string => {
    if (showFull || value.length <= 11) return value;
    return `${value.slice(0, 8)}…${value.slice(-3)}`;
  };
  const isListing = isListingKind(task.kind);
  const isComment = isCommentKind(task.kind);
  const listingStatus: Nip99ListingStatus = task.nip99?.status === "sold" ? "sold" : "active";
  const isSoldListing = isListing && listingStatus === "sold";
  const isCompletedVisual = isTaskTerminal(getTaskState(task)) || isSoldListing;
  const isLockedUntilStart = isTaskLockedUntilStart(task);
  const feedMessageLabel = isListing ? t("tasks.listing.label") : t("tasks.comment");
  const listingSoldLabel = t("tasks.listing.sold");
  const authorMeta = formatAuthorMetaParts({
    pubkey: resolvedAuthor.pubkey,
    displayName: resolvedAuthor.displayName,
    name: resolvedAuthor.name,
  });
  const authorUserFacingId = toUserFacingPubkey(resolvedAuthor.pubkey);
  const isPubkeyPrimary =
    authorMeta.primary === resolvedAuthor.pubkey ||
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
  const canUpdateListingStatus =
    !isInteractionBlocked &&
    isListing &&
    Boolean(currentUser?.pubkey && currentUser.pubkey.toLowerCase() === task.author.pubkey.toLowerCase());
  const standaloneEmbedUrls = useMemo(
    () => new Set(getStandaloneEmbeddableUrls(task.content).map((url) => url.trim().toLowerCase())),
    [task.content]
  );
  const mediaCaptionByUrl = useMemo(() => {
    const captionByUrl = new Map<string, string>();
    for (const attachment of task.attachments || []) {
      const normalizedUrl = attachment.url?.trim().toLowerCase();
      const caption = attachment.alt?.trim() || attachment.name?.trim();
      if (normalizedUrl && caption) {
        captionByUrl.set(normalizedUrl, caption);
      }
    }
    return captionByUrl;
  }, [task.attachments]);
  const attachmentsWithoutInlineEmbeds = useMemo(
    () =>
      (task.attachments || []).filter((attachment) => {
        const normalizedUrl = attachment.url?.trim().toLowerCase();
        return !normalizedUrl || !standaloneEmbedUrls.has(normalizedUrl);
      }),
    [standaloneEmbedUrls, task.attachments]
  );
  const linkedContent = useMemo(
    () =>
      renderTaskContentWithProjectHeading(task.content, isProject, (tag) => {
        void dispatchFeedInteraction({ type: "filter.applyHashtagInclude", tag });
      }, {
        plainHashtags: isCompletedVisual,
        people,
        disableStandaloneEmbeds: hasCollapsibleContent && !expandedContent && !isActiveTask,
        onStandaloneMediaClick: (url) => onOpenTaskMedia(task.id, url),
        getStandaloneMediaCaption: (url) => mediaCaptionByUrl.get(url.trim().toLowerCase()),
      }),
    [
      dispatchFeedInteraction,
      expandedContent,
      hasCollapsibleContent,
      isActiveTask,
      isCompletedVisual,
      isProject,
      mediaCaptionByUrl,
      onOpenTaskMedia,
      people,
      task.content,
      task.id,
    ]
  );

  const tooltipPreview = getTaskTooltipPreview(task.content);
  const tooltipTypeLabel = isComment ? t("tasks.comment").toLowerCase() : t("tasks.task").toLowerCase();
  const surfaceTitle = tooltipPreview
    ? t("tasks.focusTaskWithPreview", { type: tooltipTypeLabel, preview: tooltipPreview })
    : t("tasks.focusTaskTitle", { type: tooltipTypeLabel });

  const surface = (
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
        `group/feed-card border-b border-border transition-colors cursor-pointer ${TASK_INTERACTION_STYLES.cardSurface}`,
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
            <TaskStatusToggle
              task={task}
              currentUser={currentUser}
              people={people}
              buttonClassName={cn("flex-shrink-0 mt-0.5", isMobile ? "p-1" : "p-0.5")}
              iconSize="w-5 h-5"
            />
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
                    ? t("tasks.listing.clickToReactivate", { type: feedMessageLabel })
                    : t("tasks.listing.clickToClose", { type: feedMessageLabel })
                  : listingStatus === "sold"
                    ? listingSoldLabel
                    : feedMessageLabel
              }
              aria-label={listingStatus === "sold" ? listingSoldLabel : feedMessageLabel}
              className={cn(
                "flex-shrink-0 mt-0.5 rounded transition-colors",
                isMobile ? "p-1" : "p-0.5",
                canUpdateListingStatus ? "hover:bg-muted cursor-pointer" : "cursor-default"
              )}
            >
              <Package className={cn("text-muted-foreground", "w-5 h-5")} />
            </button>
          ) : (
            <span
              title={t("tasks.listing.commentBy", { author: authorMeta.primary })}
              className={cn("flex-shrink-0 mt-0.5 inline-flex items-center justify-center", isMobile ? "p-1" : "p-0.5")}
            >
              <MessageSquare className={cn("text-muted-foreground", "w-5 h-5")} />
            </span>
          )}
          <InteractivePersonAvatar
            person={resolvedAuthor}
            sizeClassName={isMobile ? "w-7 h-7" : "w-8 h-8"}
            ariaLabel={t("people.actions.openMenu", { name: authorMeta.primary })}
            // On mobile the timeline behaves like the other views — a tap
            // immediately filters by this person rather than opening the
            // menu. Desktop keeps the menu as the primary affordance.
            directFilterOnClick={false}
          />
          <div className="flex-1 min-w-0">
            <div className={cn("mb-1 flex min-w-0 items-start text-muted-foreground", isMobile ? "gap-1 text-xs" : "gap-2 text-sm")}>
              <div className={cn("min-w-0 flex-1 flex-wrap items-center", isMobile ? "gap-1" : "gap-2", "inline-flex")}>
                {hasPrimaryAuthorLabel ? (
                  <>
                    <InteractivePersonName
                      person={resolvedAuthor}
                    >
                      <span title={authorMeta.primary} data-testid={`feed-author-primary-${task.id}`} className="inline-block max-w-full align-bottom truncate font-medium text-foreground">
                        {primaryAuthorLabel}
                      </span>
                      {isNip05Verified ? (
                        <BadgeCheck
                          className="inline-block align-middle h-3.5 w-3.5 ml-0.5 text-blue-500"
                          aria-label={t("people.nip05Verified")}
                        >
                          {resolvedAuthor.nip05 ? <title>{resolvedAuthor.nip05}</title> : null}
                        </BadgeCheck>
                      ) : null}
                      {secondaryAuthorLabel && !isMobile ? (
                        <span data-testid={`feed-author-secondary-${task.id}`} className="opacity-60 inline">
                          {` (${secondaryAuthorLabel})`}
                        </span>
                      ) : null}
                    </InteractivePersonName>
                    <span className="shrink-0">·</span>
                  </>
                ) : null}
                {!isComment && typeof task.priority === "number" ? (
                  <>
                    {renderPriorityChip(task)}
                    <span className="shrink-0">·</span>
                  </>
                ) : null}
                {isComment && isListing && listingStatus === "sold" && !isMobile ? (
                  <>
                    <span className="text-xs bg-muted text-muted-foreground line-through px-1.5 py-0.5 rounded">
                      {listingSoldLabel}
                    </span>
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
              ) : !isMobile ? (
                <FeedTaskMenu
                  task={task}
                  currentUserPubkey={currentUser?.pubkey}
                  hasChildren={hasChildren}
                  onReact={handleMenuReact}
                  onCopyPermalink={() => taskCommands.copyPermalink(task.id)}
                  onRecompose={() => taskCommands.recomposePost(task.id)}
                  onDelete={() => { void taskCommands.deletePost(task.id); }}
                  pinned={isActiveTask}
                  className="shrink-0"
                />
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
              {linkedContent}
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
            {hasAnyReaction ? (
              <ReactionsRow
                targetId={task.id}
                reactions={reactions}
                onReact={handleMenuReact}
                className="mt-1"
              />
            ) : null}
          </div>
        </div>
      </div>
    </TaskSurface>
  );

  if (!isMobile || isPendingPublish) return surface;
  return (
    <FeedTaskSwipeActions
      task={task}
      currentUserPubkey={currentUser?.pubkey}
      hasChildren={hasChildren}
      onReact={() => handleMenuReact("👍")}
      onCopyPermalink={() => { void taskCommands.copyPermalink(task.id); }}
      onRecompose={() => taskCommands.recomposePost(task.id)}
      onDelete={() => { void taskCommands.deletePost(task.id); }}
    >
      {surface}
    </FeedTaskSwipeActions>
  );
});
