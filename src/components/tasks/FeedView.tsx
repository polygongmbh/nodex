import { useEffect, useRef, useMemo, useState } from "react";
import { useNDK } from "@/lib/nostr/ndk-context";
import { Circle, CircleDot, CheckCircle2, MessageSquare, Calendar, Clock } from "lucide-react";
import { Task, Relay, Channel, Person, TaskCreateResult, TaskDateType } from "@/types";
import { SharedViewComposer } from "./SharedViewComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { UserAvatar } from "@/components/ui/user-avatar";
import { linkifyContent } from "@/lib/linkify";
import { TaskMentionChips, hasTaskMentionChips } from "./TaskMentionChips";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { shouldAutoOpenStatusMenuOnFocus } from "@/lib/status-menu-focus";
import { canUserChangeTaskStatus } from "@/lib/task-permissions";
import { formatAuthorMetaParts } from "@/lib/person-label";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { taskMatchesTextQuery } from "@/lib/task-text-filter";
import { buildComposePrefillFromFiltersAndContext } from "@/lib/compose-prefill";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
import { getDueDateColorClass } from "@/lib/taskSorting";
import { useTranslation } from "react-i18next";
import { isMacOSPlatform } from "@/lib/keyboard-platform";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  relays: Relay[];
  channels: Channel[];
  composeChannels?: Channel[];
  people: Person[];
  currentUser?: Person;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewTask: (
    content: string,
    tags: string[],
    relays: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    parentId?: string,
    initialStatus?: "todo" | "in-progress" | "done",
    explicitMentionPubkeys?: string[],
    priority?: number
  ) => Promise<TaskCreateResult> | TaskCreateResult;
  onToggleComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
  onFocusSidebar?: () => void;
  isMobile?: boolean;
  onSignInClick?: () => void;
  onHashtagClick?: (tag: string) => void;
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  onAuthorClick?: (author: Person) => void;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
}

export function FeedView({
  tasks,
  allTasks,
  relays,
  channels,
  composeChannels,
  people,
  currentUser,
  searchQuery,
  onNewTask,
  onToggleComplete,
  onStatusChange,
  focusedTaskId,
  onFocusTask,
  onFocusSidebar,
  isMobile = false,
  onSignInClick,
  onHashtagClick,
  forceShowComposer = false,
  composeGuideActivationSignal,
  onAuthorClick,
  mentionRequest = null,
}: FeedViewProps) {
  const { t } = useTranslation();
  const getStatusToggleHint = (status?: Task["status"]): string => {
    const alternateKey = isMacOSPlatform()
      ? t("hints.modifiers.optionAlt")
      : t("hints.modifiers.alt");
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
  const includedChannels = channels.filter(c => c.filterState === "included").map(c => c.name.toLowerCase());
  const excludedChannels = channels.filter(c => c.filterState === "excluded").map(c => c.name.toLowerCase());

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

  // Get all descendants of a task
  const getDescendantIds = (taskId: string): Set<string> => {
    const ids = new Set<string>();
    const addDescendants = (id: string) => {
      allTasks.filter(t => t.parentId === id).forEach(child => {
        ids.add(child.id);
        addDescendants(child.id);
      });
    };
    addDescendants(taskId);
    return ids;
  };

  // Flatten and filter all tasks chronologically
  // Use pre-filtered tasks from Index, then apply local filters
  const filteredTaskIds = new Set(tasks.map(t => t.id));
  
  const feedTasks = allTasks
    .filter(task => {
      // Must be in pre-filtered tasks (relay/person filtering already applied)
      if (!filteredTaskIds.has(task.id)) return false;

      // If focused on a task, only show that task and its descendants
      if (focusedTaskId) {
        if (task.id !== focusedTaskId) {
          const descendantIds = getDescendantIds(focusedTaskId);
          if (!descendantIds.has(task.id)) return false;
        }
      }

      // Apply search filter
      if (!taskMatchesTextQuery(task, searchQuery, people)) {
        return false;
      }
      // Apply channel exclusion filter
      if (excludedChannels.length > 0) {
        const taskTagsLower = task.tags.map(t => t.toLowerCase());
        if (taskTagsLower.some(t => excludedChannels.includes(t))) {
          return false;
        }
      }
      // Apply channel inclusion filter - AND logic: must have ALL included channels
      if (includedChannels.length > 0) {
        const taskTagsLower = task.tags.map(t => t.toLowerCase());
        if (!includedChannels.every(c => taskTagsLower.includes(c))) {
          return false;
        }
      }
      
      return true;
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

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
    priority?: number
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
      priority
    ));
  };

  const canCompleteTask = (task: Task) => {
    return canUserChangeTaskStatus(task, currentUser);
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
        className="relative z-20 border-b border-border px-4 py-3 bg-background/95 backdrop-blur-sm"
        defaultContent={buildComposePrefillFromFiltersAndContext(channels, focusedTask?.tags)}
      />

      {/* Feed List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto" data-onboarding="task-list">
        {feedTasks.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>No tasks to show</p>
          </div>
        ) : (
          feedTasks.map((task) => {
            const timeAgo = formatDistanceToNow(task.timestamp, { addSuffix: true });
            const isComment = task.taskType === "comment";
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

            return (
              <div
                key={task.id}
                data-task-id={task.id}
                className={cn(
                  "border-b border-border p-4 hover:bg-card/50 transition-colors",
                  isMobile && "p-3",
                  task.status === "done" && "opacity-60",
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
                          onClick={() => onFocusTask?.(crumb.id)}
                          className={`${TASK_INTERACTION_STYLES.hoverLinkText} cursor-pointer`}
                          title={`Focus task: ${crumb.text}`}
                          aria-label={`Focus task: ${crumb.text}`}
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
                          aria-label="Set status"
                          title={getStatusToggleHint(task.status)}
                          className={cn(
                            "flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors",
                            canCompleteTask(task) ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                          )}
                        >
                          {task.status === "done" ? (
                            <CheckCircle2 className={cn("text-primary", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                          ) : task.status === "in-progress" ? (
                            <CircleDot className={cn("text-amber-500", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                          ) : (
                            <Circle className={cn("text-muted-foreground", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      {onStatusChange && canCompleteTask(task) && (
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, "todo")}>
                            <Circle className="w-4 h-4 mr-2 text-muted-foreground" />
                            To Do
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, "in-progress")}>
                            <CircleDot className="w-4 h-4 mr-2 text-amber-500" />
                            In Progress
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, "done")}>
                            <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                            Done
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      )}
                    </DropdownMenu>
                  ) : (
                    <MessageSquare className={cn("text-muted-foreground flex-shrink-0 mt-0.5", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                  )}

                  {/* Avatar */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAuthorClick?.(resolvedAuthor);
                    }}
                    className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50"
                    aria-label={`Filter and mention ${resolvedAuthor.displayName}`}
                    title={`Filter and mention ${resolvedAuthor.displayName}`}
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
                        isMobile ? "gap-1 text-xs whitespace-nowrap" : "gap-2 text-sm"
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
                        aria-label={`Filter and mention ${authorMeta.primary}`}
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
                          <span className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
                            P{task.priority}
                          </span>
                        </>
                      )}
                      {isComment && !isMobile && (
                        <>
                          <span className="shrink-0">·</span>
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">comment</span>
                        </>
                      )}
                    </div>

                    {/* Clickable content to focus */}
                    <p
                      onClick={() => onFocusTask?.(task.id)}
                      className={cn(
                        `text-sm leading-relaxed cursor-pointer ${TASK_INTERACTION_STYLES.hoverText}`,
                        task.status === "done" && "line-through text-muted-foreground"
                      )}
                      title="Focus this task"
                    >
                      {linkifyContent(task.content, onHashtagClick, {
                        plainHashtags: task.status === "done",
                        people,
                        onMentionClick: onAuthorClick,
                      })}
                    </p>

                    {/* Due date */}
                    {task.dueDate && (
                      <div className={cn("flex items-center gap-2 text-xs mt-2", dueDateColor)}>
                        <Calendar className="w-3 h-3" />
                        <span className="uppercase tracking-wide">{getTaskDateTypeLabel(task.dateType)}</span>
                        <span>{format(task.dueDate, "MMM d, yyyy")}</span>
                        {task.dueTime && (
                          <>
                            <Clock className="w-3 h-3 ml-1" />
                            <span>{task.dueTime}</span>
                          </>
                        )}
                      </div>
                    )}

                    {(hasTaskMentionChips(task) || task.tags.length > 0) && (
                      <div className={cn("flex flex-wrap gap-1", task.dueDate ? "mt-1.5" : "mt-2")}>
                        <TaskMentionChips
                          task={task}
                          people={people}
                          onPersonClick={onAuthorClick}
                          inline
                        />
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
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

    </main>
  );
}
