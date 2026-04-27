import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopSearchDock } from "./DesktopSearchDock";
import { FeedTaskViewModelProvider } from "@/features/feed-page/views/feed-task-view-model-context";
import type { FeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { makeTask } from "@/test/fixtures";

const mockDispatch = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => mockDispatch,
}));

vi.mock("@/features/feed-page/views/feed-view-state-context", () => ({
  useFeedViewState: () => ({ currentView: "feed", displayDepthMode: "leaves" }),
}));

const mockUseFeedSurfaceState = vi.fn(() => ({ searchQuery: "" })) as ReturnType<typeof vi.fn<() => Partial<FeedSurfaceState>>>;
vi.mock("@/features/feed-page/views/feed-surface-context", () => ({
  useFeedSurfaceState: () => mockUseFeedSurfaceState(),
}));

describe("DesktopSearchDock", () => {
  it("focuses the desktop search input on mount", () => {
    render(
      <FeedTaskViewModelProvider value={{ tasks: [], allTasks: [], focusedTaskId: null }}>
        <DesktopSearchDock />
      </FeedTaskViewModelProvider>
    );

    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("shows a clear button only when search has content and clears it on click", () => {
    mockUseFeedSurfaceState.mockReturnValue({ searchQuery: "" });
    const { rerender } = render(
      <FeedTaskViewModelProvider value={{ tasks: [], allTasks: [], focusedTaskId: null }}>
        <DesktopSearchDock />
      </FeedTaskViewModelProvider>
    );

    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();

    mockUseFeedSurfaceState.mockReturnValue({ searchQuery: "meeting" });
    rerender(
      <FeedTaskViewModelProvider value={{ tasks: [], allTasks: [], focusedTaskId: null }}>
        <DesktopSearchDock />
      </FeedTaskViewModelProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    expect(mockDispatch).toHaveBeenCalledWith({ type: "ui.search.change", query: "" });
  });

  it("builds a search-only placeholder with dynamic suffixes and no fallback guidance", () => {
    mockUseFeedSurfaceState.mockReturnValue({
      searchQuery: "",
      channels: [{ id: "general", name: "general", filterState: "included" }],
      people: [{ id: "p1", name: "alice", displayName: "Alice", avatar: "", isOnline: true, isSelected: true }],
    });

    render(
      <FeedTaskViewModelProvider
        value={{
          tasks: [],
          allTasks: [makeTask({ id: "focused-task", content: "Coordinate launch copy" })],
          focusedTaskId: "focused-task",
        }}
      >
        <DesktopSearchDock />
      </FeedTaskViewModelProvider>
    );

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      'Search posts under "Coordinate launch copy" in #general mentioning @Alice...'
    );
  });

  it("omits fallback guidance when no scope suffixes are active", () => {
    mockUseFeedSurfaceState.mockReturnValue({ searchQuery: "", channels: [], people: [] });

    render(
      <FeedTaskViewModelProvider value={{ tasks: [], allTasks: [], focusedTaskId: null }}>
        <DesktopSearchDock />
      </FeedTaskViewModelProvider>
    );

    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "Search posts...");
  });
});
