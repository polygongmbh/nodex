import { endOfDay } from "date-fns";
import { NostrEventKind } from "@/lib/nostr/types";
import type { ComposerContent, DraftTagging, SubmitTagging } from "./composer-base";

export type {
  ComposerContent,
  DraftTagging,
  SerializedComposerContent,
  SerializedTaskDate,
  SubmitTagging,
  WireTagging,
} from "./composer-base";

export interface Relay {
  id: string;
  name: string;
  isActive: boolean;
  connectionStatus?: "connected" | "read-only" | "connecting" | "disconnected" | "connection-error" | "verification-failed";
  url: string;
  /** Resolved relay icon from NIP-11 (when present, https/http, and valid). */
  iconUrl?: string;
}

export interface Channel {
  id: string;
  name: string;
  usageCount?: number;
  filterState: 'included' | 'excluded' | 'neutral';
  /** Present when pinned; value is the display order (0 = first). */
  pinIndex?: number;
  /** Personal frecency score; 0 or undefined means no personal interaction. */
  personalScore?: number;
  /** Number of posts authored by the current user in this channel; absent/0 means none. */
  userPostCount?: number;
}

export interface PostedTag {
  name: string;
  relayIds: string[];
}

export type ChannelMatchMode = "and" | "or";

// Legacy alias for compatibility
export type Tag = Channel;

export type TaskEntryType = "task" | "comment";
export type FeedMessageType = "listing";
export type CalendarEntryType = "event";
export type PostType = TaskEntryType | FeedMessageType | CalendarEntryType;
// Legacy alias for compatibility with older task/comment-only call sites.
export type TaskType = TaskEntryType;
export type Nip99ListingStatus = "active" | "sold";
/**
 * Listing-specific NIP-99 metadata. Title/summary/location are NOT here —
 * those are post-shared concerns on {@link TitledPost}. NIP-99 still emits
 * them as tags on the wire; the split is purely about in-memory modeling.
 */
export interface Nip99Metadata {
  identifier?: string;
  price?: string;
  currency?: string;
  frequency?: string;
  status?: Nip99ListingStatus;
  publishedAt?: string;
}
export type TaskDateType = "due" | "scheduled" | "start" | "end" | "milestone";

/**
 * A single date attached to a task — sourced from a NIP-52 calendar event
 * (kinds 31922/31923). A task can hold any number of these (start, end,
 * milestones, due, scheduled), each independent.
 *
 * The variant is discriminated by which field is present:
 * - `{ date: "YYYY-MM-DD" }` is a calendar date (NIP-52 kind 31922). It is
 *   a string end-to-end; no `Date` instance, no timezone surface. The day
 *   the user picked is the day every viewer sees.
 * - `{ datetime: Date }` is a moment in time (NIP-52 kind 31923). Stored as
 *   a JS `Date`; serialized via `toISOString()`. The instant is preserved
 *   across timezones; viewers see the instant in their local time.
 */
export type TaskDate =
  | { date: string; type: TaskDateType }
  | { datetime: Date; type: TaskDateType };

/** Type guard: `true` for the calendar-date variant of {@link TaskDate}. */
export function isDateOnlyTaskDate(value: TaskDate): value is { date: string; type: TaskDateType } {
  return "date" in value;
}

/** Type guard: `true` for the moment-in-time variant of {@link TaskDate}. */
export function isDateTimeTaskDate(value: TaskDate): value is { datetime: Date; type: TaskDateType } {
  return "datetime" in value;
}

/**
 * Parse a `YYYY-MM-DD` string into a local-midnight `Date`. The only safe
 * way to produce a `Date` from a calendar-date string: `new Date(iso)`
 * would parse as UTC midnight and shift the day for any non-UTC viewer.
 */
export function parseIsoDateLocal(iso: string): Date | undefined {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Format a `Date` as `YYYY-MM-DD` using local-timezone getters, so the day
 * the user picked is the day stored. The inverse of {@link parseIsoDateLocal}.
 */
export function formatLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
export type TaskCreateFailureReason =
  | "not-authenticated"
  | "missing-tag"
  | "missing-core-tag"
  | "relay-selection"
  | "unexpected-error";
export type TaskCreateResult =
  | { ok: true }
  | { ok: false; reason: TaskCreateFailureReason };
export type TaskStatus = "open" | "active" | "done" | "closed";
export interface TaskState {
  status: TaskStatus;
  description?: string;
}
export interface TaskStateUpdate {
  id: string;
  state: TaskState;
  timestamp: Date;
  authorPubkey: string;
}

export interface RawNostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface PublishedAttachment {
  url: string;
  mimeType?: string;
  sha256?: string;
  originalSha256?: string;
  size?: number;
  dimensions?: string;
  blurhash?: string;
  alt?: string;
  name?: string;
  thumbnailUrl?: string;
  previewImageUrl?: string;
  summary?: string;
  service?: string;
  magnet?: string;
  infohash?: string;
  fallbackUrls?: string[];
  extra?: Record<string, string>;
}

export interface ComposeAttachment extends PublishedAttachment {
  id: string;
  fileName: string;
  status: "uploading" | "uploaded" | "failed";
  progress?: number;
  error?: string;
  source: "upload" | "url";
}

/**
 * Single canonical payload for "create a post" actions. Consumed by
 * FeedTaskCommands.createTask and handleNewTask; produced by the composer
 * submit handler (which enriches TaskComposerFormData with routing context:
 * relays, focusedTaskId, initialState).
 *
 * SubmitTagging carries `explicitMentionPubkeys` / `mentionIdentifiers` as
 * required arrays. The payload still treats them as optional so legacy
 * callers that omit them keep working.
 */
export type TaskCreatePayload = ComposerContent & Partial<SubmitTagging> & {
  tags: string[];
  relays: string[];
  focusedTaskId?: string | null;
  initialState?: TaskState;
};

export interface ComposeRecomposeOf {
  /** Event id of the original post being re-composed. */
  eventId: string;
  /** Original event kind, used when publishing the replacing deletion event. */
  originalKind: number;
  /**
   * NIP-01 `d` identifier of the original event — required for `a`-tag
   * deletions on parameterized-replaceable kinds (calendar, listings).
   */
  dTag?: string;
  /** Relay ids the original post lived on; used to route the deletion. */
  relayIds: string[];
  /** Parent event id of the original post, if it was a reply. */
  parentId?: string;
  /** Short excerpt of the original content, shown on the active-recompose banner. */
  contentPreview?: string;
}

/**
 * Title/summary/location fields shared by listing and event modes. Stored as
 * one unit so toggling between modes preserves them without per-mode dupes.
 */
export interface TitledPostFields {
  title?: string;
  summary?: string;
  location?: string;
}

/**
 * Canonical in-memory composer state. One shape used for: useState seed on
 * mount, the recompose payload, and the input to the persistence function.
 * Required fields carry sensible defaults (`""`, `[]`, `{}`); genuine
 * unknowns stay optional.
 *
 * The `titledPost` and `nip99` fields are required here (always seeded to
 * `{}` / status defaults) even though ComposerContent declares them
 * optional — the draft maintains a stable shape for setState ergonomics.
 */
export type ComposerDraft = ComposerContent & DraftTagging & {
  titledPost: TitledPostFields;
  nip99: Nip99Metadata;
  /** Relay IDs captured with the draft (set on recompose; ignored for free-form drafts). */
  selectedRelays?: string[];
};

export interface ComposeRestoreRequest {
  id: number;
  state: ComposerDraft;
}

export interface TaskReactions {
  /** Count of distinct reactor pubkeys per emoji. */
  totals: Record<string, number>;
  /** Emojis the current user has reacted with on this task. */
  mine: string[];
  /**
   * Event ids of the viewer's own reactions, keyed by emoji. Used to publish
   * NIP-09 deletions when the viewer taps their own reaction to remove it.
   * Optimistic reaction entries (not yet acknowledged by a relay) are also
   * included so removal can roll back an in-flight publish.
   */
  mineEventIdsByEmoji: Record<string, string[]>;
}

/**
 * Fields shared by every Post variant — what you can read without narrowing.
 * Anything kind-specific lives on the variant.
 */
export interface BasePost {
  id: string;
  /** Event author pubkey, normalized lowercase 64-char hex. Profile/display
   *  metadata is resolved separately from kind-0 people data — never embedded. */
  pubkey: string;
  content: string;
  tags: string[];
  relays: string[];
  timestamp: Date;
  lastEditedAt?: Date;
  parentId?: string;
  mentions?: string[];
  attachments?: PublishedAttachment[];
  locationGeohash?: string;
}

/**
 * Posts that carry a NIP-style title/summary at the top level. NIP-52 calendar
 * events and NIP-99 listings both surface these, alongside the free-form
 * `location` tag (distinct from BasePost's structured `locationGeohash`).
 */
export interface TitledPost extends BasePost {
  title?: string;
  summary?: string;
  /** Free-form location string (NIP-52 `location` tag, NIP-99 `location` tag). */
  location?: string;
  /**
   * NIP-01 `d` tag — present on parameterized-replaceable posts (NIP-52 calendar
   * events, NIP-99 listings). Needed when publishing the address-based
   * deletion / re-publish operations these kinds require.
   */
  dTag?: string;
}

export interface TaskPost extends BasePost {
  kind: NostrEventKind.Task;
  /** State-change events sorted desc; read current state via getTaskState(). */
  stateUpdates: TaskStateUpdate[];
  /** Calendar dates attached to this task, in priority order. */
  dates: TaskDate[];
  assigneePubkeys: string[];
  priority?: number;
}

export interface CommentPost extends BasePost {
  kind: NostrEventKind.TextNote;
}

export interface ListingPost extends TitledPost {
  kind: NostrEventKind.ClassifiedListing;
  nip99: Nip99Metadata;
}

/**
 * NIP-52 date-based (all-day) calendar event. Dates are stored as the spec's
 * timezone-independent `YYYY-MM-DD` strings — `Date` cannot represent a date
 * without a timezone. Views parse to a local-midnight `Date` only at the
 * placement boundary.
 */
export interface DateBasedEventPost extends TitledPost {
  kind: NostrEventKind.CalendarDateBased;
  startDate: string;
  endDate?: string;
}

/** NIP-52 time-based calendar event with full start/end datetimes. */
export interface TimeBasedEventPost extends TitledPost {
  kind: NostrEventKind.CalendarTimeBased;
  start: Date;
  end?: Date;
}

export type CalendarEventPost = DateBasedEventPost | TimeBasedEventPost;

export type Post = TaskPost | CommentPost | ListingPost | CalendarEventPost;

/**
 * Boundary normalizer: accepts either the canonical object form or a bare
 * status-type string (event-converter inputs, test shorthands) and returns the
 * canonical object form. Internal callers reading post state directly can
 * skip this — the field is always a `TaskState` once stored.
 */
export function normalizeTaskState(state: TaskState | TaskStatus | undefined): TaskState {
  if (!state) return { status: "open" };
  if (typeof state === "string") return { status: state };
  return {
    status: state.status,
    ...(state.description ? { description: state.description } : {}),
  };
}

export function getTaskStatus(state: TaskState | TaskStatus | undefined): TaskStatus {
  return normalizeTaskState(state).status;
}

/**
 * Accepts any Post; returns "open" for non-task variants so callers can
 * stay uniform without narrowing.
 */
export function getTaskState(post: Post | undefined): TaskState {
  if (!post || !isTaskPost(post)) return { status: "open" };
  return post.stateUpdates[0]?.state ?? { status: "open" };
}

export function getTaskStatusFromTask(post: Post | undefined): TaskStatus {
  return getTaskState(post).status;
}

/**
 * Type guards that narrow any post-shaped value to a specific variant. Each
 * preserves the input type's extra fields (intersection with the variant)
 * so callers don't lose unrelated narrowings.
 */
export function isTaskPost<T extends { kind: NostrEventKind }>(
  post: T | undefined
): post is T & TaskPost {
  return post?.kind === NostrEventKind.Task;
}

export function isCommentPost<T extends { kind: NostrEventKind }>(
  post: T | undefined
): post is T & CommentPost {
  return post?.kind === NostrEventKind.TextNote;
}

export function isListingPost<T extends { kind: NostrEventKind }>(
  post: T | undefined
): post is T & ListingPost {
  return post?.kind === NostrEventKind.ClassifiedListing;
}

export function isDateBasedEventPost<T extends { kind: NostrEventKind }>(
  post: T | undefined
): post is T & DateBasedEventPost {
  return post?.kind === NostrEventKind.CalendarDateBased;
}

export function isTimeBasedEventPost<T extends { kind: NostrEventKind }>(
  post: T | undefined
): post is T & TimeBasedEventPost {
  return post?.kind === NostrEventKind.CalendarTimeBased;
}

export function isCalendarEventPost<T extends { kind: NostrEventKind }>(
  post: T | undefined
): post is T & CalendarEventPost {
  return isDateBasedEventPost(post) || isTimeBasedEventPost(post);
}

/**
 * Posts that may carry a calendar date — TaskPost (via its `dates` array) or
 * any CalendarEventPost variant. Use this in calendar/feed selectors so they
 * don't have to enumerate the underlying kinds.
 */
export type CalendarEntryPost = TaskPost | CalendarEventPost;

export function isCalendarEntryPost<T extends { kind: NostrEventKind }>(
  post: T | undefined
): post is T & CalendarEntryPost {
  return isTaskPost(post) || isCalendarEventPost(post);
}

/**
 * Returns the highest-priority date attached to a post, or undefined for
 * variants that don't carry dates. Calendar events expose their start as the
 * primary date so view placement (calendar grid, feed sort) works uniformly.
 */
export function getTaskPrimaryDate(post: Post | undefined): TaskDate | undefined {
  if (!post) return undefined;
  if (isTaskPost(post)) return post.dates[0];
  if (isDateBasedEventPost(post)) return { date: post.startDate, type: "start" };
  if (isTimeBasedEventPost(post)) return { datetime: post.start, type: "start" };
  return undefined;
}

export function findTaskDate(
  post: Post | undefined,
  type: TaskDateType
): TaskDate | undefined {
  return post && isTaskPost(post) ? post.dates.find((entry) => entry.type === type) : undefined;
}

/**
 * End instant for a calendar event, for comparison against "now" (active vs.
 * past colouring). `endDate` holds the inclusive last day — the wire's
 * exclusive NIP-52 `end` is converted to inclusive on parse — so a date-based
 * event stays active through the end of that day. Returns `undefined` when no
 * end is set; callers treat a no-end event as active through its start day.
 */
export function getEventEndDate(post: Post | undefined): Date | undefined {
  if (!post) return undefined;
  if (isTimeBasedEventPost(post)) return post.end;
  if (isDateBasedEventPost(post) && post.endDate) {
    const day = parseIsoDateLocal(post.endDate);
    return day ? endOfDay(day) : undefined;
  }
  return undefined;
}

/**
 * Polymorphic accessor for all dates carried by a post — TaskPost's tagged
 * `dates`, plus the synthetic `start` / `end` entries derived from a calendar
 * event variant. Lets calendar/feed selectors treat tasks and events uniformly
 * without narrowing.
 */
export function getPostDateEntries(post: Post | undefined): TaskDate[] {
  if (!post) return [];
  if (isTaskPost(post)) return post.dates;
  if (isDateBasedEventPost(post)) {
    const entries: TaskDate[] = [{ date: post.startDate, type: "start" }];
    if (post.endDate) entries.push({ date: post.endDate, type: "end" });
    return entries;
  }
  if (isTimeBasedEventPost(post)) {
    const entries: TaskDate[] = [{ datetime: post.start, type: "start" }];
    if (post.end) entries.push({ datetime: post.end, type: "end" });
    return entries;
  }
  return [];
}

export function getTaskPriority(post: Post | undefined): number | undefined {
  return post && isTaskPost(post) ? post.priority : undefined;
}

export function getTaskAssigneePubkeys(post: Post | undefined): string[] {
  return post && isTaskPost(post) ? post.assigneePubkeys : [];
}

export function getTaskStateUpdates(post: Post | undefined): TaskStateUpdate[] {
  return post && isTaskPost(post) ? post.stateUpdates : [];
}

export function getLastEditedAt(post: Post): Date {
  return post.lastEditedAt ?? post.timestamp;
}

export interface FilterState {
  activeRelays: string[];
  includedChannels: string[];
  excludedChannels: string[];
  selectedPeople: string[];
  searchQuery: string;
}

export interface QuickFilterState {
  recentEnabled: boolean;
  recentDays: number;
  priorityEnabled: boolean;
  minPriority: number;
}

export interface SavedFilterConfiguration {
  id: string;
  name: string;
  relayIds: string[];
  channelStates: Record<string, "included" | "excluded">;
  selectedPeopleIds: string[];
  channelMatchMode: ChannelMatchMode;
  quickFilters?: QuickFilterState;
  createdAt: string;
  updatedAt: string;
}

export interface SavedFilterState {
  activeConfigurationId: string | null;
  configurations: SavedFilterConfiguration[];
}

export interface SavedFilterController {
  configurations: SavedFilterConfiguration[];
  activeConfigurationId: string | null;
  onApplyConfiguration: (id: string) => void;
  onSaveCurrentConfiguration: (name: string) => void;
  onRenameConfiguration: (id: string, name: string) => void;
  onDeleteConfiguration: (id: string) => void;
}

// Legacy aliases for compatibility
export type { FilterState as TagFilterState };
