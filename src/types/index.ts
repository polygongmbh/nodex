export interface Relay {
  id: string;
  name: string;
  icon: string;
  isActive: boolean;
  url?: string;
  postCount?: number;
}

export interface Channel {
  id: string;
  name: string;
  color?: string;
  filterState: 'included' | 'excluded' | 'neutral';
}

// Legacy alias for compatibility
export type Tag = Channel;

export interface Person {
  id: string;
  name: string;
  displayName: string;
  nip05?: string;
  avatar?: string;
  isOnline: boolean;
  isSelected: boolean;
}

export type TaskType = "task" | "comment";

export type TaskStatus = "todo" | "in-progress" | "done";

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
  parentId?: string;
  mentions?: string[];
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
