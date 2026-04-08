import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { FeedView } from "./FeedView";
import { Task, Channel, Relay } from "@/types";
import type { Person } from "@/types/person";
import { makeChannel, makeRelay, makeTask } from "@/test/fixtures";
import { FeedSurfaceProvider, type FeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { makeQuickFilterState } from "@/test/quick-filter-state";

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: (): { user: null } => ({ user: null }),
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
const dispatchFeedInteraction = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
});

type FeedViewProps = ComponentProps<typeof FeedView>;

function renderFeedView(
  props: FeedViewProps,
  surfaceOverrides: Partial<FeedSurfaceState> = {}
) {
  const surfaceState: FeedSurfaceState = {
    relays,
    channels,
    composeChannels: channels,
    people: [author],
    mentionablePeople: [author],
    searchQuery: "",
    quickFilters: makeQuickFilterState(),
    channelMatchMode: "and",
    ...surfaceOverrides,
  };

  return render(
    <FeedSurfaceProvider value={surfaceState}>
      <FeedView {...props} />
    </FeedSurfaceProvider>
  );
}

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
    render(
      <FeedView
        tasks={[child]}
        allTasks={[root, child]}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /focus task: root task general/i }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "root" });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "child" });
  });

  it("opens raw nostr event dialog on shift+alt+click and does not focus the task", () => {
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
      />
    );

    const row = container.querySelector('[data-task-id="task-raw"]');
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLElement, { shiftKey: true, altKey: true, button: 0 });

    expect(screen.getByText("Raw Nostr Event")).toBeInTheDocument();
    expect(screen.getByText(/"id": "event-raw-1"/)).toBeInTheDocument();
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "task-raw" });
  });

  it("hydrates the feed incrementally instead of mounting all entries at once", () => {
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
      />
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);
    expect(screen.queryByText("Task 41 #general")).not.toBeInTheDocument();
  });

  it("reveals more entries when scrolling near the end of the feed", () => {
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
        searchQueryOverride=""
      />
    );

    const scroller = container.querySelector('[data-onboarding="task-list"]');
    expect(scroller).not.toBeNull();
    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);

    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      value: 2400,
    });
    Object.defineProperty(scroller, "clientHeight", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      value: 600,
    });

    fireEvent.scroll(scroller as HTMLElement);

    expect(container.querySelectorAll("[data-task-id]").length).toBe(70);
  });

  it("reveals more entries before reaching the exact end of the feed", () => {
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
        searchQueryOverride=""
      />
    );

    const scroller = container.querySelector('[data-onboarding="task-list"]');
    expect(scroller).not.toBeNull();
    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);

    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      value: 2400,
    });
    Object.defineProperty(scroller, "clientHeight", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      value: 300,
    });

    fireEvent.scroll(scroller as HTMLElement);

    expect(container.querySelectorAll("[data-task-id]").length).toBe(70);
  });

  it("hides the scope footer while more feed entries still remain to hydrate", () => {
    const manyTasks = Array.from({ length: 75 }, (_, index) =>
      makeTask({
        id: `task-${index + 1}`,
        content: `Task ${index + 1} #general`,
        author,
        status: "todo",
        timestamp: new Date(2026, 0, 1, 0, 75 - index),
      })
    );

    const scopedPerson = { ...author, isSelected: true };
    const { container } = renderFeedView(
      {
        tasks: manyTasks,
        allTasks: manyTasks,
        searchQueryOverride: "",
      },
      {
        people: [scopedPerson],
        mentionablePeople: [scopedPerson],
      }
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);
    expect(container.querySelector('[data-empty-mode="footer"]')).not.toBeInTheDocument();
  });

  it("hides the scope footer while the feed is still hydrating even if the current batch is full", () => {
    const manyTasks = Array.from({ length: 40 }, (_, index) =>
      makeTask({
        id: `task-${index + 1}`,
        content: `Task ${index + 1} #general`,
        author,
        status: "todo",
        timestamp: new Date(2026, 0, 1, 0, 40 - index),
      })
    );

    const scopedPerson = { ...author, isSelected: true };
    const { container } = renderFeedView(
      {
        tasks: manyTasks,
        allTasks: manyTasks,
        searchQueryOverride: "",
        isHydrating: true,
      },
      {
        people: [scopedPerson],
        mentionablePeople: [scopedPerson],
      }
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);
    expect(container.querySelector('[data-empty-mode="footer"]')).not.toBeInTheDocument();
  });

  it("re-clamps the visible feed window when clearing a broadening filter", () => {
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

    const includedChannel = makeChannel({ id: "frontend", name: "frontend", filterState: "included" });
    const neutralChannel = makeChannel({ id: "frontend", name: "frontend", filterState: "neutral" });
    const { container, rerender } = renderFeedView(
      {
        tasks: manyTasks,
        allTasks: manyTasks,
        searchQueryOverride: "",
      },
      {
        channels: [includedChannel],
        composeChannels: [includedChannel],
      }
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(10);

    rerender(
      <FeedSurfaceProvider
        value={{
          relays,
          channels: [neutralChannel],
          composeChannels: [neutralChannel],
          people: [author],
          mentionablePeople: [author],
          searchQuery: "",
          quickFilters: makeQuickFilterState(),
          channelMatchMode: "and",
        }}
      >
        <FeedView
          tasks={manyTasks}
          allTasks={manyTasks}
          searchQueryOverride=""
        />
      </FeedSurfaceProvider>
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);
  });

  it("re-clamps the visible feed window when active relay scope changes", async () => {
    const relayOne = makeRelay({ id: "relay-one", name: "Relay One", url: "wss://relay.one", isActive: true });
    const relayTwo = makeRelay({ id: "relay-two", name: "Relay Two", url: "wss://relay.two", isActive: true });
    const manyTasks = Array.from({ length: 90 }, (_, index) =>
      makeTask({
        id: `task-${index + 1}`,
        content: `Task ${index + 1} #general`,
        author,
        relays: index < 45 ? ["relay-one"] : ["relay-two"],
        status: "todo",
        timestamp: new Date(2026, 0, 1, 0, 90 - index),
      })
    );

    const { container, rerender } = renderFeedView(
      {
        tasks: manyTasks,
        allTasks: manyTasks,
        searchQueryOverride: "",
      },
      {
        relays: [relayOne, relayTwo],
      }
    );

    const scroller = container.querySelector('[data-onboarding="task-list"]');
    expect(scroller).not.toBeNull();

    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      get: () => 1800,
    });
    Object.defineProperty(scroller, "clientHeight", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      value: 600,
    });

    fireEvent.scroll(scroller as HTMLElement);

    await waitFor(() => {
      expect(container.querySelectorAll("[data-task-id]").length).toBe(70);
    });

    rerender(
      <FeedSurfaceProvider
        value={{
          relays: [relayOne, { ...relayTwo, isActive: false }],
          channels,
          composeChannels: channels,
          people: [author],
          mentionablePeople: [author],
          searchQuery: "",
          quickFilters: makeQuickFilterState(),
          channelMatchMode: "and",
        }}
      >
        <FeedView
          tasks={manyTasks.filter((task) => task.relays.includes("relay-one"))}
          allTasks={manyTasks}
          searchQueryOverride=""
        />
      </FeedSurfaceProvider>
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);
  });

  it("re-clamps the visible feed window when quick filters change", async () => {
    const manyTasks = Array.from({ length: 90 }, (_, index) =>
      makeTask({
        id: `task-${index + 1}`,
        content: `Task ${index + 1} #general`,
        author,
        priority: index < 45 ? 80 : 20,
        status: "todo",
        timestamp: new Date(2026, 0, 1, 0, 90 - index),
      })
    );

    const { container, rerender } = renderFeedView(
      {
        tasks: manyTasks,
        allTasks: manyTasks,
        searchQueryOverride: "",
      }
    );

    const scroller = container.querySelector('[data-onboarding="task-list"]');
    expect(scroller).not.toBeNull();

    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      get: () => 1800,
    });
    Object.defineProperty(scroller, "clientHeight", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      value: 600,
    });

    fireEvent.scroll(scroller as HTMLElement);

    await waitFor(() => {
      expect(container.querySelectorAll("[data-task-id]").length).toBe(70);
    });

    rerender(
      <FeedSurfaceProvider
        value={{
          relays,
          channels,
          composeChannels: channels,
          people: [author],
          mentionablePeople: [author],
          searchQuery: "",
          quickFilters: makeQuickFilterState({ priorityEnabled: true, minPriority: 50 }),
          channelMatchMode: "and",
        }}
      >
        <FeedView
          tasks={manyTasks}
          allTasks={manyTasks}
          searchQueryOverride=""
        />
      </FeedSurfaceProvider>
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);
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
      />
    );

    const rootButton = screen.getByRole("button", { name: /focus task: root breadcrumb/i });
    const middleButton = screen.getByRole("button", { name: /focus task: middle breadcrumb/i });
    expect(rootButton).toBeInTheDocument();
    expect(middleButton).toBeInTheDocument();
  });

  it("omits the active focused item from task-card breadcrumbs", () => {
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
        focusedTaskId="middle"
      />
    );

    expect(screen.queryByRole("button", { name: /focus task: root breadcrumb/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /focus task: middle breadcrumb/i })).not.toBeInTheDocument();
  });

  it("shows a shortened fallback npub on slim desktop", async () => {
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
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("feed-author-primary-task-pubkey")).toBeInTheDocument();
    });
    const fallbackAuthorLabel = screen.getByTestId("feed-author-primary-task-pubkey");
    expect(fallbackAuthorLabel).toHaveTextContent("npub1");
    expect(fallbackAuthorLabel.textContent).toContain("…");
    expect(fallbackAuthorLabel.closest("button")).not.toHaveAttribute("title");
    matchMediaSpy.mockRestore();
  });

  it("shows the full fallback npub on xl desktop widths", async () => {
    const pubkeyOnlyAuthor: Person = {
      id: author.id,
      name: author.id,
      displayName: author.id,
      isOnline: true,
      isSelected: false,
    };
    const pubkeyTask = makeTask({ id: "task-pubkey-2xl", author: pubkeyOnlyAuthor, status: "todo" });
    const matchMediaSpy = vi
      .spyOn(window, "matchMedia")
      .mockImplementation((query: string) => ({
        matches: query === "(min-width: 1280px)",
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
      />
    );

    await waitFor(() => {
      const fallbackAuthorLabel = screen.getByTestId("feed-author-primary-task-pubkey-2xl");
      expect(fallbackAuthorLabel.textContent).toContain("npub1");
      expect(fallbackAuthorLabel.textContent).not.toContain("…");
    });
    matchMediaSpy.mockRestore();
  });

  it("keeps username metadata inline on slim desktop", async () => {
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
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("feed-author-primary-task-1")).toBeInTheDocument();
    });

    expect(screen.getByTestId("feed-author-primary-task-1")).toBeVisible();
    expect(screen.getByTestId("feed-author-secondary-task-1")).toBeVisible();

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
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("feed-author-primary-task-1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("feed-author-primary-task-1")).toBeVisible();
    expect(screen.getByTestId("feed-author-secondary-task-1")).toBeVisible();

    matchMediaSpy.mockRestore();
  });

  it("shows author metadata label with username and feed-truncated npub", () => {
    render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
      />
    );

    expect(screen.getByTestId("feed-author-primary-task-1")).toHaveTextContent("Alice Doe");
    expect(screen.getByTestId("feed-author-secondary-task-1")).toHaveTextContent("@alice · npub1");
    expect(screen.getByTestId("feed-author-secondary-task-1").textContent).toMatch(/…[a-z0-9]{3}\)$/i);
    expect(screen.getByTitle(/task created at/i)).toHaveAttribute(
      "title",
      expect.stringMatching(/task created at .*\d{2}:\d{2}:\d{2}/i)
    );
  });

  it("right-aligns timeline timestamps and formats same-day and yesterday labels", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));
    try {
      const taskWithStateUpdates = makeTask({
        id: "task-timestamp-formatting",
        author,
        content: "Reconnect relays after resume #infra",
        status: "todo",
        timestamp: new Date("2026-04-03T09:15:00.000Z"),
        stateUpdates: [
          {
            id: "state-timestamp-yesterday",
            status: "in-progress",
            statusDescription: "Working on relay reconnect",
            timestamp: new Date("2026-04-02T18:45:00.000Z"),
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
        />
      );

      const taskTimestamp = screen.getByTitle(/task created at/i);
      const stateTimestamp = screen.getByTitle(/status updated at/i);

      expect(taskTimestamp).toHaveTextContent("11:15 AM");
      expect(stateTimestamp).toHaveTextContent("yesterday 08:45 PM");
    } finally {
      vi.useRealTimers();
    }
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
        isMobile
      />
    );

    expect(screen.queryByTestId("feed-author-secondary-task-1")).not.toBeInTheDocument();
  });

  it("does not truncate content for the active focused task", () => {
    const longTask = makeTask({
      id: "task-long-active",
      author,
      content: `${"Long content #general ".repeat(40)}end`,
      status: "todo",
    });
    const { container, rerender } = render(
      <FeedView
        tasks={[longTask]}
        allTasks={[longTask]}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
      />
    );

    const row = container.querySelector('[data-task-id="task-long-active"]');
    expect(row?.querySelector(".line-clamp-3")).not.toBeNull();

    rerender(
      <FeedView
        tasks={[longTask]}
        allTasks={[longTask]}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
        focusedTaskId="task-long-active"
      />
    );

    const focusedRow = container.querySelector('[data-task-id="task-long-active"]');
    expect(focusedRow?.querySelector(".line-clamp-3")).toBeNull();
  });

  it("supports modifier-based author filtering from the author label", () => {
    render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /person actions for/i })[0], { ctrlKey: true });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "person.filter.exclusive",
      person: author,
    });
  });

  it("supports Ctrl/Cmd+Alt author shortcuts for filter and mention", () => {
    render(
      <FeedView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /person actions for/i })[0], {
      ctrlKey: true,
      altKey: true,
    });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "person.filterAndMention",
      person: author,
    });
  });

  it("renders pubkey mentions as @name links and supports modifier shortcuts", () => {
    const mentionedPubkey = author.id;
    const mentionTask = makeTask({
      id: "task-mention",
      author,
      content: `Please review @${mentionedPubkey} #frontend`,
      status: "todo",
    });

    renderFeedView({
      tasks: [mentionTask],
      allTasks: [mentionTask],
      searchQueryOverride: "",
    });

    const mention = screen.getByRole("button", { name: "Person actions for alice" });
    expect(mention).toHaveTextContent("@alice");

    fireEvent.click(mention, { ctrlKey: true });
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "person.filter.exclusive",
      person: author,
    });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({
      type: "task.focus.change",
      taskId: "task-mention",
    });
  });

  it("uses fallback person shortcuts for unresolved mention tokens and does not focus row", () => {
    const unresolvedPubkey = "b".repeat(64);
    const mentionTask = makeTask({
      id: "task-mention-fallback",
      author,
      content: `Please review @${unresolvedPubkey} #frontend`,
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
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /person actions for npub1/i }), { altKey: true });
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "person.compose.mention",
      person: expect.objectContaining({
        id: unresolvedPubkey,
      }),
    });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({
      type: "task.focus.change",
      taskId: "task-mention-fallback",
    });
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

    renderFeedView({
      tasks: [mentionTask],
      allTasks: [mentionTask],
      searchQueryOverride: "",
    });

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

  it("uses first-line-only task titles with capped width after the actor in progress update rows", () => {
    const taskWithLongMultilineTitle = makeTask({
      id: "task-state-title-tooltip",
      author,
      content: "Reconnect relays after resume infra and verify mobile queue drain #general\nSecond line should stay out of the tooltip",
      status: "todo",
      stateUpdates: [
        {
          id: "state-title-tooltip",
          status: "in-progress",
          statusDescription: "Working on relay reconnect",
          timestamp: new Date(Date.now() - 5 * 60 * 1000),
          authorPubkey: author.id,
        },
      ],
    });

    render(
      <FeedView
        tasks={[taskWithLongMultilineTitle]}
        allTasks={[taskWithLongMultilineTitle]}
        relays={relays}
        channels={channels}
        people={[author]}
        searchQuery=""
      />
    );

    const titleButton = screen.getByRole("button", {
      name: /^focus task: reconnect relays after resume infra and verify mobile queue drain #general$/i,
    });
    const stateRow = screen.getByTestId("feed-state-entry-state-title-tooltip");
    const actorButton = within(stateRow).getByRole("button", {
      name: /person actions for alice doe/i,
    });

    expect(titleButton).toHaveAttribute("title");
    expect(titleButton).not.toHaveAttribute("title", expect.stringContaining("Second line"));
    expect(titleButton).not.toHaveAttribute("title", expect.stringContaining("..."));
    expect(
      actorButton.compareDocumentPosition(titleButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
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
      />
    );

    expect(container.querySelector('[data-task-id="task-closed-with-updates"]')).not.toBeInTheDocument();
    expect(screen.getByTestId("feed-state-entry-close-update-1")).toBeInTheDocument();
    expect(screen.getByTestId("feed-state-entry-close-update-1")).toHaveTextContent("Closed");
  });

  it("renders a local inline scope hint when source posts exist but none match the current scope", () => {
    const { container } = renderFeedView(
      {
        tasks,
        allTasks: tasks,
        searchQueryOverride: "nomatchquery",
      },
      {
        channels: [makeChannel({ id: "general", name: "general", filterState: "included" })],
      }
    );

    expect(container.querySelector('[data-empty-mode="inline"]')).toBeInTheDocument();
    expect(container.querySelector('[data-task-id="task-1"]')).not.toBeInTheDocument();
  });

  it("renders a screen empty state when the feed has no source posts", () => {
    const { container } = renderFeedView(
      {
        tasks: [],
        allTasks: [],
        searchQueryOverride: "",
      },
      {
        channels: [],
        people: [],
        mentionablePeople: [],
      }
    );

    expect(container.querySelector('[data-empty-mode="inline"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-empty-mode="screen"]')).toBeInTheDocument();
  });

  it("renders a scope footer hint at the end when filtered results are visible", () => {
    const selectedAuthor = { ...author, isSelected: true };
    const { container } = renderFeedView(
      {
        tasks,
        allTasks: tasks,
        searchQueryOverride: "",
      },
      {
        people: [selectedAuthor],
        mentionablePeople: [selectedAuthor],
      }
    );

    const footerState = container.querySelector('[data-empty-mode="footer"]');
    expect(footerState).toBeInTheDocument();
    expect(footerState).toHaveTextContent("Alice Doe");
    expect(footerState).toHaveTextContent("Demo");
    expect(container.querySelector('[data-empty-mode="inline"]')).not.toBeInTheDocument();
  });

  it("renders a scope footer hint at the end for a feed-only selection", () => {
    const singleRelay = [makeRelay({ id: "feed-example", name: "Feed Example", url: "wss://feed.example.com" })];
    const { container } = renderFeedView(
      {
        tasks,
        allTasks: tasks,
        searchQueryOverride: "",
      },
      {
        relays: singleRelay,
      }
    );

    const footerState = container.querySelector('[data-empty-mode="footer"]');
    expect(footerState).toBeInTheDocument();
    expect(footerState).toHaveTextContent("feed.example.com");
  });

  it("keeps showing feed posts on mobile when the current scope has no matches", () => {
    const { container } = renderFeedView(
      {
        tasks,
        allTasks: tasks,
        searchQueryOverride: "nomatchquery",
        isMobile: true,
      },
      {
        channels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
      }
    );

    expect(document.querySelector('[data-empty-mode="mobile"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-task-id="task-1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-empty-mode="inline"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-empty-mode="footer"]')).not.toBeInTheDocument();
  });

  it("ignores selected people as well as channel filters for the mobile fallback", () => {
    const selectedAuthor = { ...author, isSelected: true };
    const otherAuthor: Person = {
      id: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      name: "bob",
      displayName: "Bob Doe",
      isOnline: true,
      isSelected: false,
    };
    const otherTask = makeTask({
      id: "task-2",
      content: "Ship #general",
      tags: ["general"],
      author: otherAuthor,
      status: "todo",
    });

    const { container } = renderFeedView(
      {
        tasks: [otherTask],
        allTasks: [otherTask],
        searchQueryOverride: "",
        isMobile: true,
      },
      {
        channels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
        composeChannels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
        people: [selectedAuthor, otherAuthor],
        mentionablePeople: [selectedAuthor, otherAuthor],
      }
    );

    expect(document.querySelector('[data-empty-mode="mobile"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-task-id="task-2"]')).toBeInTheDocument();
    expect(container.querySelector('[data-empty-mode="inline"]')).not.toBeInTheDocument();
  });

  it("updates task priority from the feed priority chip", () => {
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
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /priority/i }), {
      target: { value: "4" },
    });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.updatePriority",
      taskId: "task-priority",
      priority: 80,
    });
  });

  it("updates date type from the feed due-date chip", () => {
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
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /type/i }), {
      target: { value: "scheduled" },
    });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.updateDueDate",
      taskId: "task-due-date",
      dueDate,
      dueTime: undefined,
      dateType: "scheduled",
    });
  });

});
