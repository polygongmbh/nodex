import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { FeedView } from "./FeedView";
import { Task, Channel, Relay } from "@/types";
import type { Person } from "@/types/person";
import { makeChannel, makeRelay, makeTask } from "@/test/fixtures";
import { FeedSurfaceProvider, type FeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { makeQuickFilterState } from "@/test/quick-filter-state";
import * as linkify from "@/lib/linkify";

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
  pubkey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  name: "alice",
  displayName: "Alice Doe",
};

const tasks: Task[] = [makeTask({ id: "task-1", author, status: "open" })];
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
type TestFeedViewProps = Omit<FeedViewProps, "focusedTaskId"> & { focusedTaskId?: string | null };

function renderFeedView(
  { focusedTaskId = null, ...rest }: TestFeedViewProps,
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
      <FeedView focusedTaskId={focusedTaskId} {...rest} />
    </FeedSurfaceProvider>
  );
}

function makeFeedTasks(
  length: number,
  build?: (index: number) => Partial<Task>
): Task[] {
  return Array.from({ length }, (_, index) =>
    makeTask({
      id: `task-${index + 1}`,
      content: `Task ${index + 1} #general`,
      author,
      status: "open",
      timestamp: new Date(2026, 0, 1, 0, length - index),
      ...build?.(index),
    })
  );
}

describe("FeedView", () => {
  const chooseComboboxOptionByIndex = (name: string | RegExp, optionIndex: number) => {
    const trigger = screen.getByRole("combobox", { name });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);
    const option = within(screen.getByRole("listbox")).getAllByRole("option")[optionIndex];
    fireEvent.pointerUp(option);
    fireEvent.click(option);
  };

  it("focuses breadcrumb target without bubbling card focus", () => {
    const root = makeTask({ id: "root", content: "Root task #general", author, status: "open" });
    const child = makeTask({
      id: "child",
      parentId: "root",
      content: "Child task #general",
      author,
      status: "open",
    });
    render(
      <FeedView
        focusedTaskId={null}
        tasks={[child]}
        allTasks={[root, child]}
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
      status: "open",
      rawNostrEvent: {
        id: "event-raw-1",
        pubkey: author.pubkey,
        created_at: 1700000000,
        kind: 1,
        tags: [["t", "general"]],
        content: "Raw content #general",
        sig: "f".repeat(128),
      },
    });

    const { container } = render(
      <FeedView
        focusedTaskId={null}
        tasks={[rawTask]}
        allTasks={[rawTask]}
      />
    );

    const row = container.querySelector('[data-task-id="task-raw"]');
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLElement, { shiftKey: true, altKey: true, button: 0 });

    expect(screen.getByText("Raw Nostr Event")).toBeInTheDocument();
    expect(screen.getByText(/"id": "event-raw-1"/)).toBeInTheDocument();
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "task-raw" });
  });

  it("does not rebuild unrelated task content when focus moves to a sibling task", () => {
    const firstTask = makeTask({
      id: "task-1",
      content: "First task #general https://example.com/alpha",
      author,
      status: "open",
    });
    const secondTask = makeTask({
      id: "task-2",
      content: "Second task #general",
      author,
      status: "open",
    });
    const linkifySpy = vi.spyOn(linkify, "linkifyContent");

    const { rerender } = render(
      <FeedSurfaceProvider
        value={{
          relays,
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
          focusedTaskId={null}
          tasks={[firstTask, secondTask]}
          allTasks={[firstTask, secondTask]}
        />
      </FeedSurfaceProvider>
    );

    const initialFirstTaskCalls = linkifySpy.mock.calls.filter(([content]) => content === firstTask.content).length;
    expect(initialFirstTaskCalls).toBeGreaterThan(0);

    rerender(
      <FeedSurfaceProvider
        value={{
          relays,
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
          focusedTaskId="task-2"
          tasks={[firstTask, secondTask]}
          allTasks={[firstTask, secondTask]}
        />
      </FeedSurfaceProvider>
    );

    const nextFirstTaskCalls = linkifySpy.mock.calls.filter(([content]) => content === firstTask.content).length;
    expect(nextFirstTaskCalls).toBe(initialFirstTaskCalls);
  });

  it("hydrates the feed incrementally instead of mounting all entries at once", () => {
    const manyTasks = makeFeedTasks(41);

    const { container } = render(
      <FeedView
        focusedTaskId={null}
        tasks={manyTasks}
        allTasks={manyTasks}
      />
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);
    expect(screen.queryByText("Task 41 #general")).not.toBeInTheDocument();
  });

  it("reveals more entries before reaching the exact end of the feed", () => {
    const manyTasks = makeFeedTasks(71);

    const { container } = render(
      <FeedView
        focusedTaskId={null}
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
    const manyTasks = makeFeedTasks(41);

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
    expect(screen.queryByText(/This is all/)).not.toBeInTheDocument();
  });

  it("hides the scope footer while the feed is still hydrating even if the current batch is full", () => {
    const manyTasks = Array.from({ length: 40 }, (_, index) =>
      makeTask({
        id: `task-${index + 1}`,
        content: `Task ${index + 1} #general`,
        author,
        status: "open",
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
    expect(screen.queryByText(/This is all/)).not.toBeInTheDocument();
  });

  it("re-clamps the visible feed window when clearing a broadening filter", () => {
    const manyTasks = makeFeedTasks(71, (index) => ({
      content: index < 10 ? `Frontend task ${index + 1} #frontend` : `General task ${index + 1} #general`,
      tags: index < 10 ? ["frontend"] : ["general"],
    }));

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
        focusedTaskId={null}
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
    const manyTasks = makeFeedTasks(82, (index) => ({
      relays: index < 41 ? ["relay-one"] : ["relay-two"],
    }));

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
        focusedTaskId={null}
          tasks={manyTasks.filter((task) => task.relays.includes("relay-one"))}
          allTasks={manyTasks}
          searchQueryOverride=""
        />
      </FeedSurfaceProvider>
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);
  });

  it("re-clamps the visible feed window when quick filters change", async () => {
    const manyTasks = makeFeedTasks(82, (index) => ({
      priority: index < 41 ? 80 : 20,
    }));

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
        focusedTaskId={null}
          tasks={manyTasks}
          allTasks={manyTasks}
          searchQueryOverride=""
        />
      </FeedSurfaceProvider>
    );

    expect(container.querySelectorAll("[data-task-id]").length).toBe(40);
  });

  it("renders breadcrumb focus buttons for long labels", () => {
    const root = makeTask({ id: "root", content: "Root breadcrumb label that should not wrap", author, status: "open" });
    const child = makeTask({
      id: "child",
      parentId: "root",
      content: "Child task #general",
      author,
      status: "open",
    });

    render(
      <FeedView
        focusedTaskId={null}
        tasks={[child]}
        allTasks={[root, child]}
      />
    );

    const breadcrumbButton = screen.getByRole("button", { name: /focus task: root breadcrumb label that should not wrap/i });
    expect(breadcrumbButton).toBeInTheDocument();
  });

  it("renders ancestor breadcrumb levels for multi-level task cards", () => {
    const root = makeTask({ id: "root", content: "Root breadcrumb", author, status: "open" });
    const middle = makeTask({
      id: "middle",
      parentId: "root",
      content: "Middle breadcrumb",
      author,
      status: "open",
    });
    const leaf = makeTask({
      id: "leaf",
      parentId: "middle",
      content: "Leaf task",
      author,
      status: "open",
    });

    render(
      <FeedView
        focusedTaskId={null}
        tasks={[leaf]}
        allTasks={[root, middle, leaf]}
      />
    );

    const rootButton = screen.getByRole("button", { name: /focus task: root breadcrumb/i });
    const middleButton = screen.getByRole("button", { name: /focus task: middle breadcrumb/i });
    expect(rootButton).toBeInTheDocument();
    expect(middleButton).toBeInTheDocument();
  });

  it("omits the active focused item from task-card breadcrumbs", () => {
    const root = makeTask({ id: "root", content: "Root breadcrumb", author, status: "open" });
    const middle = makeTask({
      id: "middle",
      parentId: "root",
      content: "Middle breadcrumb",
      author,
      status: "open",
    });
    const leaf = makeTask({
      id: "leaf",
      parentId: "middle",
      content: "Leaf task",
      author,
      status: "open",
    });

    render(
      <FeedView
        focusedTaskId="middle"
        tasks={[leaf]}
        allTasks={[root, middle, leaf]}
      />
    );

    expect(screen.queryByRole("button", { name: /focus task: root breadcrumb/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /focus task: middle breadcrumb/i })).not.toBeInTheDocument();
  });

  it("shows a shortened fallback npub on slim desktop", async () => {
    const pubkeyOnlyAuthor: Person = {
      pubkey: author.pubkey,
      name: author.pubkey,
      displayName: author.pubkey,
    };
    const pubkeyTask = makeTask({ id: "task-pubkey", author: pubkeyOnlyAuthor, status: "open" });
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
        focusedTaskId={null}
        tasks={[pubkeyTask]}
        allTasks={[pubkeyTask]}
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
      pubkey: author.pubkey,
      name: author.pubkey,
      displayName: author.pubkey,
    };
    const pubkeyTask = makeTask({ id: "task-pubkey-2xl", author: pubkeyOnlyAuthor, status: "open" });
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
        focusedTaskId={null}
        tasks={[pubkeyTask]}
        allTasks={[pubkeyTask]}
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
        focusedTaskId={null}
        tasks={tasks}
        allTasks={tasks}
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
        focusedTaskId={null}
        tasks={tasks}
        allTasks={tasks}
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
        focusedTaskId={null}
        tasks={tasks}
        allTasks={tasks}
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

  it("prefers kind:0 people metadata over task-embedded author name", () => {
    const taskAuthorPubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const taskWithEmbeddedAuthor = makeTask({
      id: "task-1",
      author: { pubkey: taskAuthorPubkey, name: "me", displayName: "You" },
      status: "open",
    });
    renderFeedView(
      { tasks: [taskWithEmbeddedAuthor], allTasks: [taskWithEmbeddedAuthor] },
      { people: [{ pubkey: taskAuthorPubkey, name: "janek", displayName: "Janek" }], mentionablePeople: [] }
    );

    expect(screen.getByTestId("feed-author-primary-task-1")).toHaveTextContent("Janek");
    expect(screen.queryByText(/You/)).not.toBeInTheDocument();
  });

  it("renders task and state-update timestamps with the shared right-aligned timestamp treatment", () => {
    const taskWithStateUpdates = makeTask({
      id: "task-timestamp-formatting",
      author,
      content: "Reconnect relays after resume #infra",
      status: "open",
      stateUpdates: [
        {
          id: "state-timestamp-yesterday",
          status: { type: "active", description: "Working on relay reconnect" },
          timestamp: new Date(2026, 3, 2, 20, 45, 0),
          authorPubkey: author.pubkey,
        },
      ],
    });

    render(
      <FeedView
        focusedTaskId={null}
        tasks={[taskWithStateUpdates]}
        allTasks={[taskWithStateUpdates]}
      />
    );

    const taskTimestamp = screen.getByTitle(/task created at/i);
    const stateTimestamp = screen.getByTitle(/status updated at/i);

    expect(taskTimestamp).not.toBeEmptyDOMElement();
    expect(stateTimestamp).not.toBeEmptyDOMElement();
  });

  it("hides secondary author metadata on mobile for a denser header row", () => {
    render(
      <FeedView
        focusedTaskId={null}
        tasks={tasks}
        allTasks={tasks}
        isMobile
      />
    );

    expect(screen.queryByTestId("feed-author-secondary-task-1")).not.toBeInTheDocument();
  });

  it("supports modifier-based author filtering from the author label", () => {
    render(
      <FeedView
        focusedTaskId={null}
        tasks={tasks}
        allTasks={tasks}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /person actions for/i })[0], { ctrlKey: true });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "person.filter.exclusive",
      person: author,
    });
  });

  it("does not focus the task on a plain author click", () => {
    render(
      <FeedView
        focusedTaskId={null}
        tasks={tasks}
        allTasks={tasks}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /person actions for/i })[0]);

    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({
      type: "task.focus.change",
      taskId: "task-1",
    });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "person.filter.exclusive" })
    );
  });

  it("supports Ctrl/Cmd+Alt author shortcuts for filter and mention", () => {
    render(
      <FeedView
        focusedTaskId={null}
        tasks={tasks}
        allTasks={tasks}
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
    const mentionedPubkey = author.pubkey;
    const mentionTask = makeTask({
      id: "task-mention",
      author,
      content: `Please review @${mentionedPubkey} #frontend`,
      status: "open",
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
      status: "open",
    });

    render(
      <FeedView
        focusedTaskId={null}
        tasks={[mentionTask]}
        allTasks={[mentionTask]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /person actions for npub1/i }), { altKey: true });
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "person.compose.mention",
      person: expect.objectContaining({
        pubkey: unresolvedPubkey,
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
      status: "open",
      assigneePubkeys: [author.pubkey],
      mentions: [author.pubkey],
    });

    renderFeedView({
      tasks: [mentionTask],
      allTasks: [mentionTask],
      searchQueryOverride: "",
    });

    expect(screen.getByRole("button", { name: "Person actions for alice" })).toBeInTheDocument();
  });

  it("renders task state updates as standalone compact feed items with task breadcrumb context", () => {
    const taskWithStateUpdates = makeTask({
      id: "task-state",
      author,
      content: "Reconnect relays after resume #infra",
      status: "open",
      stateUpdates: [
        {
          id: "state-2",
          status: { type: "active", description: "Working on relay reconnect" },
          timestamp: new Date(Date.now() - 5 * 60 * 1000),
          authorPubkey: author.pubkey,
        },
        {
          id: "state-1",
          status: { type: "open", description: "Unblocked" },
          timestamp: new Date(Date.now() - 20 * 60 * 1000),
          authorPubkey: author.pubkey,
        },
      ],
    });

    render(
      <FeedView
        focusedTaskId={null}
        tasks={[taskWithStateUpdates]}
        allTasks={[taskWithStateUpdates]}
      />
    );

    const latestStateEntry = screen.getByTestId("feed-state-entry-state-2");
    const latestStateDescription = latestStateEntry.querySelector(
      "div.inline-flex.flex-1.items-center.gap-1.overflow-hidden.whitespace-nowrap > span.truncate"
    );
    expect(screen.getByText(/working on relay reconnect/i)).toBeInTheDocument();
    expect(latestStateDescription).not.toBeNull();
    expect(latestStateDescription).toHaveTextContent("Working on relay reconnect");
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
      status: "open",
      stateUpdates: [
        {
          id: "state-title-tooltip",
          status: { type: "active", description: "Working on relay reconnect" },
          timestamp: new Date(Date.now() - 5 * 60 * 1000),
          authorPubkey: author.pubkey,
        },
      ],
    });

    render(
      <FeedView
        focusedTaskId={null}
        tasks={[taskWithLongMultilineTitle]}
        allTasks={[taskWithLongMultilineTitle]}
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

  it("hides closed tasks from the feed while keeping done tasks visible", () => {
    const openTask = makeTask({
      id: "task-open",
      author,
      content: "Open feed task #general",
      status: "open",
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
        focusedTaskId={null}
        tasks={[openTask, doneTask, closedTask]}
        allTasks={[openTask, doneTask, closedTask]}
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
        focusedTaskId="task-closed-focused"
        tasks={[closedTask]}
        allTasks={[closedTask]}
      />
    );

    expect(container.querySelector('[data-task-id="task-closed-focused"]')).toBeInTheDocument();
  });

  it("keeps closed-task state updates visible even when the closed task row is hidden", () => {
    const openTask = makeTask({
      id: "task-open-with-updates",
      author,
      content: "Open feed task #general",
      status: "open",
    });
    const closedTask = makeTask({
      id: "task-closed-with-updates",
      author,
      content: "Closed feed task #general",
      status: "closed",
      stateUpdates: [
        {
          id: "close-update-1",
          status: { type: "closed" },
          timestamp: new Date(Date.now() - 30_000),
          authorPubkey: author.pubkey,
        },
      ],
    });

    const { container } = render(
      <FeedView
        focusedTaskId={null}
        tasks={[openTask, closedTask]}
        allTasks={[openTask, closedTask]}
      />
    );

    expect(container.querySelector('[data-task-id="task-closed-with-updates"]')).not.toBeInTheDocument();
    expect(screen.getByTestId("feed-state-entry-close-update-1")).toBeInTheDocument();
    expect(screen.getByTestId("feed-state-entry-close-update-1")).toHaveTextContent("Closed");
  });

  it("does not render a local inline scope hint when source posts exist but none match the current scope", () => {
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

    expect(container.querySelector('[data-task-id="task-1"]')).not.toBeInTheDocument();
  });

  it("renders a scope footer hint at the end when filtered results are visible", () => {
    const selectedAuthor = { ...author, isSelected: true };
    renderFeedView(
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
    const footerText = screen.getByText(/This is all/);
    expect(footerText).toBeInTheDocument();
    expect(footerText).toHaveTextContent("Alice Doe");
    expect(footerText).toHaveTextContent("demo.test");
  });

  it("renders a scope footer hint at the end for a feed-only selection", () => {
    const singleRelay = [makeRelay({ id: "feed-example", name: "Feed Example", url: "wss://feed.example.com" })];
    renderFeedView(
      {
        tasks,
        allTasks: tasks,
        searchQueryOverride: "",
      },
      {
        relays: singleRelay,
      }
    );

    expect(screen.getByText(/This is all/)).toHaveTextContent("feed.example.com");
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

    expect(container.querySelector('[data-task-id="task-1"]')).toBeInTheDocument();
    expect(screen.queryByText(/This is all/)).not.toBeInTheDocument();
  });

  it("ignores selected people as well as channel filters for the mobile fallback", () => {
    const selectedAuthor = { ...author, isSelected: true };
    const otherAuthor: Person = {
      pubkey: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      name: "bob",
      displayName: "Bob Doe",
    };
    const otherTask = makeTask({
      id: "task-2",
      content: "Ship #general",
      tags: ["general"],
      author: otherAuthor,
      status: "open",
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

    expect(container.querySelector('[data-task-id="task-2"]')).toBeInTheDocument();
  });

  it("updates task priority from the feed priority chip", () => {
    const taskWithPriority = makeTask({
      id: "task-priority",
      author,
      status: "open",
      priority: 40,
    });

    render(
      <FeedView
        focusedTaskId={null}
        tasks={[taskWithPriority]}
        allTasks={[taskWithPriority]}
        currentUser={author}
      />
    );

    chooseComboboxOptionByIndex(/priority/i, 4);

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
      status: "open",
      dueDate,
      dateType: "due",
    });

    render(
      <FeedView
        focusedTaskId={null}
        tasks={[taskWithDueDate]}
        allTasks={[taskWithDueDate]}
        currentUser={author}
      />
    );

    chooseComboboxOptionByIndex(/type/i, 1);

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.updateDueDate",
      taskId: "task-due-date",
      dueDate,
      dueTime: undefined,
      dateType: "scheduled",
    });
  });

});
