import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
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

vi.mock("@/features/feed-page/views/feed-view-state-context", () => ({
  useFeedViewState: () => ({ currentView: "feed", displayDepthMode: "leaves" }),
}));

const mockUseFeedSurfaceState = vi.fn(() => ({})) as ReturnType<typeof vi.fn<() => Partial<FeedSurfaceState>>>;
vi.mock("@/features/feed-page/views/feed-surface-context", () => ({
  useFeedSurfaceState: () => mockUseFeedSurfaceState(),
}));

function withRoute(ui: ReactElement, focusedTaskId: string | null = null) {
  const initialPath = focusedTaskId ? `/feed/${focusedTaskId}` : "/feed";
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/:view/:taskId?" element={ui} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useFilterStore.getState().setSearchQuery("");
});

afterEach(() => {
  __resetPostsStoreForTests();
});

describe("DesktopSearchDock", () => {
  it("focuses the desktop search input on mount", () => {
    render(withRoute(<DesktopSearchDock />));

    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("shows a clear button only when search has content and clears it on click", () => {
    mockUseFeedSurfaceState.mockReturnValue({});
    const { rerender } = render(withRoute(<DesktopSearchDock />));

    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();

    useFilterStore.getState().setSearchQuery("meeting");
    rerender(withRoute(<DesktopSearchDock />));

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    expect(mockDispatch).toHaveBeenCalledWith({ type: "ui.search.change", query: "" });
  });

  it("builds a search-only placeholder with dynamic suffixes and no fallback guidance", () => {
    mockUseFeedSurfaceState.mockReturnValue({
      channels: [{ id: "general", name: "general", filterState: "included" }],
      people: [{ pubkey: "p1", name: "alice", displayName: "Alice", avatar: "", isSelected: true }],
    });
    ingestPost({ post: makeTask({ id: "focused-task", content: "Coordinate launch copy" }) });

    render(withRoute(<DesktopSearchDock />, "focused-task"));

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      'Search posts under "Coordinate launch copy" in #general mentioning @Alice...'
    );
  });

  it("omits fallback guidance when no scope suffixes are active", () => {
    mockUseFeedSurfaceState.mockReturnValue({ channels: [], people: [] });

    render(withRoute(<DesktopSearchDock />));

    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "Search posts...");
  });
});
