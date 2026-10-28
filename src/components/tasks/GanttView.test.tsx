import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GanttView } from "./GanttView";
import { makeTask } from "@/test/fixtures";

const dispatchFeedInteraction = vi.fn();

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" } }),
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
});

describe("GanttView", () => {
  const project = makeTask({ id: "project", content: "Launch #general" });
  const design = makeTask({
    id: "design",
    parentId: "project",
    content: "Design #general",
    dates: [
      { date: "2026-03-02", type: "start" },
      { date: "2026-03-06", type: "end" },
    ],
  });
  const undated = makeTask({ id: "undated", content: "Someday #general" });

  it("lists dated tasks under their undated parent and skips undated leaves", () => {
    render(<GanttView posts={[project, design, undated]} focusedTaskId={null} />);

    expect(screen.getByText("Launch general")).toBeInTheDocument();
    expect(screen.getByText("Design general")).toBeInTheDocument();
    expect(screen.queryByText("Someday general")).not.toBeInTheDocument();
  });

  it("focuses a task when its label is clicked", () => {
    render(<GanttView posts={[project, design]} focusedTaskId={null} />);

    fireEvent.click(screen.getByText("Design general"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "task.focus.change", taskId: "design" })
    );
  });

  it("keeps today anchored when an earlier-dated task hydrates after mount", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 10));
    // jsdom does not store scrollLeft; capture what the view writes.
    let scrollLeft = 0;
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollLeft");
    Object.defineProperty(Element.prototype, "scrollLeft", {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value;
      },
    });
    try {
      const soon = makeTask({ id: "soon", content: "Soon", dates: [{ date: "2026-03-12", type: "due" }] });
      const early = makeTask({ id: "early", content: "Early", dates: [{ date: "2026-02-10", type: "due" }] });
      const { rerender } = render(<GanttView posts={[soon]} focusedTaskId={null} />);
      const initial = scrollLeft;

      rerender(<GanttView posts={[soon, early]} focusedTaskId={null} />);

      // The range start moved 28 days earlier at 32px/day; today stays in view.
      expect(scrollLeft).toBe(initial + 28 * 32);
    } finally {
      if (descriptor) Object.defineProperty(Element.prototype, "scrollLeft", descriptor);
      vi.useRealTimers();
    }
  });

  it("shows an empty hint when no task in context has dates", () => {
    render(<GanttView posts={[undated]} focusedTaskId={null} />);

    expect(screen.getByText("No tasks with dates in this context")).toBeInTheDocument();
  });
});
