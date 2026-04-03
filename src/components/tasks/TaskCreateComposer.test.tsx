import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedSurfaceProvider } from "@/features/feed-page/views/feed-surface-context";
import { FeedTaskViewModelProvider } from "@/features/feed-page/views/feed-task-view-model-context";
import type { FeedInteractionIntent } from "@/features/feed-page/interactions/feed-interaction-intent";
import type { Channel, Relay } from "@/types";
import type { Person } from "@/types/person";
import { getComposerPrimaryAction, getTaskComposerInput } from "@/test/ui";
import { TaskCreateComposer } from "./TaskCreateComposer";
import { makeTask } from "@/test/fixtures";

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" }, createHttpAuthHeader: vi.fn(async () => null) }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const dispatchFeedInteraction = vi.fn(async (intent: FeedInteractionIntent) => ({
  envelope: { id: 1, dispatchedAtMs: Date.now(), intent },
  outcome: { status: "handled" as const, result: { ok: true as const, mode: "local" as const } },
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

const relays: Relay[] = [{
  id: "demo",
  name: "Demo",
  url: "wss://relay.example.com",
  icon: "R",
  isActive: true,
  connectionStatus: "connected",
}];
const multiRelays: Relay[] = [
  {
    id: "relay-a",
    name: "Relay A",
    url: "wss://relay-a.example.com",
    icon: "R",
    isActive: true,
    connectionStatus: "connected",
  },
  {
    id: "relay-b",
    name: "Relay B",
    url: "wss://relay-b.example.com",
    icon: "R",
    isActive: true,
    connectionStatus: "connected",
  },
];
const mixedRelays: Relay[] = [
  {
    id: "relay-a",
    name: "Relay A",
    url: "wss://relay-a.example.com",
    icon: "R",
    isActive: true,
    connectionStatus: "connected",
  },
  {
    id: "relay-b",
    name: "Relay B",
    url: "wss://relay-b.example.com",
    icon: "R",
    isActive: true,
    connectionStatus: "read-only",
  },
];

const channels: Channel[] = [{ id: "backend", name: "backend", filterState: "neutral" }];
const people: Person[] = [];

function renderCreateComposer({
  feedRelays = relays,
  tasks = [],
  allTasks = tasks,
  ...props
}: Partial<ComponentProps<typeof TaskCreateComposer>> & {
  feedRelays?: Relay[];
  tasks?: ReturnType<typeof makeTask>[];
  allTasks?: ReturnType<typeof makeTask>[];
} = {}) {
  return render(
    <FeedSurfaceProvider
      value={{
        relays: feedRelays,
        channels,
        people,
        searchQuery: "",
        channelMatchMode: "and",
      }}
    >
      <FeedTaskViewModelProvider value={{ tasks, allTasks }}>
        <TaskCreateComposer onCancel={() => {}} {...props} />
      </FeedTaskViewModelProvider>
    </FeedSurfaceProvider>
  );
}

describe("TaskCreateComposer", () => {
  beforeEach(() => {
    dispatchFeedInteraction.mockClear();
  });

  it("dispatches task.create with compose config and closes on success", async () => {
    const onCancel = vi.fn();

    renderCreateComposer({
      onCancel,
      parentId: "parent-task",
      initialStatus: "in-progress",
      closeOnSuccess: true,
      allowComment: false,
    });

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship #backend" },
    });
    fireEvent.click(getComposerPrimaryAction());

    await waitFor(() => {
      expect(dispatchFeedInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "task.create",
          content: "Ship #backend",
          parentId: "parent-task",
          initialStatus: "in-progress",
        })
      );
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not render the composer when the parent only lives on read-only relays", () => {
    const readOnlyRelays: Relay[] = [{
      id: "relay-a",
      name: "Relay A",
      url: "wss://relay-a.example.com",
      icon: "R",
      isActive: true,
      connectionStatus: "read-only",
    }];
    const parentTask = makeTask({
      id: "parent-task",
      relays: ["relay-a"],
    });

    const { container } = renderCreateComposer({
      feedRelays: readOnlyRelays,
      tasks: [parentTask],
      allTasks: [parentTask],
      parentId: "parent-task",
    });

    expect(container).toBeEmptyDOMElement();
    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
  });

  it("blocks root task creation when more than one writable relay is active", () => {
    renderCreateComposer({ feedRelays: multiRelays });

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship #backend" },
    });
    fireEvent.click(getComposerPrimaryAction());

    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Select a single space or a parent task to create a new task");
    expect(getComposerPrimaryAction()).toHaveTextContent("Select space");
  });

  it("allows parent-scoped submit without explicit tags", async () => {
    const parentTask = makeTask({
      id: "parent-task",
      relays: ["relay-a"],
    });

    renderCreateComposer({
      feedRelays: multiRelays,
      tasks: [parentTask],
      allTasks: [parentTask],
      parentId: "parent-task",
    });

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Follow-up update for this thread" },
    });
    fireEvent.click(getComposerPrimaryAction());

    await waitFor(() => {
      expect(dispatchFeedInteraction).toHaveBeenCalledWith(expect.objectContaining({
        type: "task.create",
        content: "Follow-up update for this thread",
        tags: [],
        parentId: "parent-task",
      }));
    });
  });

  it("submits comments with only the writable relay subset", async () => {
    renderCreateComposer({ feedRelays: mixedRelays });

    fireEvent.change(screen.getByRole("combobox", { name: /kind/i }), {
      target: { value: "comment" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /add your comment/i }), {
      target: { value: "Looks good #backend" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add comment/i }));

    await waitFor(() => {
      expect(dispatchFeedInteraction).toHaveBeenCalledWith(expect.objectContaining({
        type: "task.create",
        content: "Looks good #backend",
        tags: ["backend"],
        taskType: "comment",
        relays: ["relay-a"],
      }));
    });
  });
});
