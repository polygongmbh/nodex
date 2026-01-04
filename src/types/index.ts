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

export type PostType = "message" | "task" | "event" | "offer" | "request" | "blog";

export interface Post {
  id: string;
  author: Person;
  content: string;
  tags: string[];
  relays: string[];
  postType: PostType;
  timestamp: Date;
  likes: number;
  replies: number;
  reposts: number;
  isLiked?: boolean;
  isReposted?: boolean;
  // Task-specific
  isCompleted?: boolean;
  completedBy?: string;
  // Event/Task date
  dueDate?: Date;
  dueTime?: string;
  // Reference/reply
  replyTo?: string;
  mentions?: string[];
}

export interface FilterState {
  activeRelays: string[];
  includedTags: string[];
  excludedTags: string[];
  selectedPeople: string[];
}
