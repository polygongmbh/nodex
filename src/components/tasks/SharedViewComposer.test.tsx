import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedSurfaceProvider } from "@/features/feed-page/views/feed-surface-context";
import { FeedTaskViewModelProvider } from "@/features/feed-page/views/feed-task-view-model-context";
import { SharedViewComposer } from "./SharedViewComposer";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";
import { toast } from "sonner";

let mockUser: { id: string } | null = { id: "me" };

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: mockUser, createHttpAuthHeader: vi.fn(async () => null) }),
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
    warning: vi.fn(),
  },
}));

describe("SharedViewComposer", () => {
  beforeEach(() => {
    mockUser = { id: "me" };
    vi.mocked(toast.warning).mockClear();
  });

  it("shows a warning toast for signed-in users when a read-only parent hides the composer", () => {
    const parentTask = makeTask({
      id: "parent-task",
      relays: ["relay-a"],
    });

    render(
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
            focusedTaskId="parent-task"
          />
        </FeedTaskViewModelProvider>
      </FeedSurfaceProvider>
    );

    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      "This thread is on a read-only space, so replies are disabled here."
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

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
            focusedTaskId="parent-task"
          />
        </FeedTaskViewModelProvider>
      </FeedSurfaceProvider>
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not show the hidden-composer toast when signed out", () => {
    mockUser = null;
    const parentTask = makeTask({
      id: "parent-task",
      relays: ["relay-a"],
    });

    render(
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
            focusedTaskId="parent-task"
          />
        </FeedTaskViewModelProvider>
      </FeedSurfaceProvider>
    );

    expect(vi.mocked(toast.warning)).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
