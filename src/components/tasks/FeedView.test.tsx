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
        matches: query === "(min-width: 768px) and (max-width: 1279px)",
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

});
