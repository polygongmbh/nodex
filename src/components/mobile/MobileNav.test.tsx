import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileNav } from "./MobileNav";

describe("MobileNav", () => {
  it("provides hover hints for navigation tabs", () => {
    const onViewChange = vi.fn();

    render(<MobileNav currentView="tree" onViewChange={onViewChange} />);

    const feedButton = screen.getByRole("tab", { name: "Switch to Feed view" });
    expect(feedButton).toHaveAttribute("title", "Switch to Feed view");

    fireEvent.click(feedButton);
    expect(onViewChange).toHaveBeenCalledWith("feed");
  });
});
