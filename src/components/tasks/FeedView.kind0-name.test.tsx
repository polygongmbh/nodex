import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedView } from "./FeedView";
import { Task, Channel, Relay, Person } from "@/types";

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({ user: null }),
}));

const authorId = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const taskAuthor: Person = {
  id: authorId,
  name: "me",
  displayName: "You",
  isOnline: true,
  isSelected: false,
};

const peopleAuthor: Person = {
  id: authorId,
  name: "janek",
  displayName: "Janek",
  isOnline: true,
  isSelected: false,
};

const tasks: Task[] = [
  {
    id: "task-1",
    author: taskAuthor,
    content: "Task content #general",
    tags: ["general"],
    relays: ["demo"],
    taskType: "task",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    likes: 0,
    replies: 0,
    reposts: 0,
    status: "todo",
  },
];

const channels: Channel[] = [{ id: "general", name: "general", filterState: "neutral" }];
const relays: Relay[] = [{ id: "demo", name: "Demo", icon: "D", isActive: true }];

describe("FeedView kind:0 author labels", () => {
  it("prefers kind:0 person name over legacy author display labels", () => {
    render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={[peopleAuthor]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(screen.getByText(/Janek/)).toBeInTheDocument();
    expect(screen.queryByText(/You \(/)).not.toBeInTheDocument();
  });
});
