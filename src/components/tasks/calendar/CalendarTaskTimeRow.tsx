import { format, startOfDay } from "date-fns";
import { Clock } from "lucide-react";
import {
  getTaskPrimaryDate,
  isCalendarEventPost,
  isDateBasedEventPost,
  isTimeBasedEventPost,
  parseIsoDateLocal,
  type Post,
} from "@/types";
import { getTaskLocalDate, getTaskTimeOfDay } from "@/lib/task-dates";

interface CalendarTaskTimeRowProps {
  task: Post;
  selectedDate: Date | null;
  accent: string;
}

export function CalendarTaskTimeRow({ task, selectedDate, accent }: CalendarTaskTimeRowProps) {
  const primary = getTaskPrimaryDate(task);
  if (!primary) return null;
  const dayKey = selectedDate ? format(startOfDay(selectedDate), "yyyy-MM-dd") : null;
  const authorTitle = task.author?.displayName || task.author?.name || "Author";

  if (isTimeBasedEventPost(task) && task.start && task.end && dayKey) {
    const startDayKey = format(startOfDay(task.start), "yyyy-MM-dd");
    const endDayKey = format(startOfDay(task.end), "yyyy-MM-dd");
    if (startDayKey !== endDayKey) {
      const startSide = dayKey === startDayKey
        ? format(task.start, "HH:mm")
        : format(task.start, "MMM d");
      const endSide = dayKey === endDayKey
        ? format(task.end, "HH:mm")
        : format(task.end, "MMM d");
      return (
        <div className="flex items-center gap-2 text-xs mt-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: accent }}
            title={authorTitle}
          />
          <Clock className="w-3 h-3" />
          <span>{startSide}</span>
          <span>– {endSide}</span>
        </div>
      );
    }
  }

  const primaryMoment = getTaskLocalDate(primary);
  const primaryTime = getTaskTimeOfDay(primary);
  if (!primaryMoment) return null;
  let endLabel: string | null = null;
  if (isTimeBasedEventPost(task) && task.end) {
    endLabel = format(task.end, "HH:mm");
  } else if (isDateBasedEventPost(task) && task.endDate) {
    const end = parseIsoDateLocal(task.endDate);
    if (end && format(end, "yyyy-MM-dd") !== format(primaryMoment, "yyyy-MM-dd")) {
      endLabel = format(end, "MMM d");
    }
  }
  if (!primaryTime && !endLabel) return null;
  const startLabel = isCalendarEventPost(task) && isDateBasedEventPost(task) && endLabel
    ? format(primaryMoment, "MMM d")
    : primaryTime;
  return (
    <div className="flex items-center gap-2 text-xs mt-1">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: accent }}
        title={authorTitle}
      />
      <Clock className="w-3 h-3" />
      {startLabel && <span>{startLabel}</span>}
      {endLabel && <span>– {endLabel}</span>}
    </div>
  );
}
