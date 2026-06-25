import { memo, useEffect, useMemo, type ReactNode } from "react";
import { Calendar as CalendarIcon, MessageSquare, Package } from "lucide-react";
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
import { renderTaskContentWithProjectHeading } from "@/lib/linkify";
import { useTaskMediaAttachments } from "@/lib/use-task-media-attachments";
import { cn } from "@/lib/utils";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { isRawNostrEventShortcutClick } from "@/lib/raw-nostr-shortcut";
import { hasTextSelection } from "@/lib/click-intent";
import { isTaskTerminal } from "@/domain/content/task-state";
import { shouldCollapseTaskContent, TASK_CONTENT_COLLAPSED_CLASS } from "@/lib/task-content-preview";
import { TaskShowMoreToggle } from "@/components/tasks/task-card/TaskShowMoreToggle";
import { getFocusTaskTooltip } from "@/lib/task-focus-tooltip";
import { getCompactPersonLabel } from "@/types/person";
import { getTaskDisabledClasses } from "@/lib/task-style";
import { getCommentCreatedTooltip, getTaskCreatedTooltip } from "@/lib/task-timestamp-tooltip";
import { useTranslation } from "react-i18next";
import {
  type Nip99ListingStatus,
  type RawNostrEvent,
  type Post,
  getTaskState,
  getTaskPrimaryDate,
  isListingPost,
  isCalendarEventPost,
  getTaskPriority,
} from "@/types";
import { getRawEvent } from "@/stores/raw-events";
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
  task: Post;
  people: Person[];
  currentUser?: Person;
  resolvedAuthor: Person;
  breadcrumb: { id: string; text: string }[];
  isActiveTask: boolean;
  isKeyboardFocused: boolean;
  isMobile: boolean;
  isInteractionBlocked: boolean;
  isPendingPublish: boolean;
  isProject: boolean;
  hasChildren: boolean;
  expandedContent: boolean;
  timeLabelFormatter: (date: Date) => string;
  onOpenTaskMedia: (taskId: string, url: string) => void;
  onToggleExpandedContent: (taskId: string) => void;
  onOpenRawEvent: (event: RawNostrEvent) => void;
  renderPriorityChip: (task: Post) => ReactNode;
  renderDueDateChip: (task: Post) => ReactNode;
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
  isInteractionBlocked,
  isPendingPublish,
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
  const { react: publishReaction, unreact: publishUnreact, ensureReactionsFetched } = useReactions();
  const reactions = useReactionsFor(task.id);
  useEffect(() => {
    void ensureReactionsFetched(task.id);
  }, [task.id, ensureReactionsFetched]);
  const taskCommands = useFeedTaskCommands();
  const hasAnyReaction = Object.keys(reactions?.totals ?? {}).length > 0;
  const handleMenuReact = (emoji: string) => {
    void publishReaction({ id: task.id, kind: task.kind, pubkey: task.pubkey }, emoji);
  };
  const handleMenuUnreact = (emoji: string) => {
    void publishUnreact(task.id, emoji);
  };
  const { focusTask } = useTaskViewServices();
  const { relays } = useFeedSurfaceState();
  const activeRelayCount = relays.filter((relay) => relay.isActive).length;
  const isListing = isListingKind(task.kind);
  const isComment = isCommentKind(task.kind);
  const isEvent = isCalendarEventPost(task);
  const listingStatus: Nip99ListingStatus =
    isListingPost(task) && task.nip99.status === "sold" ? "sold" : "active";
  const isSoldListing = isListing && listingStatus === "sold";
  const isCompletedVisual = isTaskTerminal(getTaskState(task)) || isSoldListing;
  const feedMessageLabel = isListing ? t("tasks.listing.label") : t("tasks.comment");
  const listingSoldLabel = t("tasks.listing.sold");
  const authorCompactLabel = getCompactPersonLabel(resolvedAuthor);
  const timeLabel = timeLabelFormatter(task.timestamp);
  const hasCollapsibleContent = shouldCollapseTaskContent(task.content);
  const canUpdateListingStatus =
    !isInteractionBlocked &&
    isListing &&
    Boolean(currentUser?.pubkey && currentUser.pubkey.toLowerCase() === task.pubkey.toLowerCase());
  const { standaloneEmbedUrls, mediaCaptionByUrl, attachmentsWithoutInlineEmbeds } =
    useTaskMediaAttachments(task);
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

  const surfaceTitle = getFocusTaskTooltip(t, task);

  const surface = (
    <TaskSurface
      taskId={task.id}
      title={surfaceTitle}
      onClick={(event) => {
        const rawEvent = getRawEvent(task.id);
        if (rawEvent && isRawNostrEventShortcutClick(event)) {
          event.preventDefault();
          event.stopPropagation();
          onOpenRawEvent(rawEvent);
          return;
        }
        if (hasTextSelection()) return;
        focusTask(task.id);
      }}
      className={cn(
        `group/feed-card border-b border-border transition-colors cursor-pointer ${TASK_INTERACTION_STYLES.cardSurface}`,
        isMobile ? "py-3" : breadcrumb.length > 0 ? "pb-4 pt-2.5" : "py-4",
        getTaskDisabledClasses(task, { completedOverride: isCompletedVisual }),
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
          {isEvent ? (
            <span
              title={t("tasks.event.label")}
              className={cn("flex-shrink-0 mt-0.5 inline-flex items-center justify-center", isMobile ? "p-1" : "p-0.5")}
            >
              <CalendarIcon className={cn("text-muted-foreground", "w-5 h-5")} />
            </span>
          ) : !isComment ? (
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
              title={t("tasks.listing.commentBy", { author: authorCompactLabel })}
              className={cn("flex-shrink-0 mt-0.5 inline-flex items-center justify-center", isMobile ? "p-1" : "p-0.5")}
            >
              <MessageSquare className={cn("text-muted-foreground", "w-5 h-5")} />
            </span>
          )}
          <InteractivePersonAvatar
            person={resolvedAuthor}
            sizeClassName={isMobile ? "w-7 h-7" : "w-8 h-8"}
            ariaLabel={t("people.actions.openMenu", { name: authorCompactLabel })}
            // On mobile the timeline behaves like the other views — a tap
            // immediately filters by this person rather than opening the
            // menu. Desktop keeps the menu as the primary affordance.
            directFilterOnClick={false}
          />
          <div className="flex-1 min-w-0">
            <div className={cn("mb-1 flex min-w-0 items-start text-muted-foreground", isMobile ? "gap-1 text-xs" : "gap-2 text-sm")}>
              <div className={cn("min-w-0 flex-1 flex-wrap items-center", isMobile ? "gap-1" : "gap-2", "inline-flex")}>
                <InteractivePersonName
                  person={resolvedAuthor}
                  withHandle={!isMobile}
                  testId={`feed-author-primary-${task.id}`}
                />
                <span className="shrink-0">·</span>
                {!isComment && typeof getTaskPriority(task) === "number" ? (
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
                {getTaskPrimaryDate(task) ? (
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
              ) : !isMobile && currentUser ? (
                <FeedTaskMenu
                  task={task}
                  currentUserPubkey={currentUser.pubkey}
                  hasChildren={hasChildren}
                  onReact={handleMenuReact}
                  onCopyPermalink={() => taskCommands.copyPermalink(task.id)}
                  onRecompose={() => taskCommands.recomposePost(task.id)}
                  onDelete={() => { void taskCommands.deletePost(task.id); }}
                  className="shrink-0"
                />
              ) : null}
            </div>
            <div
              className={cn(
                `text-sm leading-relaxed ${TASK_INTERACTION_STYLES.hoverText}`,
                hasCollapsibleContent && !expandedContent && !isActiveTask
                  ? TASK_CONTENT_COLLAPSED_CLASS
                  : "whitespace-pre-wrap",
                isCompletedVisual && "line-through text-muted-foreground"
              )}
            >
              {linkedContent}
            </div>
            {hasCollapsibleContent && !isActiveTask ? (
              <TaskShowMoreToggle
                isExpanded={expandedContent}
                onToggle={() => onToggleExpandedContent(task.id)}
              />
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
                onUnreact={handleMenuUnreact}
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
      onReact={handleMenuReact}
      onCopyPermalink={() => { void taskCommands.copyPermalink(task.id); }}
      onDelete={() => { void taskCommands.deletePost(task.id); }}
    >
      {surface}
    </FeedTaskSwipeActions>
  );
});
