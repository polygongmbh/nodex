import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedSurfaceProvider } from "@/features/feed-page/views/feed-surface-context";
import { FeedTaskViewModelProvider } from "@/features/feed-page/views/feed-task-view-model-context";
import { SharedViewComposer } from "./SharedViewComposer";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" }, createHttpAuthHeader: vi.fn(async () => null) }),
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

describe("SharedViewComposer", () => {
  it("does not render the wrapper shell when the parent only exists on read-only relays", () => {
    const parentTask = makeTask({
      id: "parent-task",
      relays: ["relay-a"],
    });

    const { container } = render(
      <FeedSurfaceProvider
        value={{
          relays: [
            makeRelay({
              id: "relay-a",
              name: "Relay A",
              connectionStatus: "read-only",
            }),
          ],
          channels: [makeChannel({ id: "backend", name: "backend" })],
          people: [makePerson()],
          searchQuery: "",
          channelMatchMode: "and",
        }}
      >
        <FeedTaskViewModelProvider value={{ tasks: [parentTask], allTasks: [parentTask], focusedTaskId: "parent-task" }}>
          <SharedViewComposer
            visible
            draftStorageKey="shared-view-composer-gap"
            parentId="parent-task"
          />
        </FeedTaskViewModelProvider>
      </FeedSurfaceProvider>
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
