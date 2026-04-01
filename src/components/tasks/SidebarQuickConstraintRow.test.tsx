import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarQuickConstraintRow } from "./SidebarQuickConstraintRow";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";

function renderRow(dispatch = vi.fn().mockResolvedValue({
  envelope: { id: 1, dispatchedAtMs: Date.now(), intent: { type: "ui.focusTasks" } },
  outcome: { status: "handled" },
})) {
  render(
    <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
      <SidebarQuickConstraintRow
        quickFilters={{
          recentEnabled: true,
          recentDays: 14,
          priorityEnabled: true,
          minPriority: 50,
        }}
      />
    </FeedInteractionProvider>
  );

  return dispatch;
}

describe("SidebarQuickConstraintRow", () => {
  it("shows display-scale priority values and submits canonical priority values", () => {
    const dispatch = renderRow();

    const minPriorityInput = screen.getByLabelText("Minimum priority") as HTMLInputElement;
    expect(minPriorityInput).toHaveValue(3);

    fireEvent.change(minPriorityInput, { target: { value: "4" } });

    expect(dispatch).toHaveBeenCalledWith({
      type: "sidebar.quickFilter.minPriority.change",
      priority: 80,
    });
  });

  it("sizes number inputs from content width instead of the old fixed width class", () => {
    renderRow();

    const recentDaysInput = screen.getByLabelText("Age in days");
    const minPriorityInput = screen.getByLabelText("Minimum priority");

    expect(recentDaysInput.className).not.toContain("w-14");
    expect(minPriorityInput.className).not.toContain("w-14");
    expect(recentDaysInput).toHaveStyle({ width: "4.5ch" });
    expect(minPriorityInput).toHaveStyle({ width: "4.5ch" });
  });

  it("shows spinner labels only from the lg breakpoint upward", () => {
    renderRow();

    expect(screen.getByText("Recent").className).toContain("hidden");
    expect(screen.getByText("Recent").className).toContain("lg:inline");
    expect(screen.getByText("Priority").className).toContain("hidden");
    expect(screen.getByText("Priority").className).toContain("lg:inline");
  });
});
