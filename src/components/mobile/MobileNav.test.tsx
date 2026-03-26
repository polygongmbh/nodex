import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileNav } from "./MobileNav";

describe("MobileNav", () => {
  it("switches views when selecting a navigation tab", () => {
    const onViewChange = vi.fn();

    render(<MobileNav currentView="tree" onViewChange={onViewChange} />);

    const feedButton = screen.getByRole("tab", { name: "Switch to Timeline view" });

    fireEvent.click(feedButton);
    expect(onViewChange).toHaveBeenCalledWith("feed");
  });

  it("calls onManageOpen when hamburger button is clicked", () => {
    const onManageOpen = vi.fn();

    render(<MobileNav currentView="feed" onViewChange={vi.fn()} onManageOpen={onManageOpen} />);

    const menuButton = screen.getByLabelText("Switch to Manage view");

    fireEvent.click(menuButton);
    expect(onManageOpen).toHaveBeenCalledOnce();
  });
});
