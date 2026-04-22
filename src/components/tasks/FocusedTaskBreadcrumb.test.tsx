import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import type { Task } from "@/types";

const dispatchFeedInteraction = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

const baseTask: Task = {
  id: "root",
  author: {
    id: "me",
    name: "me",
    displayName: "Me",
    isOnline: true,
    isSelected: false,
  },
  content: "Root task",
  tags: [],
  relays: [],
  taskType: "task",
  timestamp: new Date(),
  lastEditedAt: new Date(),
  likes: 0,
  replies: 0,
  reposts: 0,
  status: "todo",
};

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
});

describe("FocusedTaskBreadcrumb", () => {
  it("renders all tasks breadcrumb even when no task is focused", () => {
    render(<FocusedTaskBreadcrumb allTasks={[baseTask]} focusedTaskId={null} />);
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Up" })).toBeDisabled();
  });

  it("renders full path and makes each level clickable", () => {
    const middle: Task = {
      ...baseTask,
      id: "middle",
      content: "Middle task",
      parentId: "root",
    };
    const leaf: Task = {
      ...baseTask,
      id: "leaf",
      content: "Leaf task",
      parentId: "middle",
    };

    render(
      <FocusedTaskBreadcrumb
        allTasks={[baseTask, middle, leaf]}
        focusedTaskId="leaf"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.click(screen.getByRole("button", { name: "Root task" }));
    fireEvent.click(screen.getByRole("button", { name: "Middle task" }));
    fireEvent.click(screen.getByRole("button", { name: "Leaf task" }));
    fireEvent.click(screen.getByRole("button", { name: "Up" }));

    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(1, { type: "task.focus.change", taskId: null });
    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(2, { type: "task.focus.change", taskId: "root" });
    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(3, { type: "task.focus.change", taskId: "middle" });
    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(4, { type: "task.focus.change", taskId: "leaf" });
    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(5, { type: "task.focus.change", taskId: "middle" });
  });

  it("formats breadcrumb labels to first-line plain text without mentions or hashtag markers", () => {
    const longContent = "Task delegated to @averylongusername with enough room to display #frontend!!!\nSecond line";
    const longTask: Task = {
      ...baseTask,
      id: "long",
      content: longContent,
      parentId: "root",
    };

    render(
      <FocusedTaskBreadcrumb
        allTasks={[baseTask, longTask]}
        focusedTaskId="long"
      />
    );

    expect(screen.getByRole("button", { name: "Task delegated to with enough room to display frontend!!!" })).toBeInTheDocument();
  });

  it("keeps short ancestor items visible while capping each breadcrumb item at half the available row width", () => {
    const middle: Task = {
      ...baseTask,
      id: "middle",
      content: "Middle task",
      parentId: "root",
    };
    const leaf: Task = {
      ...baseTask,
      id: "leaf",
      content: "Leaf task",
      parentId: "middle",
    };

    render(
      <FocusedTaskBreadcrumb
        allTasks={[baseTask, middle, leaf]}
        focusedTaskId="leaf"
      />
    );

    const rootButton = screen.getByRole("button", { name: "Root task" });
    const middleButton = screen.getByRole("button", { name: "Middle task" });
    const leafButton = screen.getByRole("button", { name: "Leaf task" });

    expect(rootButton).toBeInTheDocument();
    expect(middleButton).toBeInTheDocument();
    expect(leafButton).toBeInTheDocument();
  });
});
