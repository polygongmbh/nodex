import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { FeedView } from "./FeedView";
import { Task, Channel, Relay, Person } from "@/types";
import { formatAuthorMetaLabel } from "@/lib/person-label";
import { makeChannel, makeRelay, makeTask } from "@/test/fixtures";
import i18n from "@/lib/i18n/config";

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: null }),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect?: (date?: Date) => void }) => (
    <button type="button" onClick={() => onSelect?.(new Date("2026-05-10T00:00:00.000Z"))}>
      Select calendar date
    </button>
  ),
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

  it("opens raw nostr event dialog on shift+alt+click and does not focus the task", () => {
    const onFocusTask = vi.fn();
    const rawTask = makeTask({
      id: "task-raw",
      author,
      status: "todo",
      rawNostrEvent: {
        id: "event-raw-1",
        pubkey: author.id,
        created_at: 1700000000,
        kind: 1,
        tags: [["t", "general"]],
        content: "Raw content #general",
        sig: "f".repeat(128),
      },
    });

    const { container } = render(
      <FeedView
        tasks={[rawTask]}
        allTasks={[rawTask]}
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

    const row = container.querySelector('[data-task-id="task-raw"]');
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLElement, { shiftKey: true, altKey: true, button: 0 });

    expect(screen.getByText("Raw Nostr Event")).toBeInTheDocument();
    expect(screen.getByText(/"id": "event-raw-1"/)).toBeInTheDocument();
    expect(onFocusTask).not.toHaveBeenCalled();
  });

  it("hydrates the feed incrementally instead of mounting all entries at once", () => {
    vi.useFakeTimers();
    const manyTasks = Array.from({ length: 75 }, (_, index) =>
      makeTask({
        id: `task-${index + 1}`,
        content: `Task ${index + 1} #general`,
        author,
        status: "todo",
        timestamp: new Date(2026, 0, 1, 0, 75 - index),
      })
    );

    const { container } = render(
      <FeedView
        tasks={manyTasks}
        allTasks={manyTasks}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);

    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(container.querySelectorAll("[data-task-id]").length).toBe(70);

    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(container.querySelectorAll("[data-task-id]").length).toBe(75);
    vi.useRealTimers();
  });

  it("re-clamps the visible feed window when clearing a broadening filter", () => {
    vi.useFakeTimers();
    const manyTasks = Array.from({ length: 75 }, (_, index) =>
      makeTask({
        id: `task-${index + 1}`,
        content: index < 10 ? `Frontend task ${index + 1} #frontend` : `General task ${index + 1} #general`,
        tags: index < 10 ? ["frontend"] : ["general"],
        author,
        status: "todo",
        timestamp: new Date(2026, 0, 1, 0, 75 - index),
      })
    );

    const { container, rerender } = render(
      <FeedView
        tasks={manyTasks}
        allTasks={manyTasks}
        relays={relays}
        channels={[makeChannel({ id: "frontend", name: "frontend", filterState: "included" })]}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(10);

    rerender(
      <FeedView
        tasks={manyTasks}
        allTasks={manyTasks}
        relays={relays}
        channels={[makeChannel({ id: "frontend", name: "frontend", filterState: "neutral" })]}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);

    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(container.querySelectorAll("[data-task-id]").length).toBe(70);

    vi.useRealTimers();
  });

  it("renders breadcrumb focus buttons for long labels", () => {
    const root = makeTask({ id: "root", content: "Root breadcrumb label that should not wrap", author, status: "todo" });
    const child = makeTask({
      id: "child",
      parentId: "root",
      content: "Child task #general",
      author,
      status: "todo",
    });

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
      />
    );

    const breadcrumbButton = screen.getByRole("button", { name: /focus task: root breadcrumb label that should not wrap/i });
    expect(breadcrumbButton).toBeInTheDocument();
  });

  it("renders ancestor breadcrumb levels for multi-level task cards", () => {
    const root = makeTask({ id: "root", content: "Root breadcrumb", author, status: "todo" });
    const middle = makeTask({
      id: "middle",
      parentId: "root",
      content: "Middle breadcrumb",
      author,
      status: "todo",
    });
    const leaf = makeTask({
      id: "leaf",
      parentId: "middle",
      content: "Leaf task",
      author,
      status: "todo",
    });

    render(
      <FeedView
        tasks={[leaf]}
        allTasks={[root, middle, leaf]}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    const rootButton = screen.getByRole("button", { name: /focus task: root breadcrumb/i });
    const middleButton = screen.getByRole("button", { name: /focus task: middle breadcrumb/i });
    expect(rootButton).toBeInTheDocument();
    expect(middleButton).toBeInTheDocument();
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
      const fallbackAuthorLabel = screen.getByTestId("feed-author-primary-task-pubkey");
      expect(fallbackAuthorLabel.textContent?.startsWith("npub1")).toBe(true);
      expect(fallbackAuthorLabel.textContent).toContain("…");
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
    expect(screen.getByTitle(/task created at/i)).toHaveAttribute(
      "title",
      expect.stringMatching(/task created at .*\d{2}:\d{2}:\d{2}/i)
    );
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
    expect(screen.getByTestId("feed-state-entry-state-2")).toHaveTextContent(/in progress:\s*working on relay reconnect/i);
    expect(screen.getByText(/unblocked/i)).toBeInTheDocument();
    expect(screen.getAllByTestId(/feed-state-entry-/)).toHaveLength(2);
    expect(screen.getAllByTitle(/status updated at/i)).toHaveLength(2);
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

  it("hides closed tasks from the feed while keeping done tasks visible", () => {
    const openTask = makeTask({
      id: "task-open",
      author,
      content: "Open feed task #general",
      status: "todo",
    });
    const doneTask = makeTask({
      id: "task-done",
      author,
      content: "Done feed task #general",
      status: "done",
    });
    const closedTask = makeTask({
      id: "task-closed",
      author,
      content: "Closed feed task #general",
      status: "closed",
    });

    const { container } = render(
      <FeedView
        tasks={[openTask, doneTask, closedTask]}
        allTasks={[openTask, doneTask, closedTask]}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(container.querySelector('[data-task-id="task-open"]')).toBeInTheDocument();
    expect(container.querySelector('[data-task-id="task-done"]')).toBeInTheDocument();
    expect(container.querySelector('[data-task-id="task-closed"]')).not.toBeInTheDocument();
  });

  it("shows a focused closed task in its own feed", () => {
    const closedTask = makeTask({
      id: "task-closed-focused",
      author,
      content: "Closed focused task #general",
      status: "closed",
    });

    const { container } = render(
      <FeedView
        tasks={[closedTask]}
        allTasks={[closedTask]}
        relays={relays}
        channels={channels}
        people={[author]}
        focusedTaskId="task-closed-focused"
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(container.querySelector('[data-task-id="task-closed-focused"]')).toBeInTheDocument();
  });

  it("keeps closed-task state updates visible even when the closed task row is hidden", () => {
    const openTask = makeTask({
      id: "task-open-with-updates",
      author,
      content: "Open feed task #general",
      status: "todo",
    });
    const closedTask = makeTask({
      id: "task-closed-with-updates",
      author,
      content: "Closed feed task #general",
      status: "closed",
      stateUpdates: [
        {
          id: "close-update-1",
          status: "closed",
          timestamp: new Date(Date.now() - 30_000),
          authorPubkey: author.id,
        },
      ],
    });

    const { container } = render(
      <FeedView
        tasks={[openTask, closedTask]}
        allTasks={[openTask, closedTask]}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(container.querySelector('[data-task-id="task-closed-with-updates"]')).not.toBeInTheDocument();
    expect(screen.getByTestId("feed-state-entry-close-update-1")).toBeInTheDocument();
    expect(screen.getByTestId("feed-state-entry-close-update-1")).toHaveTextContent("Closed");
  });

  it("omits english default in-progress description when ui language is german", async () => {
    await i18n.changeLanguage("de");
    try {
      const taskWithStateUpdate = makeTask({
        id: "task-state-dedupe-german",
        author,
        content: "Task state update test #test",
        status: "todo",
        stateUpdates: [
          {
            id: "state-dedupe-german",
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

      expect(screen.getByText("In Arbeit")).toBeInTheDocument();
      expect(screen.queryByText("In Progress")).not.toBeInTheDocument();
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("renders an inline scope hint on desktop when source posts exist but none match the current scope", () => {
    render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery="nomatchquery"
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(document.querySelector('[data-empty-mode="inline"]')).toBeInTheDocument();
    expect(screen.getByText("No post yet on Demo, matching “nomatchquery”.")).toBeInTheDocument();
    expect(screen.queryByText("Broaden the scope or break the silence.")).not.toBeInTheDocument();
  });

  it("renders a scope footer hint at the end when filtered results are visible", () => {
    const selectedAuthor = { ...author, isSelected: true };
    render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={[selectedAuthor]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(document.querySelector('[data-empty-mode="footer"]')).toBeInTheDocument();
    expect(screen.getByText("This is all by Alice Doe, on Demo.")).toBeInTheDocument();
    expect(document.querySelector('[data-empty-mode="inline"]')).not.toBeInTheDocument();
  });

  it("renders a scope footer hint at the end for a feed-only selection", () => {
    const singleRelay = [makeRelay({ id: "feed-example", name: "Feed Example", url: "wss://feed.example.com" })];
    render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={singleRelay}
        channels={channels}
        people={[author]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(document.querySelector('[data-empty-mode="footer"]')).toBeInTheDocument();
    expect(screen.getByText("This is all on feed.example.com.")).toBeInTheDocument();
  });

  it("keeps showing feed posts on mobile when the current scope has no matches", () => {
    const { container } = render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery="nomatchquery"
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
        isMobile
      />
    );

    expect(document.querySelector('[data-empty-mode="mobile"]')).toBeInTheDocument();
    expect(container.querySelector('[data-task-id="task-1"]')).toBeInTheDocument();
  });

  it("updates task priority from the feed priority chip", () => {
    const onUpdatePriority = vi.fn();
    const taskWithPriority = makeTask({
      id: "task-priority",
      author,
      status: "todo",
      priority: 40,
    });

    render(
      <FeedView
        tasks={[taskWithPriority]}
        allTasks={[taskWithPriority]}
        relays={relays}
        channels={channels}
        people={[author]}
        currentUser={author}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
        onUpdatePriority={onUpdatePriority}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /priority/i }), {
      target: { value: "80" },
    });

    expect(onUpdatePriority).toHaveBeenCalledWith("task-priority", 80);
  });

  it("updates date type from the feed due-date chip", () => {
    const onUpdateDueDate = vi.fn();
    const dueDate = new Date("2026-05-01T00:00:00.000Z");
    const taskWithDueDate = makeTask({
      id: "task-due-date",
      author,
      status: "todo",
      dueDate,
      dateType: "due",
    });

    render(
      <FeedView
        tasks={[taskWithDueDate]}
        allTasks={[taskWithDueDate]}
        relays={relays}
        channels={channels}
        people={[author]}
        currentUser={author}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
        onUpdateDueDate={onUpdateDueDate}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /type/i }), {
      target: { value: "scheduled" },
    });

    expect(onUpdateDueDate).toHaveBeenCalledWith("task-due-date", dueDate, undefined, "scheduled");
  });

});
