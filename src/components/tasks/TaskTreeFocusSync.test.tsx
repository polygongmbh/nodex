import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskTree } from "./TaskTree";
import type { Channel, Person, Relay, Task } from "@/types";

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" } }),
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
  it("uses focusedTaskId as context and supports going up through onFocusTask", () => {
    const onFocusTask = vi.fn();
    render(
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
        onFocusTask={onFocusTask}
      />
    );

    expect(screen.getByText("Child task")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /up/i }));
    expect(onFocusTask).toHaveBeenCalledWith(null);
  });
});
