import type {
  CalendarEventPost,
  DateBasedEventPost,
  Person,
  TaskDateType,
  TimeBasedEventPost,
} from "@/types";
import { NostrEventKind, type NostrEventWithRelay } from "@/lib/nostr/types";
import { extractHashtagsFromContent } from "@/lib/hashtags";
import { formatUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { getRelayIdFromUrl } from "./relay-identity";

function relayIdsFromEvent(event: NostrEventWithRelay): string[] {
  const relayUrls = [
    ...(event.relayUrls || []),
    ...(event.relayUrl ? [event.relayUrl] : []),
  ]
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter((url) => Boolean(url));
  const relayIds = Array.from(new Set(relayUrls.map((url) => getRelayIdFromUrl(url))));
  return relayIds.length === 0 ? ["nostr"] : relayIds;
}

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

function parseUnixDate(value: string): Date | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = new Date(Number(value) * 1000);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseIsoDateLocal(value: string): Date | undefined {
  if (!DATE_ONLY_RE.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseDateType(tags: string[][], fallback: TaskDateType): TaskDateType {
  const tag = tags.find((entry) => entry[0] === "date_type" && entry[1]);
  const normalized = (tag?.[1] || "").toLowerCase();
  if (
    normalized === "scheduled" ||
    normalized === "start" ||
    normalized === "end" ||
    normalized === "milestone" ||
    normalized === "due"
  ) {
    return normalized as TaskDateType;
  }
  return fallback;
}

export type CalendarEventDateParse =
  | {
      kind: NostrEventKind.CalendarDateBased;
      startDate?: string;
      endDate?: string;
      dateType: TaskDateType;
    }
  | {
      kind: NostrEventKind.CalendarTimeBased;
      start?: Date;
      end?: Date;
      startTime?: string;
      endTime?: string;
      dateType: TaskDateType;
    };

/**
 * Pure date-extraction core shared by linked-task hydration and standalone
 * event parsing. Returns a discriminated shape by kind so callers don't have
 * to inspect the tags themselves.
 */
export function parseCalendarEventDates(
  kind: number,
  tags: string[][]
): CalendarEventDateParse {
  const startTag = tags.find((tag) => tag[0] === "start" && tag[1])?.[1];
  const endTag = tags.find((tag) => tag[0] === "end" && tag[1])?.[1];
  const fallbackType: TaskDateType = startTag ? "due" : endTag ? "end" : "due";
  const dateType = parseDateType(tags, fallbackType);

  if (kind === NostrEventKind.CalendarDateBased) {
    return {
      kind: NostrEventKind.CalendarDateBased,
      startDate: startTag && DATE_ONLY_RE.test(startTag) ? startTag : undefined,
      endDate: endTag && DATE_ONLY_RE.test(endTag) ? endTag : undefined,
      dateType,
    };
  }

  const start = startTag ? parseUnixDate(startTag) : undefined;
  const end = endTag ? parseUnixDate(endTag) : undefined;
  return {
    kind: NostrEventKind.CalendarTimeBased,
    start,
    end,
    startTime: start ? formatHhMm(start) : undefined,
    endTime: end ? formatHhMm(end) : undefined,
    dateType,
  };
}

export function parseLinkedTaskDueFromCalendarEvent(
  kind: number,
  tags: string[][]
): { taskId?: string; dueDate?: Date; dueTime?: string; dateType?: TaskDateType } {
  const taskRefTag =
    tags.find((tag) => tag[0] === "e" && tag[1] && tag[3] === "task") ||
    tags.find((tag) => tag[0] === "e" && tag[1]);
  if (!taskRefTag?.[1]) return {};

  const parsed = parseCalendarEventDates(kind, tags);
  if (parsed.kind === NostrEventKind.CalendarDateBased) {
    const value = parsed.startDate ?? parsed.endDate;
    if (!value) return {};
    const dueDate = parseIsoDateLocal(value);
    if (!dueDate) return {};
    return {
      taskId: taskRefTag[1],
      dueDate,
      dateType: parsed.dateType,
    };
  }

  const dueDate = parsed.start ?? parsed.end;
  if (!dueDate) return {};
  return {
    taskId: taskRefTag[1],
    dueDate,
    dueTime: parsed.start ? parsed.startTime : parsed.endTime,
    dateType: parsed.dateType,
  };
}

function firstTagValue(tags: string[][], name: string): string | undefined {
  return tags.find((tag) => tag[0] === name && tag[1])?.[1];
}

function collectPubkeyMentions(tags: string[][]): string[] {
  return Array.from(
    new Set(
      tags
        .filter((tag) => tag[0]?.toLowerCase() === "p" && tag[1])
        .map((tag) => tag[1].toLowerCase())
    )
  );
}

function collectHashtags(tags: string[][], content: string): string[] {
  const tagHashtags = tags
    .filter((tag) => tag[0]?.toLowerCase() === "t" && tag[1])
    .map((tag) => tag[1].toLowerCase());
  const contentHashtags = extractHashtagsFromContent(content);
  return Array.from(new Set([...tagHashtags, ...contentHashtags]));
}

function hasLinkedTaskRef(tags: string[][]): boolean {
  return tags.some((tag) => tag[0] === "e" && tag[1] && tag[3] === "task");
}

/**
 * Builds a standalone NIP-52 calendar event post from a raw Nostr event.
 *
 * Returns `null` when:
 *  - the event references a task (the linked-hydration path owns it), or
 *  - the start tag is missing/malformed.
 */
export function parseStandaloneCalendarEvent(
  event: NostrEventWithRelay
): CalendarEventPost | null {
  if (
    event.kind !== NostrEventKind.CalendarDateBased &&
    event.kind !== NostrEventKind.CalendarTimeBased
  ) {
    return null;
  }
  if (hasLinkedTaskRef(event.tags)) return null;

  const parsed = parseCalendarEventDates(event.kind, event.tags);
  const author: Person = {
    pubkey: event.pubkey,
    name: formatUserFacingPubkey(event.pubkey),
    displayName: formatUserFacingPubkey(event.pubkey),
  };
  const title = firstTagValue(event.tags, "title");
  const summary = firstTagValue(event.tags, "summary");
  const location = firstTagValue(event.tags, "location");
  const geohash = firstTagValue(event.tags, "g");
  const mentions = collectPubkeyMentions(event.tags);
  const allTags = collectHashtags(event.tags, event.content);
  const parentTag = event.tags.find((tag) => tag[0] === "e" && tag[3] === "parent");
  const replyTag = event.tags.find((tag) => tag[0] === "e" && tag[3] === "reply");

  const base = {
    id: event.id,
    author,
    content: event.content,
    tags: allTags,
    relays: relayIdsFromEvent(event),
    timestamp: new Date(event.created_at * 1000),
    parentId: parentTag?.[1] || replyTag?.[1],
    mentions,
    locationGeohash: geohash,
    location,
    title,
    summary,
  };

  if (parsed.kind === NostrEventKind.CalendarDateBased) {
    if (!parsed.startDate) return null;
    const post: DateBasedEventPost = {
      ...base,
      kind: NostrEventKind.CalendarDateBased,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
    };
    return post;
  }

  if (!parsed.start) return null;
  const post: TimeBasedEventPost = {
    ...base,
    kind: NostrEventKind.CalendarTimeBased,
    start: parsed.start,
    end: parsed.end,
  };
  return post;
}

interface BuildStandaloneCalendarEventParams {
  title: string;
  content: string;
  start: Date;
  end?: Date;
  isAllDay: boolean;
  summary?: string;
  location?: string;
  mentions?: string[];
}

/**
 * Builds a publishable standalone NIP-52 calendar event. Kind is 31922 when
 * `isAllDay`, else 31923 — call sites already track this from the composer
 * (start with HH:mm → timed; no time → all-day).
 */
export function buildStandaloneCalendarEvent({
  title,
  content,
  start,
  end,
  isAllDay,
  summary,
  location,
  mentions,
}: BuildStandaloneCalendarEventParams): {
  kind: NostrEventKind;
  content: string;
  tags: string[][];
} {
  const kind = isAllDay ? NostrEventKind.CalendarDateBased : NostrEventKind.CalendarTimeBased;
  const startValue = isAllDay ? toDateTagValue(start) : toUnixSeconds(start);
  const tags: string[][] = [
    ["d", `event-${start.getTime()}-${Math.random().toString(36).slice(2, 8)}`],
    ["title", title.slice(0, 200)],
    ["start", startValue],
  ];
  if (end) {
    tags.push(["end", isAllDay ? toDateTagValue(end) : toUnixSeconds(end)]);
  }
  if (summary) tags.push(["summary", summary]);
  if (location) tags.push(["location", location]);
  for (const pubkey of mentions ?? []) {
    if (pubkey) tags.push(["p", pubkey]);
  }
  for (const hashtag of extractHashtagsFromContent(content)) {
    tags.push(["t", hashtag]);
  }
  return { kind, content, tags };
}
