import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedView } from "./FeedView";
import { TaskTree } from "./TaskTree";
import type { Channel, Person, Relay, Task } from "@/types";

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" } }),
}));

const relays: Relay[] = [
  { id: "demo", name: "Demo", icon: "R", isActive: true },
];
const channels: Channel[] = [{ id: "general", name: "general", filterState: "neutral" }];
const people: Person[] = [];
const tasks: Task[] = [];

describe("Feed/Tree layout consistency", () => {
  it("renders feed without heading title and with visible composer", () => {
    render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={people}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(screen.queryByText("Feed")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/what needs to be done/i)).toBeInTheDocument();
  });

  it("renders tree without heading title and with visible composer", () => {
    render(
      <TaskTree
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={people}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "All Tasks" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/what needs to be done/i)).toBeInTheDocument();
  });
});
