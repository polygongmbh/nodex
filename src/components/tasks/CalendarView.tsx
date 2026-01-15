import { useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, Circle, CircleDot, CheckCircle2, X, CalendarPlus, Calendar, Clock } from "lucide-react";
import { Task, Relay, Tag, Person } from "@/types";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { linkifyContent } from "@/lib/linkify";
import { TaskComposer } from "./TaskComposer";
import { getDueDateColorClass } from "@/lib/taskSorting";

interface CalendarViewProps {
  tasks: Task[];
  allTasks: Task[];
  relays: Relay[];
  tags: Tag[];
  people: Person[];
  currentUser?: Person;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewTask: (content: string, tags: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string, parentId?: string) => void;
  onToggleComplete: (taskId: string) => void;
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
}

export function CalendarView({
  tasks,
  allTasks,
  relays,
  tags,
  people,
  currentUser,
  searchQuery,
  onSearchChange,
  onNewTask,
  onToggleComplete,
  focusedTaskId,
  onFocusTask,
}: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date()); // Select today by default
  const [isComposingEvent, setIsComposingEvent] = useState(false);

  const includedTags = tags.filter(t => t.filterState === "included").map(t => t.name.toLowerCase());
  const excludedTags = tags.filter(t => t.filterState === "excluded").map(t => t.name.toLowerCase());

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
          text: parent.content.slice(0, 15) + (parent.content.length > 15 ? "..." : "")
        });
        current = parent;
      } else {
        break;
      }
    }
    
    return chain;
  }, [allTasks]);

  // Get tasks with due dates
  // Use pre-filtered tasks from Index (relay/person filtering already applied)
  const filteredTaskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);
  
  const tasksWithDueDates = useMemo(() => {
    return allTasks.filter(task => {
      if (!task.dueDate || task.taskType !== "task") return false;

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
      
      // Apply tag exclusion filter
      if (excludedTags.length > 0) {
        const taskTagsLower = task.tags.map(t => t.toLowerCase());
        if (taskTagsLower.some(t => excludedTags.includes(t))) {
          return false;
        }
      }
      
      // Apply tag inclusion filter
      if (includedTags.length > 0 && !task.tags.some(t => includedTags.includes(t.toLowerCase()))) {
        return false;
      }
      
      return true;
    });
  }, [allTasks, filteredTaskIds, searchQuery, includedTags, excludedTags, focusedTaskId]);

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getTasksForDay = (day: Date) => {
    return tasksWithDueDates.filter(task => task.dueDate && isSameDay(task.dueDate, day));
  };

  const selectedDayTasks = selectedDate ? getTasksForDay(selectedDate) : [];

  const canCompleteTask = (task: Task) => {
    if (!currentUser) return false;
    const mentionedPeople = task.content.match(/@(\w+)/g)?.map(m => m.slice(1)) || [];
    if (mentionedPeople.length === 0) return true;
    return mentionedPeople.includes(currentUser.name);
  };

  // Get day of week for first day to add padding
  const firstDayOfMonth = startOfMonth(currentMonth);
  const startPadding = firstDayOfMonth.getDay();

  const handleCreateEvent = (content: string, taskTags: string[], taskRelays: string[], taskType: string, dueDate?: Date, dueTime?: string) => {
    // Use the selected date if no due date was set
    const eventDate = dueDate || selectedDate || new Date();
    onNewTask(content, taskTags, taskRelays, taskType, eventDate, dueTime, focusedTaskId || undefined);
    setIsComposingEvent(false);
  };

  const focusedTask = focusedTaskId ? allTasks.find(t => t.id === focusedTaskId) : null;

  return (
    <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Calendar</h2>
            {focusedTaskId && (
              <button
                onClick={() => onFocusTask?.(null)}
                className="text-xs text-primary hover:underline"
              >
                ← Back to all
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-1.5 rounded hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium min-w-[140px] text-center">
                {format(currentMonth, "MMMM yyyy")}
              </span>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-1.5 rounded hover:bg-muted transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="relative w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search tasks..."
              className="w-full bg-muted/50 border border-border rounded-lg pl-3 pr-4 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
        {focusedTask && (
          <div className="mt-3 p-2 bg-muted/50 rounded-lg border border-border">
            <div className="text-xs text-muted-foreground mb-1">Viewing subitems of:</div>
            <div className="text-sm font-medium">{focusedTask.content.slice(0, 80)}{focusedTask.content.length > 80 ? "..." : ""}</div>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Calendar Grid */}
        <div className="flex-1 p-4 overflow-auto">
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
            {/* Padding for start of month */}
            {Array.from({ length: startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="aspect-square" />
            ))}
            
            {days.map((day) => {
              const dayTasks = getTasksForDay(day);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "aspect-square p-1 rounded-lg border transition-colors text-left flex flex-col",
                    isToday(day) && "border-primary",
                    isSelected ? "bg-primary/10 border-primary" : "border-transparent hover:bg-muted/50",
                    !isSameMonth(day, currentMonth) && "opacity-50"
                  )}
                >
                  <span className={cn(
                    "text-xs font-medium",
                    isToday(day) && "text-primary"
                  )}>
                    {format(day, "d")}
                  </span>
                  {dayTasks.length > 0 && (
                    <div className="flex-1 flex flex-col gap-0.5 mt-1 overflow-hidden">
                      {dayTasks.slice(0, 2).map((task) => {
                        const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
                        return (
                          <div
                            key={task.id}
                            className={cn(
                              "text-[10px] leading-tight px-1 py-0.5 rounded truncate",
                              task.status === "done" ? "bg-muted text-muted-foreground line-through" :
                              task.status === "in-progress" ? "bg-amber-500/20 text-amber-700" :
                              "bg-primary/10",
                              dueDateColor
                            )}
                          >
                            {task.content.slice(0, 15)}...
                          </div>
                        );
                      })}
                      {dayTasks.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{dayTasks.length - 2} more
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Panel */}
        <div className="w-80 border-l border-border p-4 overflow-y-auto flex-shrink-0">
          {selectedDate ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">
                  {format(selectedDate, "EEEE, MMMM d")}
                </h3>
                <button
                  onClick={() => setIsComposingEvent(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Event
                </button>
              </div>

              {/* Event Composer */}
              {isComposingEvent && (
                <div className="mb-4 p-3 bg-card border border-border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarPlus className="w-3 h-3" />
                      New event on {format(selectedDate, "MMM d")}
                    </span>
                    <button
                      onClick={() => setIsComposingEvent(false)}
                      className="p-0.5 rounded hover:bg-muted"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <TaskComposer
                    onSubmit={handleCreateEvent}
                    relays={relays}
                    tags={tags}
                    people={people}
                    onCancel={() => setIsComposingEvent(false)}
                    compact
                    defaultDueDate={selectedDate}
                    defaultContent={(() => {
                      const prefillTags = new Set<string>();
                      tags.filter(t => t.filterState === "included").forEach(t => prefillTags.add(t.name));
                      if (prefillTags.size === 0) return "";
                      return Array.from(prefillTags).map(t => `#${t}`).join(" ") + " ";
                    })()}
                  />
                </div>
              )}

              {selectedDayTasks.length === 0 && !isComposingEvent ? (
                <p className="text-sm text-muted-foreground">No tasks due this day</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayTasks.map((task) => {
                    const ancestorChain = getAncestorChain(task.id);
                    const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
                    
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors",
                          task.status === "done" && "opacity-60"
                        )}
                      >
                        {/* Parent context */}
                        {ancestorChain.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground mb-2">
                            {ancestorChain.map((ancestor, i) => (
                              <span key={ancestor.id} className="flex items-center gap-1">
                                {i > 0 && <span className="text-muted-foreground/50">›</span>}
                                <button
                                  onClick={() => onFocusTask?.(ancestor.id)}
                                  className="hover:text-primary hover:underline truncate max-w-[60px]"
                                >
                                  {ancestor.text}
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => canCompleteTask(task) && onToggleComplete(task.id)}
                            disabled={!canCompleteTask(task)}
                            className={cn(
                              "flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors",
                              canCompleteTask(task) ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                            )}
                          >
                            {task.status === "done" ? (
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            ) : task.status === "in-progress" ? (
                              <CircleDot className="w-4 h-4 text-amber-500" />
                            ) : (
                              <Circle className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p
                              onClick={() => onFocusTask?.(task.id)}
                              className={cn(
                                "text-sm cursor-pointer hover:text-primary",
                                task.status === "done" && "line-through text-muted-foreground"
                              )}
                            >
                              {linkifyContent(task.content)}
                            </p>
                            {task.dueTime && (
                              <div className={cn("flex items-center gap-1 text-xs mt-1", dueDateColor)}>
                                <Clock className="w-3 h-3" />
                                <span>{task.dueTime}</span>
                              </div>
                            )}
                            {task.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {task.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-1 py-0.5 rounded text-xs bg-primary/10 text-primary"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a day to view tasks</p>
          )}
        </div>
      </div>
    </main>
  );
}
