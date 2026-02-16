import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNDK } from "@/lib/nostr/ndk-context";
import { Search, Circle, CircleDot, CheckCircle2, Calendar, Clock, ArrowUpDown, RotateCcw } from "lucide-react";
import { Task, Relay, Channel, Person } from "@/types";
import { TaskComposer } from "./TaskComposer";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { linkifyContent } from "@/lib/linkify";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { sortTasks, buildChildrenMap, SortContext, getDueDateColorClass } from "@/lib/taskSorting";
import { useTaskNavigation } from "@/hooks/use-task-navigation";
import { canUserChangeTaskStatus } from "@/lib/task-permissions";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
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
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

interface ListViewProps {
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
  onHashtagClick?: (tag: string) => void;
  onSignInClick?: () => void;
  forceShowComposer?: boolean;
}

type SortField = "priority" | "content" | "status" | "dueDate" | "timestamp";
type SortDirection = "asc" | "desc";

export function ListView({
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
  onHashtagClick,
  onSignInClick,
  forceShowComposer = false,
}: ListViewProps) {
  const { user } = useNDK();
  const COMPOSE_DRAFT_KEY = "nodex.compose-draft.list";
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  
  // Track sort version - incremented on view/filter changes, not status changes
  const [sortVersion, setSortVersion] = useState(0);
  const prevTasksRef = useRef<string>("");
  const prevSearchRef = useRef(searchQuery);
  const prevFocusedRef = useRef(focusedTaskId);

  const includedChannels = channels.filter(c => c.filterState === "included").map(c => c.name.toLowerCase());
  const excludedChannels = channels.filter(c => c.filterState === "excluded").map(c => c.name.toLowerCase());

  // Detect filter/view changes (not status changes) to trigger re-sort
  useEffect(() => {
    const taskIdsSnapshot = tasks.map(t => t.id).sort().join(",");
    const filtersChanged = 
      prevTasksRef.current !== taskIdsSnapshot ||
      prevSearchRef.current !== searchQuery ||
      prevFocusedRef.current !== focusedTaskId;
    
    if (filtersChanged) {
      setSortVersion(v => v + 1);
      prevTasksRef.current = taskIdsSnapshot;
      prevSearchRef.current = searchQuery;
      prevFocusedRef.current = focusedTaskId;
    }
  }, [tasks, searchQuery, focusedTaskId]);

  // Build children map for sorting context - memoize based on sortVersion to prevent re-sorting on status changes
  const sortContextRef = useRef<SortContext | null>(null);
  
  const sortContext: SortContext = useMemo(() => {
    const childrenMap = buildChildrenMap(allTasks);
    sortContextRef.current = {
      childrenMap,
      allTasks,
    };
    return sortContextRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortVersion]);

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

  // Get full ancestor chain for a task
  const getAncestorChain = useCallback((taskId: string): { id: string; text: string }[] => {
    const chain: { id: string; text: string }[] = [];
    let current = allTasks.find(t => t.id === taskId);
    
    while (current?.parentId) {
      const parent = allTasks.find(t => t.id === current!.parentId);
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
  }, [allTasks]);

  // Get only task-type items
  // Use pre-filtered tasks from Index (relay/person filtering already applied)
  const filteredTaskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);
  
  // Stable sorted list - only re-sort when sortVersion changes
  const listTasks = useMemo(() => {
    let filtered = allTasks.filter(task => {
      if (task.taskType !== "task") return false;

      // Must be in pre-filtered tasks (relay/person filtering already applied)
      if (!filteredTaskIds.has(task.id)) return false;

      // If focused on a task, only show descendants
      if (focusedTaskId) {
        const descendantIds = getDescendantIds(focusedTaskId);
        if (!descendantIds.has(task.id)) return false;
      }

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
    });

    // Use priority sort by default
    if (sortField === "priority") {
      filtered = sortTasks(filtered, sortContext);
      if (sortDirection === "desc") {
        filtered = filtered.reverse();
      }
      return filtered;
    }

    // Custom field sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case "content":
          comparison = a.content.localeCompare(b.content);
          break;
        case "status":
          const statusOrder = { "in-progress": 0, "todo": 1, "done": 2 };
          comparison = (statusOrder[a.status || "todo"] || 1) - (statusOrder[b.status || "todo"] || 1);
          break;
        case "dueDate":
          if (!a.dueDate && !b.dueDate) comparison = 0;
          else if (!a.dueDate) comparison = 1;
          else if (!b.dueDate) comparison = -1;
          else comparison = a.dueDate.getTime() - b.dueDate.getTime();
          break;
        case "timestamp":
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
          break;
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, filteredTaskIds, searchQuery, includedChannels, excludedChannels, sortField, sortDirection, focusedTaskId, sortContext, sortVersion]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleResetSort = () => {
    setSortField("priority");
    setSortDirection("asc");
    setSortVersion(v => v + 1);
  };

  const handleNewTask = (content: string, taskTags: string[], taskRelays: string[], taskType: string, dueDate?: Date, dueTime?: string) => {
    onNewTask(content, taskTags, taskRelays, taskType, dueDate, dueTime, focusedTaskId || undefined);
  };

  const canCompleteTask = (task: Task) => {
    return canUserChangeTaskStatus(task, currentUser);
  };
  const focusedTask = focusedTaskId ? allTasks.find((t) => t.id === focusedTaskId) : null;

  // Task IDs for keyboard navigation
  const taskIds = useMemo(() => listTasks.map(t => t.id), [listTasks]);

  // Keyboard navigation
  const { focusedTaskId: keyboardFocusedTaskId } = useTaskNavigation({
    taskIds,
    onSelectTask: (id) => onFocusTask?.(id),
    onGoBack: () => onFocusTask?.(null),
    onFocusSidebar,
    enabled: true,
  });

  // Scroll focused task into view
  const tableContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (keyboardFocusedTaskId && tableContainerRef.current) {
      const element = tableContainerRef.current.querySelector(
        `[data-task-id="${keyboardFocusedTaskId}"]`
      );
      if (element) {
        element.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [keyboardFocusedTaskId]);

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className={cn(
        "flex items-center gap-1 text-xs font-medium",
        sortField === field ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  // Editable status cell
  const StatusCell = ({ task }: { task: Task }) => {
    const status = task.status || "todo";
    
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(
            "text-xs px-2 py-1 rounded-full font-medium cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all",
            status === "done" ? "bg-primary/10 text-primary" :
            status === "in-progress" ? "bg-amber-500/10 text-amber-600" :
            "bg-muted text-muted-foreground"
          )}>
            {status === "in-progress" ? "In Progress" : 
             status === "done" ? "Done" : "To Do"}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem 
            onClick={() => onStatusChange?.(task.id, "todo")}
            className={cn(status === "todo" && "bg-muted")}
          >
            <Circle className="w-4 h-4 mr-2 text-muted-foreground" />
            To Do
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onStatusChange?.(task.id, "in-progress")}
            className={cn(status === "in-progress" && "bg-muted")}
          >
            <CircleDot className="w-4 h-4 mr-2 text-amber-500" />
            In Progress
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onStatusChange?.(task.id, "done")}
            className={cn(status === "done" && "bg-muted")}
          >
            <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
            Done
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // Editable due date cell
  const DueDateCell = ({ task }: { task: Task }) => {
    const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
    
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className={cn(
            "flex items-center gap-1.5 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded transition-colors",
            dueDateColor
          )}>
            {task.dueDate ? (
              <>
                <Calendar className="w-3.5 h-3.5" />
                <span>{format(task.dueDate, "MMM d, yyyy")}</span>
                {task.dueTime && (
                  <>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{task.dueTime}</span>
                  </>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Set date...</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarComponent
            mode="single"
            selected={task.dueDate}
            onSelect={(date) => {
              // Note: This would need an onUpdateDueDate callback to fully work
              // For now, just close the popover - the infrastructure is in place
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    );
  };

  // Editable tags cell
  const TagsCell = ({ task }: { task: Task }) => {
    return (
      <div className="flex flex-wrap gap-1">
        {task.tags.slice(0, 3).map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onHashtagClick?.(tag);
            }}
            className={`px-1.5 py-0.5 rounded text-xs font-medium cursor-pointer ${TASK_INTERACTION_STYLES.hashtagChip}`}
            aria-label={`Filter to #${tag}`}
            title={`Filter to #${tag}`}
          >
            #{tag}
          </button>
        ))}
        {task.tags.length > 3 && (
          <span className="text-xs text-muted-foreground">
            +{task.tags.length - 3}
          </span>
        )}
        {task.tags.length === 0 && (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    );
  };

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      {focusedTaskId && (
        <FocusedTaskBreadcrumb
          allTasks={allTasks}
          focusedTaskId={focusedTaskId}
          onFocusTask={onFocusTask}
        />
      )}

      {(user || forceShowComposer) && (
        <div className="border-b border-border px-4 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0">
          <TaskComposer
            onSubmit={handleNewTask}
            relays={relays}
            channels={channels}
            people={people}
            onCancel={() => {}}
            compact
            adaptiveSize
            draftStorageKey={COMPOSE_DRAFT_KEY}
            parentId={focusedTaskId || undefined}
            onSignInClick={onSignInClick}
            forceExpanded={forceShowComposer}
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

      {/* Table */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-background border-b border-border z-10">
            <tr>
              <th className="text-left p-3 w-10">
                <div className="flex items-center gap-1">
                  {(sortField !== "priority" || sortDirection !== "asc") && (
                    <button
                      onClick={handleResetSort}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Reset to default sorting"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </th>
              <th className="text-left p-3">
                <SortButton field="content">Task</SortButton>
              </th>
              <th className="text-left p-3 w-32">
                <SortButton field="status">Status</SortButton>
              </th>
              <th className="text-left p-3 w-40">
                <SortButton field="dueDate">Due Date</SortButton>
              </th>
              <th className="text-left p-3 w-32">
                <SortButton field="priority">Priority</SortButton>
              </th>
              <th className="text-left p-3 w-48">Tags</th>
            </tr>
          </thead>
          <tbody>
            {listTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground py-8">
                  No tasks found
                </td>
              </tr>
            ) : (
              listTasks.map((task) => {
                const ancestorChain = getAncestorChain(task.id);
                const isKeyboardFocused = keyboardFocusedTaskId === task.id;
                
                return (
                  <tr
                    key={task.id}
                    data-task-id={task.id}
                    className={cn(
                      "border-b border-border hover:bg-muted/30 transition-colors",
                      task.status === "done" && "opacity-60",
                      isKeyboardFocused && "ring-2 ring-primary ring-inset bg-primary/5"
                    )}
                  >
                    <td className="p-3">
                      <button
                        onClick={() => canCompleteTask(task) && onToggleComplete(task.id)}
                        disabled={!canCompleteTask(task)}
                        className={cn(
                          "p-0.5 rounded transition-colors",
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
                    </td>
                    <td className="p-3">
                      <div className="space-y-1">
                        {/* Parent context */}
                        {ancestorChain.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            {ancestorChain.map((ancestor, i) => (
                              <span key={ancestor.id} className="flex items-center gap-1">
                                {i > 0 && <span className="text-muted-foreground/50">›</span>}
                                <button
                                  onClick={() => onFocusTask?.(ancestor.id)}
                                  className={`${TASK_INTERACTION_STYLES.hoverLinkText} truncate max-w-[100px]`}
                                  title={`Focus task: ${ancestor.text}`}
                                  aria-label={`Focus task: ${ancestor.text}`}
                                >
                                  {ancestor.text}
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <p
                          onClick={() => onFocusTask?.(task.id)}
                          className={cn(
                            `text-sm cursor-pointer ${TASK_INTERACTION_STYLES.hoverText}`,
                            task.status === "done" && "line-through text-muted-foreground"
                          )}
                          title="Focus this task"
                        >
                          {linkifyContent(task.content, onHashtagClick, {
                            plainHashtags: task.status === "done",
                          })}
                        </p>
                      </div>
                    </td>
                    <td className="p-3">
                      <StatusCell task={task} />
                    </td>
                    <td className="p-3">
                      <DueDateCell task={task} />
                    </td>
                    <td className="p-3">
                      <span className="text-xs text-muted-foreground">—</span>
                    </td>
                    <td className="p-3">
                      <TagsCell task={task} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom search dock */}
      <div className="relative flex-shrink-0 border-t border-border bg-background/80 backdrop-blur-md">
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
    </main>
  );
}
