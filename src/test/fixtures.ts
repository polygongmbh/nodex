import { normalizeTaskStatus, type Channel, type Relay, type Task } from "@/types";
import type { SelectablePerson } from "@/types/person";

const DEFAULT_TIME = new Date("2026-01-01T00:00:00.000Z");

export function makePerson(overrides: Partial<SelectablePerson> = {}): SelectablePerson {
  return {
    pubkey: "person-pubkey",
    name: "person",
    displayName: "Person",
    avatar: "",
    isSelected: false,
    ...overrides,
  };
}

export function makeRelay(overrides: Partial<Relay> = {}): Relay {
  return {
    id: "demo",
    name: "Demo",
    isActive: true,
    url: "wss://demo.test",
    ...overrides,
  };
}

export function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "general",
    name: "general",
    filterState: "neutral",
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  const author = overrides.author ?? makePerson({ pubkey: "author-pubkey", name: "author", displayName: "Author" });
  const timestamp = overrides.timestamp ?? DEFAULT_TIME;
  return {
    id: "task-1",
    author,
    content: "Task content #general",
    tags: ["general"],
    relays: ["demo"],
    taskType: "task",
    timestamp,
    likes: 0,
    replies: 0,
    reposts: 0,
    status: normalizeTaskStatus(overrides.status),
    ...overrides,
  };
}
