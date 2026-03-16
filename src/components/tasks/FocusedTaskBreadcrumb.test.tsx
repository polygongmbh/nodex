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
    const onFocusTask = vi.fn();

    render(
      <FocusedTaskBreadcrumb
        allTasks={[baseTask, middle, leaf]}
        focusedTaskId="leaf"
        onFocusTask={onFocusTask}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "All" }));
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

  it("keeps short breadcrumb labels content-width while still truncating long labels", () => {
    const middle: Task = {
      ...baseTask,
      id: "middle",
      content: "A very long middle task label that should truncate",
      parentId: "root",
    };
    const leaf: Task = {
      ...baseTask,
      id: "leaf",
      content: "A very long leaf task label that should truncate too",
      parentId: "middle",
    };

    render(
      <FocusedTaskBreadcrumb
        allTasks={[baseTask, middle, leaf]}
        focusedTaskId="leaf"
        onFocusTask={vi.fn()}
      />
    );

    const middleButton = screen.getByRole("button", { name: middle.content });
    const leafButton = screen.getByRole("button", { name: leaf.content });
    // Product contract: avoid stretching short labels across free space while preserving truncation behavior.
    expect(middleButton).not.toHaveClass("w-full");
    expect(leafButton).not.toHaveClass("w-full");
    expect(middleButton).toHaveClass("truncate", "text-left");
    expect(leafButton).toHaveClass("truncate", "text-left");
  });
});
