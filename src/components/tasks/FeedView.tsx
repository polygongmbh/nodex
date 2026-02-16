import { useEffect, useRef, useMemo, useState } from "react";
import { useNDK } from "@/lib/nostr/ndk-context";
import { Search, Circle, CircleDot, CheckCircle2, MessageSquare, Calendar, Clock } from "lucide-react";
import { Task, Relay, Channel, Person } from "@/types";
import { TaskComposer } from "./TaskComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { UserAvatar } from "@/components/ui/user-avatar";
import { linkifyContent } from "@/lib/linkify";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { shouldAutoOpenStatusMenuOnFocus } from "@/lib/status-menu-focus";
import { canUserChangeTaskStatus } from "@/lib/task-permissions";
import { formatAuthorMetaParts } from "@/lib/person-label";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FeedViewProps {
  tasks: Task[];
  allTasks: Task[];
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  currentUser?: Person;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewTask: (content: string, tags: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string, parentId?: string, initialStatus?: "todo" | "in-progress" | "done") => void;
  onToggleComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
  onFocusSidebar?: () => void;
  isMobile?: boolean;
  onSignInClick?: () => void;
  onHashtagClick?: (tag: string) => void;
  forceShowComposer?: boolean;
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
  people,
  currentUser,
  searchQuery,
  onSearchChange,
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
  onAuthorClick,
  mentionRequest = null,
}: FeedViewProps) {
  const truncateMobilePubkey = (value: string): string => {
    if (!isMobile) return value;
    if (value.length <= 18) return value;
    return `${value.slice(0, 10)}…${value.slice(-6)}`;
  };

  const { user } = useNDK();
  const SHARED_COMPOSE_DRAFT_KEY = "nodex.compose-draft.feed-tree";
  const includedChannels = channels.filter(c => c.filterState === "included").map(c => c.name.toLowerCase());
  const excludedChannels = channels.filter(c => c.filterState === "excluded").map(c => c.name.toLowerCase());

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
      if (searchQuery && !task.content.toLowerCase().includes(searchQuery.toLowerCase())) {
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

  const handleNewTask = (content: string, taskTags: string[], taskRelays: string[], taskType: string, dueDate?: Date, dueTime?: string) => {
    onNewTask(content, taskTags, taskRelays, taskType, dueDate, dueTime, focusedTaskId || undefined);
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

      {/* Top composer - hidden on mobile */}
      {!isMobile && (user || forceShowComposer) && (
        <div
          className="border-b border-border px-4 py-3 bg-background/95 backdrop-blur-sm"
          data-onboarding="focused-compose"
        >
          <TaskComposer
            onSubmit={handleNewTask}
            relays={relays}
            channels={channels}
            people={people}
            onCancel={() => {}}
            compact
            adaptiveSize
            draftStorageKey={SHARED_COMPOSE_DRAFT_KEY}
            parentId={focusedTaskId || undefined}
            onSignInClick={onSignInClick}
            forceExpanded={forceShowComposer}
            mentionRequest={mentionRequest}
            defaultContent={(() => {
              const prefillChannels = new Set<string>();
              channels.filter(c => c.filterState === "included").forEach(c => prefillChannels.add(c.name));
              if (focusedTask) {
                focusedTask.tags.forEach(t => prefillChannels.add(t));
              }
              if (prefillChannels.size === 0) return "";
              return Array.from(prefillChannels).map(c => `#${c}`).join(" ") + " ";
            })()}
          />
        </div>
      )}

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
            const resolvedAuthor = people.find((person) => person.id === task.author.id) ?? task.author;
            const authorMeta = formatAuthorMetaParts({
              personId: resolvedAuthor.id,
              displayName: resolvedAuthor.displayName,
              username: resolvedAuthor.name,
            });
            const primaryAuthorLabel =
              isMobile && authorMeta.primary === resolvedAuthor.id
                ? truncateMobilePubkey(authorMeta.primary)
                : authorMeta.primary;

            return (
              <div
                key={task.id}
                data-task-id={task.id}
                className={cn(
                  "border-b border-border p-4 hover:bg-card/50 transition-colors",
                  task.status === "done" && "opacity-60",
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

                <div className="flex items-start gap-3">
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
                            const hasModifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
                            if (hasModifier && onStatusChange) {
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
                          className={cn(
                            "flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors",
                            canCompleteTask(task) ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                          )}
                        >
                          {task.status === "done" ? (
                            <CheckCircle2 className="w-5 h-5 text-primary" />
                          ) : task.status === "in-progress" ? (
                            <CircleDot className="w-5 h-5 text-amber-500" />
                          ) : (
                            <Circle className="w-5 h-5 text-muted-foreground" />
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
                    <MessageSquare className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
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
                      className="w-8 h-8 flex-shrink-0"
                      beamTestId={`feed-beam-${task.id}`}
                    />
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onAuthorClick?.(resolvedAuthor);
                        }}
                        className="font-medium text-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 rounded"
                        aria-label={`Filter and mention ${authorMeta.primary}`}
                        title={resolvedAuthor.id}
                      >
                        <span title={authorMeta.primary}>{primaryAuthorLabel}</span>
                        {authorMeta.secondary && (
                          <span
                            data-testid={`feed-author-secondary-${task.id}`}
                            className="opacity-60"
                          >
                            {" "}
                            ({authorMeta.secondary})
                          </span>
                        )}
                      </button>
                      <span>·</span>
                      <span>{timeAgo}</span>
                      {isComment && (
                        <>
                          <span>·</span>
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
                      })}
                    </p>

                    {/* Due date */}
                    {task.dueDate && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                        <Calendar className="w-3 h-3" />
                        <span>{format(task.dueDate, "MMM d, yyyy")}</span>
                        {task.dueTime && (
                          <>
                            <Clock className="w-3 h-3 ml-1" />
                            <span>{task.dueTime}</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Tags */}
                    {task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
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

      {/* Bottom search dock - hidden on mobile */}
      {!isMobile && (
        <div className="relative flex-shrink-0 border-t border-border bg-background/80 backdrop-blur-md">
          {/* Gradient fade overlay */}
          <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />
          <div className="px-4 py-3 flex items-center">
            <div className="relative w-full max-w-xl mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                data-onboarding="search-bar"
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search tasks..."
                className="w-full bg-muted/60 border border-border/50 rounded-xl pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/30 shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
