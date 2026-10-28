import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GanttView } from "./GanttView";
import { makePerson, makeTask } from "@/test/fixtures";
import { useCurrentUserStore } from "@/features/feed-page/stores/current-user-store";

const dispatchFeedInteraction = vi.fn();

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" } }),
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

const me = makePerson({ pubkey: "me", name: "me" });

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
  useCurrentUserStore.getState().setCurrentUser(me);
});

const dateUpdates = () =>
  dispatchFeedInteraction.mock.calls
    .map(([intent]) => intent)
    .filter((intent) => intent.type === "task.updateDueDate")
    .map((intent) => [intent.dateType, intent.dueDate.toDateString()]);

/** Drags with the mouse by whole 32px days (the default "Days" zoom). */
const dragBy = (target: Element, days: number) => {
  fireEvent.mouseDown(target, { button: 0, clientX: 100 });
  fireEvent.mouseMove(window, { clientX: 100 + days * 32 });
  fireEvent.mouseUp(window, { clientX: 100 + days * 32 });
};

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

  it("moves a bar's start and end by the dragged days without focusing it", () => {
    render(<GanttView posts={[design]} focusedTaskId={null} />);
    const bar = screen.getByTestId("gantt-bar");

    dragBy(bar, 2);
    fireEvent.click(bar);

    expect(dateUpdates()).toEqual([
      ["start", new Date(2026, 2, 4).toDateString()],
      ["end", new Date(2026, 2, 8).toDateString()],
    ]);
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith(expect.objectContaining({ type: "task.focus.change" }));
  });

  it("extends only the end when its handle is dragged", () => {
    render(<GanttView posts={[design]} focusedTaskId={null} />);

    dragBy(screen.getByTestId("gantt-bar-end-handle"), 3);

    expect(dateUpdates()).toEqual([["end", new Date(2026, 2, 9).toDateString()]]);
  });

  it("does not offer dragging for summary bars of undated parents", () => {
    render(<GanttView posts={[project, design]} focusedTaskId={null} />);

    expect(screen.getAllByTestId("gantt-bar-end-handle")).toHaveLength(1);
  });

  it("shows an empty hint when no task in context has dates", () => {
    render(<GanttView posts={[undated]} focusedTaskId={null} />);

    expect(screen.getByText("No tasks with dates in this context")).toBeInTheDocument();
  });
});
