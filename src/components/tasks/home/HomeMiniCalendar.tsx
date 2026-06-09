import { useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { formatDayKey } from "@/domain/content/post-day-matching";
import { parseIsoDateLocal } from "@/types";

interface HomeMiniCalendarProps {
  /** Days (yyyy-MM-dd) that carry dated entries, rendered as little dots. */
  eventDayKeys: Set<string>;
  selectedDayKey: string | null;
  /** Invoked with the clicked day's key; the owner toggles selection. */
  onToggleDay: (dayKey: string) => void;
}

const EVENT_DOT_CLASSES = [
  "[&>button]:relative",
  "[&>button]:after:absolute",
  "[&>button]:after:bottom-0.5",
  "[&>button]:after:left-1/2",
  "[&>button]:after:-translate-x-1/2",
  "[&>button]:after:h-1",
  "[&>button]:after:w-1",
  "[&>button]:after:rounded-full",
  "[&>button]:after:bg-primary",
  "[&>button]:after:content-['']",
  // The selected day's button is filled with the primary color (vendored
  // react-day-picker markup), so its dot flips to the foreground tone.
  "[&[aria-selected=true]>button]:after:bg-primary-foreground",
].join(" ");

/**
 * Compact month calendar under the home my-tasks panel. Clicking a day scopes
 * the home timeline and my-tasks panel to it; clicking the selected day again
 * clears the selection.
 */
export function HomeMiniCalendar({
  eventDayKeys,
  selectedDayKey,
  onToggleDay,
}: HomeMiniCalendarProps) {
  const selected = useMemo(
    () => (selectedDayKey ? parseIsoDateLocal(selectedDayKey) : undefined),
    [selectedDayKey]
  );
  return (
    <div data-testid="home-mini-calendar">
      <Calendar
        mode="single"
        selected={selected}
        onSelect={(_day, triggerDay) => onToggleDay(formatDayKey(triggerDay))}
        modifiers={{ hasEvents: (date: Date) => eventDayKeys.has(formatDayKey(date)) }}
        modifiersClassNames={{ hasEvents: EVENT_DOT_CLASSES }}
      />
    </div>
  );
}
