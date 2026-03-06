import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedView } from "./FeedView";
import { Task, Channel, Relay, Person } from "@/types";
import { formatAuthorMetaLabel } from "@/lib/person-label";
import { makeChannel, makeRelay, makeTask } from "@/test/fixtures";

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

const tasks: Task[] = [makeTask({ id: "task-1", author, status: "todo" })];
const channels: Channel[] = [makeChannel()];
const relays: Relay[] = [makeRelay()];

describe("FeedView", () => {
  it("focuses breadcrumb target without bubbling card focus", () => {
    const root = makeTask({ id: "root", content: "Root task #general", author, status: "todo" });
    const child = makeTask({
      id: "child",
      parentId: "root",
      content: "Child task #general",
      author,
      status: "todo",
    });
    const onFocusTask = vi.fn();

    render(
      <FeedView
        tasks={[child]}
        allTasks={[root, child]}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
        onFocusTask={onFocusTask}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /focus task: root task #general/i }));
    expect(onFocusTask).toHaveBeenCalledWith("root");
    expect(onFocusTask).not.toHaveBeenCalledWith("child");
  });

  it("shortens fallback pubkey label on slim desktop widths", async () => {
    const pubkeyOnlyAuthor: Person = {
      id: author.id,
      name: author.id,
      displayName: author.id,
      isOnline: true,
      isSelected: false,
    };
    const pubkeyTask = makeTask({ id: "task-pubkey", author: pubkeyOnlyAuthor, status: "todo" });
    const matchMediaSpy = vi
      .spyOn(window, "matchMedia")
      .mockImplementation((query: string) => ({
        matches: query === "(min-width: 768px) and (max-width: 1023px)",
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }));

    render(
      <FeedView
        tasks={[pubkeyTask]}
        allTasks={[pubkeyTask]}
        relays={relays}
        channels={channels}
        people={[pubkeyOnlyAuthor]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("0123456789ab…89abcdef")).toBeInTheDocument();
    });
    matchMediaSpy.mockRestore();
  });

  it("keeps author metadata inline when desktop is beyond slim breakpoint", async () => {
    const matchMediaSpy = vi
      .spyOn(window, "matchMedia")
      .mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }));

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

    await waitFor(() => {
      expect(screen.getByTestId("feed-author-primary-task-1")).toBeInTheDocument();
    });
    // Product contract: once desktop has widened past the slim sidebar layout, author metadata stays inline.
    expect(screen.getByTestId("feed-author-primary-task-1")).not.toHaveClass("block");
    // Product contract: secondary identity metadata should remain on the same line in widened desktop layout.
    expect(screen.getByTestId("feed-author-secondary-task-1")).not.toHaveClass("block");

    matchMediaSpy.mockRestore();
  });

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

  it("hides secondary author metadata on mobile for a denser header row", () => {
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
        isMobile
      />
    );

    expect(screen.queryByTestId("feed-author-secondary-task-1")).not.toBeInTheDocument();
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

  it("renders pubkey mentions as @name links and triggers author quick action", () => {
    const onAuthorClick = vi.fn();
    const mentionedPubkey = author.id;
    const mentionTask = makeTask({
      id: "task-mention",
      author,
      content: `Please review @${mentionedPubkey} #frontend`,
      status: "todo",
    });

    render(
      <FeedView
        tasks={[mentionTask]}
        allTasks={[mentionTask]}
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

    const mention = screen.getByRole("button", { name: "Open user alice" });
    expect(mention).toHaveTextContent("@alice");

    fireEvent.click(mention);
    expect(onAuthorClick).toHaveBeenCalledWith(author);
  });

  it("shows non-text mention chips from assignee pubkeys", () => {
    const mentionTask = makeTask({
      id: "task-chip",
      author,
      content: "Please review #frontend",
      status: "todo",
      assigneePubkeys: [author.id],
      mentions: [author.id],
    });

    render(
      <FeedView
        tasks={[mentionTask]}
        allTasks={[mentionTask]}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("renders task state updates as standalone compact feed items with task breadcrumb context", () => {
    const taskWithStateUpdates = makeTask({
      id: "task-state",
      author,
      content: "Reconnect relays after resume #infra",
      status: "todo",
      stateUpdates: [
        {
          id: "state-2",
          status: "in-progress",
          statusDescription: "Working on relay reconnect",
          timestamp: new Date(Date.now() - 5 * 60 * 1000),
          authorPubkey: author.id,
        },
        {
          id: "state-1",
          status: "todo",
          statusDescription: "Unblocked",
          timestamp: new Date(Date.now() - 20 * 60 * 1000),
          authorPubkey: author.id,
        },
      ],
    });

    render(
      <FeedView
        tasks={[taskWithStateUpdates]}
        allTasks={[taskWithStateUpdates]}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(screen.getByText(/working on relay reconnect/i)).toBeInTheDocument();
    expect(screen.getByText(/unblocked/i)).toBeInTheDocument();
    expect(screen.getAllByTestId(/feed-state-entry-/)).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: /focus task: reconnect relays after resume #infra/i })
    ).toHaveLength(2);
  });

  it("does not duplicate state label when status description matches it", () => {
    const taskWithStateUpdate = makeTask({
      id: "task-state-dedupe",
      author,
      content: "Task state update test #test",
      status: "todo",
      stateUpdates: [
        {
          id: "state-dedupe",
          status: "in-progress",
          statusDescription: "In Progress",
          timestamp: new Date(Date.now() - 5 * 60 * 1000),
          authorPubkey: author.id,
        },
      ],
    });

    render(
      <FeedView
        tasks={[taskWithStateUpdate]}
        allTasks={[taskWithStateUpdate]}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(screen.getAllByText("In Progress")).toHaveLength(1);
  });

});
