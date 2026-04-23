import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListView } from "./ListView";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";

let mockUser: { id: string } | null = { id: "me" };
const dispatchFeedInteraction = vi.fn();

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: mockUser }),
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
});

describe("ListView priority control", () => {
  it("focuses ancestor from breadcrumb without selecting current row task", () => {
    mockUser = { id: "me" };
    const root = makeTask({ id: "root", content: "Root task #general", status: "open" });
    const child = makeTask({ id: "child", parentId: "root", content: "Child task #general", status: "open" });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ id: root.author.id, name: root.author.name, displayName: root.author.displayName })];
    render(
      <ListView
        focusedTaskId={null}
        tasks={[child]}
        allTasks={[root, child]}
        currentUser={people[0]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /focus task: root task general/i }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "root" });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "child" });
  });

  it("omits the active focused item from row breadcrumbs", () => {
    mockUser = { id: "me" };
    const root = makeTask({ id: "root", content: "Root task #general", status: "open" });
    const middle = makeTask({ id: "middle", parentId: "root", content: "Middle task #general", status: "open" });
    const leaf = makeTask({ id: "leaf", parentId: "middle", content: "Leaf task #general", status: "open" });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ id: root.author.id, name: root.author.name, displayName: root.author.displayName })];

    render(
      <ListView
        focusedTaskId="middle"
        tasks={[leaf]}
        allTasks={[root, middle, leaf]}
        currentUser={people[0]}
      />
    );

    expect(screen.queryByRole("button", { name: /focus task: root task general/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /focus task: middle task general/i })).not.toBeInTheDocument();
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
    const onUpdatePriority = vi.fn();

    const { rerender } = render(
      <ListView
        focusedTaskId={null}
        tasks={tasks}
        allTasks={tasks}
        currentUser={people[0]}
      />
    );

    const [prioritySelect] = screen.getAllByRole("combobox");
    prioritySelect.focus();
    expect(prioritySelect).toHaveFocus();

    rerender(
      <ListView
        focusedTaskId={null}
        tasks={tasks}
        allTasks={tasks}
        currentUser={people[0]}
      />
    );

    const [prioritySelectAfter] = screen.getAllByRole("combobox");
    expect(prioritySelectAfter).toBe(prioritySelect);
    expect(prioritySelectAfter).toHaveFocus();
  });

  it("keeps table columns bounded so task text and priority controls do not overrun the row", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-layout",
      priority: 80,
      content: "Task content with a longer preview #general",
    });

    const { container } = render(
      <ListView
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={task.author}
      />
    );

    // Protect the responsive table contract: non-content columns stay bounded below 2xl.
    const table = screen.getByRole("table", { name: /task/i });
    expect(table).toBeInTheDocument();
    expect(table).toHaveClass("grid");

    const taskRow = container.querySelector('[data-task-id="task-layout"]');
    expect(taskRow).toHaveClass("grid", "grid-cols-subgrid", "col-span-full");
    const cells = taskRow?.querySelectorAll('[role="cell"]');
    expect(cells).toHaveLength(6);
    expect(cells?.[1]).toHaveClass("min-w-0");
    expect(cells?.[2]).toHaveClass("hidden");

    const [prioritySelect] = screen.getAllByRole("combobox");
    expect(prioritySelect).toHaveClass("w-full", "min-w-0", "max-w-full");
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
    render(
      <ListView
        focusedTaskId={null}
        tasks={tasks}
        allTasks={tasks}
      />
    );

    const [prioritySelect] = screen.getAllByRole("combobox");
    expect(prioritySelect).toBeDisabled();
    expect(screen.getByRole("button", { name: /set date/i })).toBeDisabled();
  });

  it("does not focus a task after checkbox quick-toggle in table view", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-focus",
      content: "Task content #general",
      status: "open",
    });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ id: task.author.id, name: task.author.name, displayName: task.author.displayName })];
    render(
      <ListView
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={people[0]}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.toggleComplete",
      taskId: "task-focus",
    });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "task-focus" });
  });

  it("does not focus a task after option-clicking its checkbox", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-option",
      content: "Task content #general",
      status: "open",
    });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ id: task.author.id, name: task.author.name, displayName: task.author.displayName })];

    render(
      <ListView
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={people[0]}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"), { altKey: true });

    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "task-option" });
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
    render(
      <ListView
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={people[0]}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));
    fireEvent.click(screen.getByText("In Progress"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",
      taskId: "task-dropdown",
      stateId: "active",
    });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "task-dropdown" });
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
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={people[0]}
      />
    );

    fireEvent.pointerDown(screen.getByLabelText("Set status"));

    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("renders breadcrumb-formatted plain text previews without autolink in table rows", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-first-line",
      content: "Top line #frontend **bold** https://example.com/image.png\nSecond line should be hidden",
      status: "open",
    });

    render(
      <ListView
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={task.author}
      />
    );

    const preview = screen.getByText("Top line frontend bold https://example.com/image.png");
    expect(preview).toBeInTheDocument();
    expect(preview).not.toHaveTextContent("Second line should be hidden");
    expect(screen.queryByRole("link", { name: "https://example.com/image.png" })).not.toBeInTheDocument();
  });

  it("reuses breadcrumb stripping to remove raw pubkey mention tokens from table previews", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-pubkey-preview",
      content: "nostr:npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq can you try implementing this",
      status: "open",
    });

    render(
      <ListView
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={task.author}
      />
    );

    expect(screen.getByText("can you try implementing this")).toBeInTheDocument();
    expect(screen.queryByText(/nostr:npub1/i)).not.toBeInTheDocument();
  });
});
