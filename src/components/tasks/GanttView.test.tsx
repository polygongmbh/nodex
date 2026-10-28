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

  it("shows an empty hint when no task in context has dates", () => {
    render(<GanttView posts={[undated]} focusedTaskId={null} />);

    expect(screen.getByText("No tasks with dates in this context")).toBeInTheDocument();
  });
});
