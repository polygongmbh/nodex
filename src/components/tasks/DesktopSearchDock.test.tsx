import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopSearchDock } from "./DesktopSearchDock";

const mockDispatch = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => mockDispatch,
}));

vi.mock("@/features/feed-page/views/feed-view-state-context", () => ({
  useFeedViewState: () => ({ currentView: "feed", kanbanDepthMode: "leaves" }),
}));

const mockUseFeedSurfaceState = vi.fn(() => ({ searchQuery: "" }));
vi.mock("@/features/feed-page/views/feed-surface-context", () => ({
  useFeedSurfaceState: () => mockUseFeedSurfaceState(),
}));

describe("DesktopSearchDock", () => {
  it("shows a clear button only when search has content and clears it on click", () => {
    mockUseFeedSurfaceState.mockReturnValue({ searchQuery: "" });
    const { rerender } = render(<DesktopSearchDock />);

    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();

    mockUseFeedSurfaceState.mockReturnValue({ searchQuery: "meeting" });
    rerender(<DesktopSearchDock />);

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    expect(mockDispatch).toHaveBeenCalledWith({ type: "ui.search.change", query: "" });
  });
});
