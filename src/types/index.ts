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

export interface Post {
  id: string;
  author: Person;
  content: string;
  tags: string[];
  relay: string;
  timestamp: Date;
  likes: number;
  replies: number;
  reposts: number;
  isLiked?: boolean;
  isReposted?: boolean;
}

export interface FilterState {
  activeRelays: string[];
  includedTags: string[];
  excludedTags: string[];
  selectedPeople: string[];
}
