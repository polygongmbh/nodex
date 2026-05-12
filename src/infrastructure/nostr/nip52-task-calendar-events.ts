import type { TaskDateType } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";

interface LinkedTaskCalendarEventParams {
  taskEventId: string;
  taskContent: string;
  dueDate: Date;
  dueTime?: string;
  dateType?: TaskDateType;
  relayUrl?: string;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toDateTagValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toUnixSeconds(date: Date): string {
  return String(Math.floor(date.getTime() / 1000));
}

function applyDueTime(date: Date, dueTime: string): Date {
  const match = dueTime.match(HH_MM_RE);
  if (!match) return date;
  const [, hh, mm] = match;
  const merged = new Date(date);
  merged.setHours(Number(hh), Number(mm), 0, 0);
  return merged;
}

function buildStableDateTag(taskEventId: string, dateType: TaskDateType): string {
  return `task-date-${taskEventId}-${dateType}`;
}

export function buildLinkedTaskCalendarEvent({
  taskEventId,
  taskContent,
  dueDate,
  dueTime,
  dateType = "due",
  relayUrl,
}: LinkedTaskCalendarEventParams): {
  kind: NostrEventKind;
  content: string;
  tags: string[][];
} {
  const normalizedTime = dueTime?.trim();
  const hasValidTime = Boolean(normalizedTime && HH_MM_RE.test(normalizedTime));
  const kind = hasValidTime ? NostrEventKind.CalendarTimeBased : NostrEventKind.CalendarDateBased;
  const dateValue = hasValidTime
    ? toUnixSeconds(applyDueTime(dueDate, normalizedTime!))
    : toDateTagValue(dueDate);
  const primaryDateTagName = dateType === "end" ? "end" : "start";

  const dTag = buildStableDateTag(taskEventId, dateType);
  const tags: string[][] = [
    ["d", dTag],
    ["title", taskContent.slice(0, 80)],
    [primaryDateTagName, dateValue],
    ["date_type", dateType],
    ["e", taskEventId, relayUrl || "", "task"],
  ];

  return {
    kind,
    content: taskContent,
    tags,
  };
}

function formatHhMm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function parseLinkedTaskDueFromCalendarEvent(
  kind: number,
  tags: string[][]
): { taskId?: string; dueDate?: Date; dueTime?: string; dateType?: TaskDateType } {
  const taskRefTag =
    tags.find((tag) => tag[0] === "e" && tag[1] && tag[3] === "task") ||
    tags.find((tag) => tag[0] === "e" && tag[1]);
  const startTag = tags.find((tag) => tag[0] === "start" && tag[1]);
  const endTag = tags.find((tag) => tag[0] === "end" && tag[1]);
  const dateTag = startTag || endTag;
  const dateTypeTag = tags.find((tag) => tag[0] === "date_type" && tag[1]);

  if (!taskRefTag?.[1] || !dateTag?.[1]) {
    return {};
  }

  let dueDate: Date | undefined;
  if (kind === NostrEventKind.CalendarDateBased && DATE_ONLY_RE.test(dateTag[1])) {
    const [y, m, d] = dateTag[1].split("-").map(Number);
    const parsed = new Date(y, m - 1, d);
    if (!Number.isNaN(parsed.getTime())) {
      dueDate = parsed;
    }
  } else if (kind === NostrEventKind.CalendarTimeBased && /^\d+$/.test(dateTag[1])) {
    const parsed = new Date(Number(dateTag[1]) * 1000);
    if (!Number.isNaN(parsed.getTime())) {
      dueDate = parsed;
    }
  }

  const parsedDueTime =
    kind === NostrEventKind.CalendarTimeBased && dueDate ? formatHhMm(dueDate) : undefined;

  const parsedDateType = (() => {
    const normalized = (dateTypeTag?.[1] || "").toLowerCase();
    if (normalized === "scheduled" || normalized === "start" || normalized === "end" || normalized === "milestone" || normalized === "due") {
      return normalized as TaskDateType;
    }
    if (endTag) return "end";
    return "due";
  })();

  return {
    taskId: taskRefTag[1],
    dueDate,
    dueTime: parsedDueTime,
    dateType: parsedDateType,
  };
}
