export interface Relay {
  id: string;
  name: string;
  icon: string;
  isActive: boolean;
  connectionStatus?: "connected" | "read-only" | "connecting" | "disconnected" | "connection-error" | "verification-failed";
  url?: string;
  postCount?: number;
}

export interface Channel {
  id: string;
  name: string;
  color?: string;
  usageCount?: number;
  filterState: 'included' | 'excluded' | 'neutral';
}

export interface PostedTag {
  name: string;
  relayIds: string[];
}

export type ChannelMatchMode = "and" | "or";

// Legacy alias for compatibility
export type Tag = Channel;

export type TaskType = "task" | "comment";
export type FeedMessageType = "offer" | "request";
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
export type TaskStatus = "todo" | "in-progress" | "done" | "closed";
export type TaskInitialStatus = Exclude<TaskStatus, "closed">;
export type OnNewTask = (
  content: string,
  tags: string[],
  relays: string[],
  taskType: string,
  dueDate?: Date,
  dueTime?: string,
  dateType?: TaskDateType,
  parentId?: string,
  initialStatus?: TaskInitialStatus,
  explicitMentionPubkeys?: string[],
  priority?: number,
  attachments?: PublishedAttachment[],
  nip99?: Nip99Metadata,
  locationGeohash?: string
) => Promise<TaskCreateResult> | TaskCreateResult;

export interface TaskStateUpdate {
  id: string;
  status: TaskStatus;
  statusDescription?: string;
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
  taskType: TaskType;
  messageType?: TaskType | FeedMessageType;
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
  taskType: TaskType;
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
  status?: TaskStatus;
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

export interface SharedTaskViewContext {
  tasks: Task[];
  allTasks: Task[];
  relays?: Relay[];
  channels?: Channel[];
  channelMatchMode?: ChannelMatchMode;
  composeChannels?: Channel[];
  people?: Person[];
  currentUser?: Person;
  searchQuery?: string;
  focusedTaskId?: string | null;
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

// Legacy aliases for compatibility
export type PostType = TaskType;
export type Post = Task;
