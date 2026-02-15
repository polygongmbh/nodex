import { NostrEventKind } from "./types";

interface LinkedTaskCalendarEventParams {
  taskEventId: string;
  taskContent: string;
  dueDate: Date;
  dueTime?: string;
  relayUrl?: string;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toDateTagValue(date: Date): string {
  return date.toISOString().slice(0, 10);
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

export function buildLinkedTaskCalendarEvent({
  taskEventId,
  taskContent,
  dueDate,
  dueTime,
  relayUrl,
}: LinkedTaskCalendarEventParams): {
  kind: NostrEventKind;
  content: string;
  tags: string[][];
} {
  const normalizedTime = dueTime?.trim();
  const hasValidTime = Boolean(normalizedTime && HH_MM_RE.test(normalizedTime));
  const kind = hasValidTime ? NostrEventKind.CalendarTimeBased : NostrEventKind.CalendarDateBased;
  const startValue = hasValidTime
    ? toUnixSeconds(applyDueTime(dueDate, normalizedTime!))
    : toDateTagValue(dueDate);

  const dTag = `task-deadline-${taskEventId.slice(0, 12)}-${Math.floor(Date.now() / 1000)}`;
  const tags: string[][] = [
    ["d", dTag],
    ["title", taskContent.slice(0, 80)],
    ["start", startValue],
    ["e", taskEventId, relayUrl || "", "task"],
  ];

  if (normalizedTime) {
    tags.push(["due_time", normalizedTime]);
  }

  return {
    kind,
    content: taskContent,
    tags,
  };
}

export function parseLinkedTaskDueFromCalendarEvent(
  kind: number,
  tags: string[][]
): { taskId?: string; dueDate?: Date; dueTime?: string } {
  const taskRefTag =
    tags.find((tag) => tag[0] === "e" && tag[1] && tag[3] === "task") ||
    tags.find((tag) => tag[0] === "e" && tag[1]);
  const startTag = tags.find((tag) => tag[0] === "start" && tag[1]);
  const dueTimeTag = tags.find((tag) => tag[0] === "due_time" && tag[1]);

  if (!taskRefTag?.[1] || !startTag?.[1]) {
    return {};
  }

  let dueDate: Date | undefined;
  if (kind === NostrEventKind.CalendarDateBased && DATE_ONLY_RE.test(startTag[1])) {
    const parsed = new Date(`${startTag[1]}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) {
      dueDate = parsed;
    }
  } else if (kind === NostrEventKind.CalendarTimeBased && /^\d+$/.test(startTag[1])) {
    const parsed = new Date(Number(startTag[1]) * 1000);
    if (!Number.isNaN(parsed.getTime())) {
      dueDate = parsed;
    }
  }

  const parsedDueTime = dueTimeTag?.[1];

  return {
    taskId: taskRefTag[1],
    dueDate,
    dueTime: parsedDueTime,
  };
}
