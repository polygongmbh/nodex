import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedView } from "./FeedView";
import { Task, Channel, Relay, Person } from "@/types";
import { formatAuthorMetaLabel } from "@/lib/person-label";

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({ user: null }),
}));

const author: Person = {
  id: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  name: "alice",
  displayName: "Alice Doe",
  isOnline: true,
  isSelected: false,
};

const tasks: Task[] = [
  {
    id: "task-1",
    author,
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

describe("FeedView", () => {
  it("shows author metadata label with username and shortened pubkey", () => {
    render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    const expectedLabel = formatAuthorMetaLabel({
      personId: author.id,
      displayName: author.displayName,
      username: author.name,
    });
    expect(
      screen.getByText((_, element) => element?.textContent === expectedLabel)
    ).toBeInTheDocument();
  });

  it("calls author quick action when clicking the author label", () => {
    const onAuthorClick = vi.fn();

    render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
        onAuthorClick={onAuthorClick}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /filter and mention/i })[0]);

    expect(onAuthorClick).toHaveBeenCalledWith(author);
  });

  it("uses full pubkey as the hover hint on author username", () => {
    render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(screen.getByTitle(author.id)).toHaveAttribute("aria-label", "Filter and mention Alice Doe");
  });
});
