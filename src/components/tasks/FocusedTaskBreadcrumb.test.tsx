import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import type { Task } from "@/types";

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
  likes: 0,
  replies: 0,
  reposts: 0,
  status: "todo",
};

describe("FocusedTaskBreadcrumb", () => {
  it("renders all tasks breadcrumb even when no task is focused", () => {
    render(<FocusedTaskBreadcrumb allTasks={[baseTask]} focusedTaskId={null} onFocusTask={vi.fn()} />);
    expect(screen.getByRole("button", { name: "All Tasks" })).toBeInTheDocument();
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
    const onFocusTask = vi.fn();

    render(
      <FocusedTaskBreadcrumb
        allTasks={[baseTask, middle, leaf]}
        focusedTaskId="leaf"
        onFocusTask={onFocusTask}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "All Tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "Root task" }));
    fireEvent.click(screen.getByRole("button", { name: "Middle task" }));
    fireEvent.click(screen.getByRole("button", { name: "Leaf task" }));
    fireEvent.click(screen.getByRole("button", { name: "Up" }));

    expect(onFocusTask).toHaveBeenNthCalledWith(1, null);
    expect(onFocusTask).toHaveBeenNthCalledWith(2, "root");
    expect(onFocusTask).toHaveBeenNthCalledWith(3, "middle");
    expect(onFocusTask).toHaveBeenNthCalledWith(4, "leaf");
    expect(onFocusTask).toHaveBeenNthCalledWith(5, "middle");
  });

  it("does not pre-abbreviate long breadcrumb labels", () => {
    const longContent = "Task delegated to @averylongusername with enough room to display";
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
        onFocusTask={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: longContent })).toBeInTheDocument();
  });
});
