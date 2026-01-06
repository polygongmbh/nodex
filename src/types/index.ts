export interface Relay {
  id: string;
  name: string;
  icon: string;
  isActive: boolean;
  postCount?: number;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  filterState: 'included' | 'excluded' | 'neutral';
}

export interface Person {
  id: string;
  name: string;
  displayName: string;
  avatar?: string;
  isOnline: boolean;
  isSelected: boolean;
}

export type TaskType = "task" | "comment";

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
  isLiked?: boolean;
  isReposted?: boolean;
  isCompleted?: boolean;
  completedBy?: string;
  dueDate?: Date;
  dueTime?: string;
  parentId?: string;
  mentions?: string[];
}

export interface FilterState {
  activeRelays: string[];
  includedTags: string[];
  excludedTags: string[];
  selectedPeople: string[];
  searchQuery: string;
}

// Legacy aliases for compatibility
export type PostType = TaskType;
export type Post = Task;
