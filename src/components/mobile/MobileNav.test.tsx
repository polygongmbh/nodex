import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileNav, resolveSegmentFromClientX } from "./MobileNav";

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

  it("starts switching views on pointer down when pressing another tab", () => {
    const onViewChange = vi.fn();

    render(<MobileNav currentView="tree" onViewChange={onViewChange} />);

    const { segments } = mockSegmentLayout();

    fireEvent.pointerDown(segments[0], { button: 0, buttons: 1, pointerId: 1, clientX: 40 });

    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("feed");
  });

  it("does not capture the pointer for a simple tap start", () => {
    render(<MobileNav currentView="tree" onViewChange={vi.fn()} />);

    const { container } = mockSegmentLayout();

    fireEvent.pointerDown(container, { button: 0, buttons: 1, pointerId: 1, clientX: 40 });

    expect(container.setPointerCapture).not.toHaveBeenCalled();
  });

  it("returns null for captured drag positions outside the segmented control", () => {
    const containerRect = { left: 0, right: 320 };
    const childRects = [
      { left: 0, right: 80 },
      { left: 80, right: 160 },
      { left: 160, right: 240 },
      { left: 240, right: 320 },
    ];

    expect(resolveSegmentFromClientX(35, containerRect, childRects)).toBe("feed");
    expect(resolveSegmentFromClientX(120, containerRect, childRects)).toBe("tree");
    expect(resolveSegmentFromClientX(340, containerRect, childRects)).toBeNull();
    expect(resolveSegmentFromClientX(-10, containerRect, childRects)).toBeNull();
  });

  it("does not switch to calendar when a drag leaves the control on the right", () => {
    const onViewChange = vi.fn();

    render(<MobileNav currentView="tree" onViewChange={onViewChange} />);

    const { container } = mockSegmentLayout();

    fireEvent.pointerDown(container, { button: 0, buttons: 1, pointerId: 1, clientX: 120 });
    fireEvent.pointerUp(container, { pointerId: 1, clientX: 360 });

    expect(onViewChange).not.toHaveBeenCalledWith("calendar");
  });

  it("does not dispatch the same view twice across pointer down and release", () => {
    const onViewChange = vi.fn();

    render(<MobileNav currentView="tree" onViewChange={onViewChange} />);

    const { segments } = mockSegmentLayout();

    fireEvent.pointerDown(segments[0], { button: 0, buttons: 1, pointerId: 1, clientX: 40 });
    fireEvent.pointerUp(segments[0], { pointerId: 1, clientX: 40 });

    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("feed");
  });

  it("calls onManageOpen when hamburger button is clicked", () => {
    const onManageOpen = vi.fn();

    render(<MobileNav currentView="feed" onViewChange={vi.fn()} onManageOpen={onManageOpen} />);

    const menuButton = screen.getByLabelText("Switch to Manage view");

    fireEvent.click(menuButton);
    expect(onManageOpen).toHaveBeenCalledOnce();
  });

  it("remeasures the pill when leaving manage mode without changing the current view", () => {
    const { rerender, container } = render(
      <MobileNav currentView="feed" onViewChange={vi.fn()} isManageActive />
    );

    mockSegmentLayout();

    rerender(<MobileNav currentView="feed" onViewChange={vi.fn()} isManageActive={false} />);

    const pill = container.querySelector('[aria-hidden="true"]') as HTMLDivElement | null;

    expect(pill).not.toBeNull();
    expect(pill?.style.width).toBe("80px");
    expect(pill?.style.getPropertyValue("--pill-x")).toBe("-3px");
  });
});
