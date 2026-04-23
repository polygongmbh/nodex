import type { Person } from "./person";

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
export type FeedMessageType = "offer" | "request";
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
export type TaskCreateFailureReason =
  | "not-authenticated"
  | "missing-tag"
  | "relay-selection"
  | "unexpected-error";
export type TaskCreateResult =
  | { ok: true; mode: "published" | "local" | "queued" }
  | { ok: false; reason: TaskCreateFailureReason };
export type TaskStatusType = "open" | "active" | "done" | "closed";
export interface TaskStatus {
  type: TaskStatusType;
  description?: string;
}
export type TaskInitialStatus = Exclude<TaskStatusType, "closed">;
export type OnNewTask = (
  content: string,
  tags: string[],
  relays: string[],
  taskType: PostType,
  dueDate?: Date,
  dueTime?: string,
  dateType?: TaskDateType,
  parentId?: string,
  initialStatus?: TaskInitialStatus,
  explicitMentionPubkeys?: string[],
  mentionIdentifiers?: string[],
  priority?: number,
  attachments?: PublishedAttachment[],
  nip99?: Nip99Metadata,
  locationGeohash?: string
) => Promise<TaskCreateResult> | TaskCreateResult;

export interface TaskStateUpdate {
  id: string;
  status: TaskStatus;
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
}

export interface ComposeRestoreRequest {
  id: number;
  state: ComposeRestoreState;
}

export interface Task {
  id: string;
  author: Person;
  content: string;
  tags: string[];
  relays: string[];
  taskType: TaskEntryType;
  feedMessageType?: FeedMessageType;
  nip99?: Nip99Metadata;
  locationGeohash?: string;
  timestamp: Date;
  likes: number;
  replies: number;
  reposts: number;
  lastEditedAt?: Date;
  isLiked?: boolean;
  isReposted?: boolean;
  status: TaskStatusType;
  statusDescription?: string;
  stateUpdates?: TaskStateUpdate[];
  completedBy?: string;
  dueDate?: Date;
  dueTime?: string;
  dateType?: TaskDateType;
  parentId?: string;
  mentions?: string[];
  assigneePubkeys?: string[];
  priority?: number;
  attachments?: PublishedAttachment[];
  pendingPublishToken?: string;
  pendingPublishUntil?: Date;
  rawNostrEvent?: RawNostrEvent;
}

export function getTaskStatus(task: Pick<Task, "status" | "statusDescription">): TaskStatus {
  return {
    type: task.status,
    description: task.statusDescription,
  };
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

export type Post = Task;
