import { render, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedSurfaceProvider } from "@/features/feed-page/views/feed-surface-context";
import type { FeedInteractionIntent } from "@/features/feed-page/interactions/feed-interaction-intent";
import type { Channel, Person, Relay } from "@/types";
import { getComposerPrimaryAction, getTaskComposerInput } from "@/test/ui";
import { TaskCreateComposer } from "./TaskCreateComposer";

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
        <TaskCreateComposer
          onCancel={onCancel}
          parentId="parent-task"
          initialStatus="in-progress"
          closeOnSuccess
          allowComment={false}
        />
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
});
