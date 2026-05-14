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
 * Legacy kitchen-sink shape: `kind` is the wide union and every variant's
 * fields are optional. Existing call sites accept this without narrowing.
 * New code should prefer `Post` (discriminated) plus the variant types.
 */
/**
 * Kitchen-sink superset of all variants — accepts any kind with every
 * variant's fields optional. Retained as a transition aid; new code should
 * prefer the discriminated `Post` union plus narrowing via type predicates.
 */
export interface Task extends BasePost {
  kind: NostrEventKind;
  stateUpdates?: TaskStateUpdate[];
  dates?: TaskDate[];
  assigneePubkeys?: string[];
  priority?: number;
}

/**
 * Boundary normalizer: accepts either the canonical object form or a bare
 * status-type string (event-converter inputs, test shorthands) and returns the
 * canonical object form. Internal callers reading `Task.state` directly can
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

export function getTaskState(task: Pick<Task, "stateUpdates"> | undefined): TaskState {
  return task?.stateUpdates?.[0]?.state ?? { status: "open" };
}

export function getTaskStatusFromTask(task: Pick<Task, "stateUpdates"> | undefined): TaskStatus {
  return getTaskState(task).status;
}

/**
 * Type guard that narrows any post-shaped value to also carry the
 * ListingPost-only fields (currently `nip99`). Lets call sites pass a `Task`
 * (kitchen-sink) and gain access to listing-specific fields after the check.
 */
export function isListingPost<T extends { kind: NostrEventKind }>(
  post: T | undefined
): post is T & ListingPost {
  return post?.kind === NostrEventKind.ClassifiedListing;
}

/**
 * Returns the highest-priority date attached to a task, or undefined when
 * the task has no calendar dates.
 */
export function getTaskPrimaryDate(task: Pick<Task, "dates"> | undefined): TaskDate | undefined {
  return task?.dates?.[0];
}

export function findTaskDate(
  task: Pick<Task, "dates"> | undefined,
  type: TaskDateType
): TaskDate | undefined {
  return task?.dates?.find((entry) => entry.type === type);
}

export function getLastEditedAt(task: Task): Date {
  return task.lastEditedAt ?? task.timestamp;
}

export interface SharedTaskViewContext {
  tasks: Task[];
  allTasks: Task[];
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
