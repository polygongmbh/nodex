import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRef, useState } from "react";
import { useScrollPositionRestore } from "./use-scroll-position-restore";

function Harness({ initialFocusedTaskId = null }: { initialFocusedTaskId?: string | null }) {
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(initialFocusedTaskId);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useScrollPositionRestore(focusedTaskId, scrollContainerRef);

  return (
    <>
      <div ref={scrollContainerRef} data-testid="scroll-container" />
      <button onClick={() => setFocusedTaskId("task-1")}>FocusOne</button>
      <button onClick={() => setFocusedTaskId("task-2")}>FocusTwo</button>
      <button onClick={() => setFocusedTaskId(null)}>Unfocus</button>
    </>
  );
}

function setScrollTop(el: HTMLElement, value: number) {
  Object.defineProperty(el, "scrollTop", { value, writable: true, configurable: true });
  fireEvent.scroll(el);
}

describe("useScrollPositionRestore", () => {
  it("restores scroll position when leaving task scope", () => {
    const { getByTestId, getByRole } = render(<Harness />);
    const container = getByTestId("scroll-container");

    setScrollTop(container, 300);
    fireEvent.click(getByRole("button", { name: "FocusOne" }));

    // Simulate scrolling within the subtask
    setScrollTop(container, 50);

    fireEvent.click(getByRole("button", { name: "Unfocus" }));

    expect(container.scrollTop).toBe(300);
  });

  it("does not restore scroll when never entering task scope", () => {
    const { getByTestId, getByRole } = render(<Harness />);
    const container = getByTestId("scroll-container");

    setScrollTop(container, 100);
    fireEvent.click(getByRole("button", { name: "Unfocus" }));

    expect(container.scrollTop).toBe(100);
  });

  it("preserves the original scroll position when moving between focused tasks", () => {
    const { getByTestId, getByRole } = render(<Harness />);
    const container = getByTestId("scroll-container");

    setScrollTop(container, 400);
    fireEvent.click(getByRole("button", { name: "FocusOne" }));
    setScrollTop(container, 10);
    fireEvent.click(getByRole("button", { name: "FocusTwo" }));
    setScrollTop(container, 20);
    fireEvent.click(getByRole("button", { name: "Unfocus" }));

    expect(container.scrollTop).toBe(400);
  });

  it("resets saved position after restoring so a second leave does not restore stale position", () => {
    const { getByTestId, getByRole } = render(<Harness />);
    const container = getByTestId("scroll-container");

    setScrollTop(container, 500);
    fireEvent.click(getByRole("button", { name: "FocusOne" }));
    fireEvent.click(getByRole("button", { name: "Unfocus" }));

    // Second enter/leave cycle with a different starting position
    setScrollTop(container, 0);
    fireEvent.click(getByRole("button", { name: "FocusOne" }));
    setScrollTop(container, 80);
    fireEvent.click(getByRole("button", { name: "Unfocus" }));

    expect(container.scrollTop).toBe(0);
  });
});
