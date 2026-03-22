import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopSearchDock } from "./DesktopSearchDock";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";

describe("DesktopSearchDock", () => {
  it("shows a clear button only when search has content and clears it on click", () => {
    const dispatch = vi.fn().mockResolvedValue({
      envelope: {
        id: 1,
        dispatchedAtMs: 0,
        intent: { type: "ui.search.change", query: "" },
      },
      outcome: { status: "handled" as const },
    });
    const { rerender } = render(
      <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <DesktopSearchDock searchQuery="" />
      </FeedInteractionProvider>
    );

    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();

    rerender(
      <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <DesktopSearchDock searchQuery="meeting" />
      </FeedInteractionProvider>
    );

    const clearButton = screen.getByRole("button", { name: /clear search/i });
    fireEvent.click(clearButton);

    expect(dispatch).toHaveBeenCalledWith({ type: "ui.search.change", query: "" });
  });
});
