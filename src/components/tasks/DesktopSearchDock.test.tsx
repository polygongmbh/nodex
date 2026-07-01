import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopSearchDock } from "./DesktopSearchDock";
import type { FeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import {
  ingestPost,
  __resetPostsStoreForTests,
} from "@/features/feed-page/stores/posts-store";
import { makeTask } from "@/test/fixtures";

const mockDispatch = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => mockDispatch,
}));

const mockUseFeedSurfaceState = vi.fn(() => ({})) as ReturnType<typeof vi.fn<() => Partial<FeedSurfaceState>>>;
vi.mock("@/features/feed-page/views/feed-surface-context", () => ({
  useFeedSurfaceState: () => mockUseFeedSurfaceState(),
}));

beforeEach(() => {
  useFilterStore.getState().setSearchQuery("");
  useFilterStore.setState({ selectedPubkeys: new Set() });
});

afterEach(() => {
  __resetPostsStoreForTests();
});

describe("DesktopSearchDock", () => {
  it("focuses the desktop search input on mount", () => {
    render(<DesktopSearchDock focusedTaskId={null} currentView="feed" />);

    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("shows a clear button only when search has content and clears it on click", () => {
    mockUseFeedSurfaceState.mockReturnValue({});
    const { rerender } = render(<DesktopSearchDock focusedTaskId={null} currentView="feed" />);

    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();

    useFilterStore.getState().setSearchQuery("meeting");
    rerender(<DesktopSearchDock focusedTaskId={null} currentView="feed" />);

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    expect(mockDispatch).toHaveBeenCalledWith({ type: "ui.search.change", query: "" });
  });

  it("builds a search-only placeholder with dynamic suffixes and no fallback guidance", () => {
    mockUseFeedSurfaceState.mockReturnValue({
      channels: [{ id: "general", name: "general", filterState: "included" }],
      people: [{ pubkey: "p1", name: "alice", displayName: "Alice", picture: "" }],
    });
    useFilterStore.setState({ selectedPubkeys: new Set(["p1"]) });
    ingestPost({ post: makeTask({ id: "focused-task", content: "Coordinate launch copy" }) });

    render(<DesktopSearchDock focusedTaskId="focused-task" currentView="feed" />);

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      'Search posts under "Coordinate launch copy" in #general mentioning @Alice...'
    );
  });

  it("omits fallback guidance when no scope suffixes are active", () => {
    mockUseFeedSurfaceState.mockReturnValue({ channels: [], people: [] });

    render(<DesktopSearchDock focusedTaskId={null} currentView="feed" />);

    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "Search posts...");
  });
});
