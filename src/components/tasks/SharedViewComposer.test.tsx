import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FeedSurfaceProvider } from "@/features/feed-page/views/feed-surface-context";
import {
  ingestPost,
  __resetPostsStoreForTests,
} from "@/features/feed-page/stores/posts-store";
import { SharedViewComposer } from "./SharedViewComposer";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";
import { makeQuickFilterState } from "@/test/quick-filter-state";
import { toast } from "sonner";
import type { Post } from "@/types";

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

function renderComposer(parentTask: Post, focusedTaskId: string) {
  ingestPost({ post: parentTask });
  return render(
    <MemoryRouter initialEntries={[`/feed/${focusedTaskId}`]}>
      <Routes>
        <Route
          path="/:view/:taskId"
          element={
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
                quickFilters: makeQuickFilterState(),
                channelMatchMode: "and",
              }}
            >
              <SharedViewComposer />
            </FeedSurfaceProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("SharedViewComposer", () => {
  beforeEach(() => {
    mockUser = { id: "me" };
    vi.mocked(toast.warning).mockClear();
  });

  afterEach(() => {
    __resetPostsStoreForTests();
  });

  it("shows a warning toast for signed-in users when a read-only parent hides the composer", () => {
    const parentTask = makeTask({
      id: "parent-task",
      relays: ["relay-a"],
    });

    renderComposer(parentTask, "parent-task");

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

    const { container } = renderComposer(parentTask, "parent-task");

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not show the hidden-composer toast when signed out", () => {
    mockUser = null;
    const parentTask = makeTask({
      id: "parent-task",
      relays: ["relay-a"],
    });

    renderComposer(parentTask, "parent-task");

    expect(vi.mocked(toast.warning)).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
