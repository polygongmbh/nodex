import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopSearchDock } from "./DesktopSearchDock";

describe("DesktopSearchDock", () => {
  it("shows a clear button only when search has content and clears it on click", () => {
    const onSearchChange = vi.fn();
    const { rerender } = render(<DesktopSearchDock searchQuery="" onSearchChange={onSearchChange} />);

    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();

    rerender(<DesktopSearchDock searchQuery="meeting" onSearchChange={onSearchChange} />);

    const clearButton = screen.getByRole("button", { name: /clear search/i });
    fireEvent.click(clearButton);

    expect(onSearchChange).toHaveBeenCalledWith("");
  });
});
