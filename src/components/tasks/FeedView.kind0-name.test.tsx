import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedView } from "./FeedView";
import { Task, Channel, Relay, Person } from "@/types";
import { makeChannel, makeRelay, makeTask } from "@/test/fixtures";

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

const tasks: Task[] = [makeTask({ id: "task-1", author: taskAuthor, status: "todo" })];
const channels: Channel[] = [makeChannel()];
const relays: Relay[] = [makeRelay()];

describe("FeedView kind:0 author labels", () => {
  it("prefers kind:0 metadata label and uses abbreviated pubkey when name exists", () => {
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

    expect(
      screen.getByText((_, element) => element?.textContent === "Janek (012345…cdef)")
    ).toBeInTheDocument();
    expect(screen.queryByText(/You/)).not.toBeInTheDocument();
  });
});
