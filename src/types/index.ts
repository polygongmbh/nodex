import type { Person } from "./person";
import { NostrEventKind } from "@/lib/nostr/types";

export interface Relay {
  id: string;
  name: string;
  isActive: boolean;
  connectionStatus?: "connected" | "read-only" | "connecting" | "disconnected" | "connection-error" | "verification-failed";
  url: string;
}

export interface Channel {
  id: string;
  name: string;
  usageCount?: number;
  filterState: 'included' | 'excluded' | 'neutral';
  /** Present when pinned; value is the display order (0 = first). */
  pinIndex?: number;
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
export type PostType = TaskEntryType | FeedMessageType;
// Legacy alias for compatibility with older task/comment-only call sites.
export type TaskType = TaskEntryType;
export type Nip99ListingStatus = "active" | "sold";
export interface Nip99Metadata {
  identifier?: string;
  title?: string;
  summary?: string;
  location?: string;
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
 */
export interface TaskDate {
  date: Date;
  /** "HH:mm" if the calendar event is time-based; absent for date-only. */
  time?: string;
  type: TaskDateType;
}
export type TaskCreateFailureReason =
  | "not-authenticated"
  | "missing-tag"
  | "relay-selection"
  | "unexpected-error";
export type TaskCreateResult =
  | { ok: true; mode: "published" | "local" | "queued" }
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

export interface ComposeRecomposeOf {
  /** Event id of the original post being re-composed. */
  eventId: string;
  /** Original event kind, used when publishing the replacing deletion event. */
  originalKind: number;
  /** Relay ids the original post lived on; used to route the deletion. */
  relayIds: string[];
  /** Parent event id of the original post, if it was a reply. */
  parentId?: string;
  /** Short excerpt of the original content, shown on the active-recompose banner. */
  contentPreview?: string;
}

export interface ComposeRestoreState {
  content: string;
  taskType: TaskEntryType;
  messageType?: PostType;
  nip99?: Nip99Metadata;
  locationGeohash?: string;
  dueDate?: Date;
  dueTime?: string;
  dateType?: TaskDateType;
  explicitMentionPubkeys?: string[];
  explicitTagNames?: string[];
  selectedRelays?: string[];
  priority?: number;
  attachments?: PublishedAttachment[];
  /** When set, a successful submission must publish a deletion for the named event. */
  recomposeOf?: ComposeRecomposeOf;
}

export interface ComposeRestoreRequest {
  id: number;
  state: ComposeRestoreState;
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
  author: Person;
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

export interface ListingPost extends BasePost {
  kind: NostrEventKind.ClassifiedListing;
  nip99: Nip99Metadata;
}

export type Post = TaskPost | CommentPost | ListingPost;

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

/**
 * Returns the highest-priority date attached to a post, or undefined for
 * variants that don't carry dates.
 */
export function getTaskPrimaryDate(post: Post | undefined): TaskDate | undefined {
  return post && isTaskPost(post) ? post.dates[0] : undefined;
}

export function findTaskDate(
  post: Post | undefined,
  type: TaskDateType
): TaskDate | undefined {
  return post && isTaskPost(post) ? post.dates.find((entry) => entry.type === type) : undefined;
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

export interface SharedTaskViewContext {
  tasks: Post[];
  allTasks: Post[];
  currentUser?: Person;
  focusedTaskId: string | null;
  composeRestoreRequest?: ComposeRestoreRequest | null;
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
