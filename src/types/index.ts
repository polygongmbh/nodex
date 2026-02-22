export interface Relay {
  id: string;
  name: string;
  icon: string;
  isActive: boolean;
  connectionStatus?: "connected" | "connecting" | "disconnected" | "error";
  url?: string;
  postCount?: number;
}

export interface Channel {
  id: string;
  name: string;
  color?: string;
  filterState: 'included' | 'excluded' | 'neutral';
}

export type ChannelMatchMode = "and" | "or";

// Legacy alias for compatibility
export type Tag = Channel;

export interface Person {
  id: string;
  name: string;
  displayName: string;
  nip05?: string;
  avatar?: string;
  isOnline: boolean;
  onlineStatus?: "online" | "recent" | "offline";
  isSelected: boolean;
}

export type TaskType = "task" | "comment";
export type TaskDateType = "due" | "scheduled" | "start" | "end" | "milestone";
export type TaskCreateFailureReason =
  | "not-authenticated"
  | "missing-tag"
  | "relay-selection"
  | "unexpected-error";
export type TaskCreateResult =
  | { ok: true; mode: "published" | "local" | "queued" }
  | { ok: false; reason: TaskCreateFailureReason };

export type TaskStatus = "todo" | "in-progress" | "done";

export interface ComposeRestoreState {
  content: string;
  taskType: TaskType;
  dueDate?: Date;
  dueTime?: string;
  dateType?: TaskDateType;
  explicitMentionPubkeys?: string[];
  explicitTagNames?: string[];
  selectedRelays?: string[];
  priority?: number;
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
  timestamp: Date;
  likes: number;
  replies: number;
  reposts: number;
  lastEditedAt?: Date;
  isLiked?: boolean;
  isReposted?: boolean;
  status?: TaskStatus;
  statusDescription?: string;
  completedBy?: string;
  dueDate?: Date;
  dueTime?: string;
  dateType?: TaskDateType;
  parentId?: string;
  mentions?: string[];
  assigneePubkeys?: string[];
  priority?: number;
  pendingPublishToken?: string;
  pendingPublishUntil?: Date;
}

export interface FilterState {
  activeRelays: string[];
  includedChannels: string[];
  excludedChannels: string[];
  selectedPeople: string[];
  searchQuery: string;
}

// Legacy aliases for compatibility
export type { FilterState as TagFilterState };

// Legacy aliases for compatibility
export type PostType = TaskType;
export type Post = Task;
