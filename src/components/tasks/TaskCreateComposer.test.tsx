import { render, fireEvent, waitFor } from "@testing-library/react";
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

const channels: Channel[] = [{ id: "backend", name: "backend", filterState: "neutral" }];
const people: Person[] = [];

describe("TaskCreateComposer", () => {
  beforeEach(() => {
    dispatchFeedInteraction.mockClear();
  });

  it("dispatches task.create with compose config and closes on success", async () => {
    const onCancel = vi.fn();

    render(
      <FeedSurfaceProvider
        value={{
          relays,
          channels,
          people,
          searchQuery: "",
          channelMatchMode: "and",
        }}
      >
        <FeedTaskViewModelProvider value={{ tasks: [], allTasks: [] }}>
          <TaskCreateComposer
            onCancel={onCancel}
            parentId="parent-task"
            initialStatus="in-progress"
            closeOnSuccess
            allowComment={false}
          />
        </FeedTaskViewModelProvider>
      </FeedSurfaceProvider>
    );

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

    const { container } = render(
      <FeedSurfaceProvider
        value={{
          relays: readOnlyRelays,
          channels,
          people,
          searchQuery: "",
          channelMatchMode: "and",
        }}
      >
        <FeedTaskViewModelProvider value={{ tasks: [parentTask], allTasks: [parentTask], focusedTaskId: "parent-task" }}>
          <TaskCreateComposer
            onCancel={() => {}}
            parentId="parent-task"
          />
        </FeedTaskViewModelProvider>
      </FeedSurfaceProvider>
    );

    expect(container).toBeEmptyDOMElement();
    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
  });
});
