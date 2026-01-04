import { Relay, Tag, Person, Post } from "@/types";

export const mockRelays: Relay[] = [
  { id: "company", name: "Company", icon: "building-2", isActive: true, postCount: 24 },
  { id: "club", name: "Club", icon: "users", isActive: false, postCount: 8 },
  { id: "gamers", name: "Gamers", icon: "gamepad-2", isActive: false, postCount: 156 },
  { id: "tech", name: "Tech", icon: "cpu", isActive: false, postCount: 42 },
];

export const mockTags: Tag[] = [
  { id: "lol", name: "lol", filterState: "neutral" },
  { id: "project", name: "project", filterState: "included" },
  { id: "daily", name: "daily", filterState: "neutral" },
  { id: "finance", name: "finance", filterState: "neutral" },
  { id: "it", name: "IT", filterState: "included" },
  { id: "random", name: "random", filterState: "excluded" },
  { id: "announcement", name: "announcement", filterState: "neutral" },
];

export const mockPeople: Person[] = [
  { id: "me", name: "me", displayName: "You", isOnline: true, isSelected: true },
  { id: "alice", name: "alice", displayName: "Alice Chen", isOnline: true, isSelected: false },
  { id: "bob", name: "bob", displayName: "Bob Smith", isOnline: false, isSelected: false },
  { id: "carol", name: "carol", displayName: "Carol Davis", isOnline: true, isSelected: false },
  { id: "david", name: "david", displayName: "David Kim", isOnline: false, isSelected: false },
];

export const mockPosts: Post[] = [
  {
    id: "1",
    author: mockPeople[1],
    content: "Just shipped the new authentication module! The Nostr integration is looking really smooth. Can't wait for everyone to try it out 🚀",
    tags: ["project", "IT"],
    relay: "company",
    postType: "message",
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    likes: 12,
    replies: 3,
    reposts: 2,
    isLiked: true,
  },
  {
    id: "2",
    author: mockPeople[2],
    content: "Quick reminder: Team standup moved to 3pm today. Also, the coffee machine in the break room is finally fixed!",
    tags: ["daily", "announcement"],
    relay: "company",
    postType: "event",
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    likes: 5,
    replies: 1,
    reposts: 0,
  },
  {
    id: "3",
    author: mockPeople[3],
    content: "Has anyone else noticed the new relay performance improvements? The message propagation is almost instant now. Really impressive work from the infrastructure team.",
    tags: ["IT", "project"],
    relay: "tech",
    postType: "message",
    timestamp: new Date(Date.now() - 1000 * 60 * 60),
    likes: 24,
    replies: 8,
    reposts: 5,
    isLiked: true,
    isReposted: true,
  },
  {
    id: "4",
    author: mockPeople[4],
    content: "Anyone up for some gaming tonight? Thinking about trying that new co-op game everyone's been talking about 🎮",
    tags: ["lol", "random"],
    relay: "gamers",
    postType: "request",
    timestamp: new Date(Date.now() - 1000 * 60 * 120),
    likes: 8,
    replies: 12,
    reposts: 0,
  },
  {
    id: "5",
    author: mockPeople[1],
    content: "Q4 budget review is scheduled for next week. Please submit your department reports by Friday. DM me if you need the template.",
    tags: ["finance", "announcement"],
    relay: "company",
    postType: "task",
    timestamp: new Date(Date.now() - 1000 * 60 * 180),
    likes: 3,
    replies: 2,
    reposts: 1,
  },
];
