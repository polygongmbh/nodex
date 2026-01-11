import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Circle, CircleDot, CheckCircle2 } from "lucide-react";
import { Task, Relay, Tag, Person } from "@/types";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { linkifyContent } from "@/lib/linkify";

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
}: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const includedTags = tags.filter(t => t.filterState === "included").map(t => t.name);

  // Get tasks with due dates
  const tasksWithDueDates = useMemo(() => {
    return allTasks.filter(task => {
      if (!task.dueDate || task.taskType !== "task") return false;
      if (searchQuery && !task.content.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (includedTags.length > 0 && !task.tags.some(t => includedTags.includes(t))) {
        return false;
      }
      return true;
    });
  }, [allTasks, searchQuery, includedTags]);

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

  return (
    <main className="flex-1 flex flex-col h-screen max-w-5xl">
      {/* Header */}
      <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Calendar</h2>
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
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Calendar Grid */}
        <div className="flex-1 p-4">
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
                      {dayTasks.slice(0, 2).map((task) => (
                        <div
                          key={task.id}
                          className={cn(
                            "text-[10px] leading-tight px-1 py-0.5 rounded truncate",
                            task.status === "done" ? "bg-muted text-muted-foreground line-through" :
                            task.status === "in-progress" ? "bg-amber-500/20 text-amber-700" :
                            "bg-primary/10 text-primary"
                          )}
                        >
                          {task.content.slice(0, 15)}...
                        </div>
                      ))}
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
        <div className="w-80 border-l border-border p-4 overflow-y-auto">
          {selectedDate ? (
            <>
              <h3 className="font-medium mb-3">
                {format(selectedDate, "EEEE, MMMM d")}
              </h3>
              {selectedDayTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks due this day</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayTasks.map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        "p-3 rounded-lg border border-border bg-card cursor-pointer hover:bg-muted/50 transition-colors",
                        task.status === "done" && "opacity-60"
                      )}
                      onClick={() => canCompleteTask(task) && onToggleComplete(task.id)}
                    >
                      <div className="flex items-start gap-2">
                        {task.status === "done" ? (
                          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        ) : task.status === "in-progress" ? (
                          <CircleDot className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm",
                            task.status === "done" && "line-through text-muted-foreground"
                          )}>
                            {linkifyContent(task.content)}
                          </p>
                          {task.dueTime && (
                            <span className="text-xs text-muted-foreground">
                              {task.dueTime}
                            </span>
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
                  ))}
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