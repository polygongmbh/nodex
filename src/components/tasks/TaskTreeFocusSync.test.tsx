import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskTree } from "./TaskTree";
import { TaskViewStatusRow } from "./TaskViewStatusRow";
import type { Channel, Person, Relay, Task } from "@/types";

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" } }),
}));

const dispatchFeedInteraction = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

const relays: Relay[] = [{ id: "demo", name: "Demo", icon: "R", isActive: true }];
const channels: Channel[] = [{ id: "general", name: "general", filterState: "neutral" }];
const people: Person[] = [];

const rootTask: Task = {
  id: "root",
  author: {
    id: "me",
    name: "me",
    displayName: "Me",
    isOnline: true,
    isSelected: false,
  },
  content: "Root task",
  tags: ["general"],
  relays: ["demo"],
  taskType: "task",
  timestamp: new Date(),
  likes: 0,
  replies: 0,
  reposts: 0,
  status: "todo",
};

const childTask: Task = {
  ...rootTask,
  id: "child",
  content: "Child task",
  parentId: "root",
};

describe("TaskTree focus sync", () => {
  it("uses focusedTaskId as context and supports going up through focus dispatch", () => {
    dispatchFeedInteraction.mockClear();
    render(
      <>
        <TaskViewStatusRow allTasks={[rootTask, childTask]} focusedTaskId="root" />
        <TaskTree
          tasks={[rootTask, childTask]}
          allTasks={[rootTask, childTask]}
          relays={relays}
          channels={channels}
          people={people}
          searchQuery=""
          onSearchChange={vi.fn()}
          onNewTask={vi.fn()}
          onToggleComplete={vi.fn()}
          focusedTaskId="root"
        />
      </>
    );

    expect(screen.getByText("Child task")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /up/i }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: null });
  });

  it("activates a task when clicking it from the focused composer", () => {
    dispatchFeedInteraction.mockClear();
    render(
      <>
        <TaskViewStatusRow allTasks={[rootTask, childTask]} focusedTaskId="root" />
        <TaskTree
          tasks={[rootTask, childTask]}
          allTasks={[rootTask, childTask]}
          relays={relays}
          channels={channels}
          people={people}
          searchQuery=""
          onSearchChange={vi.fn()}
          onNewTask={vi.fn()}
          onToggleComplete={vi.fn()}
          focusedTaskId="root"
        />
      </>
    );

    const composerInput = screen.getByRole("textbox", {
      name: /what's up\? use #channels and @mentions/i,
    });
    fireEvent.focus(composerInput);

    const taskButton = screen.getByText("Child task").closest('[role="button"]');
    expect(taskButton).not.toBeNull();
    if (!taskButton) {
      throw new Error("Expected task button for Child task");
    }
    fireEvent.mouseDown(taskButton);
    fireEvent.click(taskButton);

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "child" });
  });
});
