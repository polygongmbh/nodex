import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListView } from "./ListView";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";
import type { TaskCreateResult } from "@/types";

let mockUser: { id: string } | null = { id: "me" };

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: mockUser }),
}));

describe("ListView priority control", () => {
  it("focuses ancestor from breadcrumb without selecting current row task", () => {
    mockUser = { id: "me" };
    const root = makeTask({ id: "root", content: "Root task #general", status: "todo" });
    const child = makeTask({ id: "child", parentId: "root", content: "Child task #general", status: "todo" });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ id: root.author.id, name: root.author.name, displayName: root.author.displayName })];
    const onFocusTask = vi.fn();

    render(
      <ListView
        tasks={[child]}
        allTasks={[root, child]}
        relays={relays}
        channels={channels}
        people={people}
        currentUser={people[0]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }))}
        onToggleComplete={vi.fn()}
        onFocusTask={onFocusTask}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /focus task: root task #general/i }));
    expect(onFocusTask).toHaveBeenCalledWith("root");
    expect(onFocusTask).not.toHaveBeenCalledWith("child");
  });

  it("keeps priority select focused across unrelated parent rerenders", () => {
    mockUser = { id: "me" };
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
        currentUser={people[0]}
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
        currentUser={people[0]}
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

  it("disables task change controls when signed out", () => {
    mockUser = null;
    const task = makeTask({
      id: "task-locked",
      priority: 40,
      content: "Task content #general",
    });
    const tasks = [task];
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ id: task.author.id, name: task.author.name, displayName: task.author.displayName })];
    const onNewTask = vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }));

    render(
      <ListView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={people}
        searchQuery=""
        onSearchChange={() => {}}
        onNewTask={onNewTask}
        onToggleComplete={vi.fn()}
        onUpdatePriority={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/priority for task content/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /set date/i })).toBeDisabled();
  });

  it("does not focus a task after checkbox quick-toggle in table view", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-focus",
      content: "Task content #general",
      status: "todo",
    });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ id: task.author.id, name: task.author.name, displayName: task.author.displayName })];
    const onFocusTask = vi.fn();
    const onToggleComplete = vi.fn();

    render(
      <ListView
        tasks={[task]}
        allTasks={[task]}
        relays={relays}
        channels={channels}
        people={people}
        currentUser={people[0]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }))}
        onToggleComplete={onToggleComplete}
        onFocusTask={onFocusTask}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(onToggleComplete).toHaveBeenCalledWith("task-focus");
    expect(onFocusTask).not.toHaveBeenCalled();
  });

  it("does not focus a task after option-clicking its checkbox", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-option",
      content: "Task content #general",
      status: "todo",
    });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ id: task.author.id, name: task.author.name, displayName: task.author.displayName })];
    const onFocusTask = vi.fn();
    const onToggleComplete = vi.fn();

    render(
      <ListView
        tasks={[task]}
        allTasks={[task]}
        relays={relays}
        channels={channels}
        people={people}
        currentUser={people[0]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }))}
        onToggleComplete={onToggleComplete}
        onStatusChange={vi.fn()}
        onFocusTask={onFocusTask}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"), { altKey: true });

    expect(onToggleComplete).not.toHaveBeenCalled();
    expect(onFocusTask).not.toHaveBeenCalled();
  });

  it("does not focus a task after selecting a dropdown status in table view", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-dropdown",
      content: "Task content #general",
      status: "done",
    });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ id: task.author.id, name: task.author.name, displayName: task.author.displayName })];
    const onFocusTask = vi.fn();
    const onStatusChange = vi.fn();

    render(
      <ListView
        tasks={[task]}
        allTasks={[task]}
        relays={relays}
        channels={channels}
        people={people}
        currentUser={people[0]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }))}
        onToggleComplete={vi.fn()}
        onStatusChange={onStatusChange}
        onFocusTask={onFocusTask}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));
    fireEvent.click(screen.getByText("In Progress"));

    expect(onStatusChange).toHaveBeenCalledWith("task-dropdown", "in-progress");
    expect(onFocusTask).not.toHaveBeenCalled();
  });

  it("opens the status dropdown on pointer down for direct-selection cases", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-direct-select",
      content: "Task content #general",
      status: "done",
    });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ id: task.author.id, name: task.author.name, displayName: task.author.displayName })];

    render(
      <ListView
        tasks={[task]}
        allTasks={[task]}
        relays={relays}
        channels={channels}
        people={people}
        currentUser={people[0]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }))}
        onToggleComplete={vi.fn()}
        onStatusChange={vi.fn()}
      />
    );

    fireEvent.pointerDown(screen.getByLabelText("Set status"));

    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("renders plain text content previews without autolink in table rows", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-first-line",
      content: "Top line https://example.com/image.png\nSecond line should be hidden",
      status: "todo",
    });

    render(
      <ListView
        tasks={[task]}
        allTasks={[task]}
        relays={[makeRelay()]}
        channels={[makeChannel()]}
        people={[makePerson({ id: task.author.id, name: task.author.name, displayName: task.author.displayName })]}
        currentUser={task.author}
        searchQuery=""
        onSearchChange={vi.fn()}
        onNewTask={vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }))}
        onToggleComplete={vi.fn()}
      />
    );

    const preview = screen.getByText((value) => value.includes("Top line https://example.com/image.png"));
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveTextContent("Second line should be hidden");
    expect(preview.className).toContain("line-clamp-2");
    expect(screen.queryByRole("link", { name: "https://example.com/image.png" })).not.toBeInTheDocument();
  });
});
