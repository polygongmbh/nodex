import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileNav } from "./MobileNav";

function mockSegmentLayout() {
  const segments = screen.getAllByRole("tab");
  const container = segments[0]?.parentElement as HTMLDivElement | null;

  if (!container) {
    throw new Error("Expected segmented control container");
  }

  Object.assign(container, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  });

  Object.defineProperty(container, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 40,
      width: 320,
      height: 40,
      toJSON: () => ({}),
    }),
  });

  segments.forEach((segment, index) => {
    const left = index * 80;
    Object.defineProperty(segment, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: left,
        y: 0,
        top: 0,
        left,
        right: left + 80,
        bottom: 40,
        width: 80,
        height: 40,
        toJSON: () => ({}),
      }),
    });
  });

  return { container, segments };
}

describe("MobileNav", () => {
  it("switches views when selecting a navigation tab", () => {
    const onViewChange = vi.fn();

    render(<MobileNav currentView="tree" onViewChange={onViewChange} />);

    const feedButton = screen.getByRole("tab", { name: "Switch to Timeline view" });

    fireEvent.click(feedButton);
    expect(onViewChange).toHaveBeenCalledWith("feed");
  });

  it("does not capture the pointer for a simple tap start", () => {
    render(<MobileNav currentView="tree" onViewChange={vi.fn()} />);

    const { container } = mockSegmentLayout();

    fireEvent.pointerDown(container, { button: 0, buttons: 1, pointerId: 1, clientX: 40 });

    expect(container.setPointerCapture).not.toHaveBeenCalled();
  });

  it("calls onManageOpen when hamburger button is clicked", () => {
    const onManageOpen = vi.fn();

    render(<MobileNav currentView="feed" onViewChange={vi.fn()} onManageOpen={onManageOpen} />);

    const menuButton = screen.getByLabelText("Switch to Manage view");

    fireEvent.click(menuButton);
    expect(onManageOpen).toHaveBeenCalledOnce();
  });
});
