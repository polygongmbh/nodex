import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListView } from "./ListView";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";
import type { TaskCreateResult } from "@/types";

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({ user: null }),
}));

describe("ListView priority control", () => {
  it("keeps priority select focused across unrelated parent rerenders", () => {
    const task = makeTask({
      id: "task-priority",
      priority: 40,
      content: "Task content #general",
    });
    const tasks = [task];
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ id: task.author.id, name: task.author.name, displayName: task.author.displayName })];
    const onNewTask = vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }));
    const onToggleComplete = vi.fn();
    const onSearchChange = vi.fn();
    const onUpdatePriority = vi.fn();

    const { rerender } = render(
      <ListView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={people}
        searchQuery=""
        onSearchChange={onSearchChange}
        onNewTask={onNewTask}
        onToggleComplete={onToggleComplete}
        onUpdatePriority={onUpdatePriority}
      />
    );

    const prioritySelect = screen.getByRole("combobox", {
      name: /priority for task content/i,
    });
    prioritySelect.focus();
    expect(prioritySelect).toHaveFocus();

    rerender(
      <ListView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={people}
        searchQuery=""
        onSearchChange={() => {}}
        onNewTask={onNewTask}
        onToggleComplete={onToggleComplete}
        onUpdatePriority={onUpdatePriority}
      />
    );

    const prioritySelectAfter = screen.getByRole("combobox", {
      name: /priority for task content/i,
    });
    expect(prioritySelectAfter).toBe(prioritySelect);
    expect(prioritySelectAfter).toHaveFocus();
  });
});
