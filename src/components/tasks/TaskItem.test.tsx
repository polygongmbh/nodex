import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { TaskItem } from "./TaskItem";
import type { Task } from "@/types";
import { makePerson, makeTask } from "@/test/fixtures";

const dispatchFeedInteraction = vi.fn();

vi.mock("@/infrastructure/nostr/use-nostr-profiles", () => ({
  useNostrProfile: (): { profile: null } => ({ profile: null }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect?: (date?: Date) => void }) => (
    <button type="button" onClick={() => onSelect?.(new Date("2026-05-10T00:00:00.000Z"))}>
      Select calendar date
    </button>
  ),
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

const baseTask: Task = makeTask({
  id: "t1",
  author: makePerson({ id: "me", name: "me", displayName: "Me" }),
  content: "Ship feature #frontend",
  tags: ["frontend"],
  status: "todo",
});

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
});

describe("TaskItem status actions", () => {
  it("cycles status on plain click even when status menu exists", () => {
    const onSelect = vi.fn();

    render(
      <TaskItem
        task={baseTask}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.toggleComplete", taskId: "t1" });
    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("does not enter the task when toggling from in progress to done", () => {
    const onSelect = vi.fn();

    render(
      <TaskItem
        task={{ ...baseTask, status: "in-progress" }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.toggleComplete", taskId: "t1" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not enter the task on option-click", () => {
    const onSelect = vi.fn();

    render(
      <TaskItem
        task={baseTask}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"), { altKey: true });

    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens raw nostr event dialog on shift+alt+click and skips task selection", () => {
    const onSelect = vi.fn();
    const taskWithRawEvent: Task = {
      ...baseTask,
      rawNostrEvent: {
        id: "event-1",
        pubkey: "b".repeat(64),
        created_at: 1700000000,
        kind: 1,
        tags: [["t", "frontend"]],
        content: "Ship feature #frontend",
        sig: "c".repeat(128),
      },
    };

    render(
      <TaskItem
        task={taskWithRawEvent}
        filteredChildren={[]}
        allTasks={[taskWithRawEvent]}
        currentUser={baseTask.author}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /task: ship feature #frontend/i }), {
      shiftKey: true,
      altKey: true,
      button: 0,
    });

    expect(screen.getByText("Raw Nostr Event")).toBeInTheDocument();
    expect(screen.getByText(/"id": "event-1"/)).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not enter the task when selecting a status from the dropdown", () => {
    const onSelect = vi.fn();

    render(
      <TaskItem
        task={{ ...baseTask, status: "done" }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));
    fireEvent.click(screen.getByText("In Progress"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",
      taskId: "t1",
      status: "in-progress",
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("allows directly marking a task as done", () => {
    render(
      <TaskItem
        task={baseTask}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
      />
    );

    fireEvent.click(screen.getByText("Done"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",
      taskId: "t1",
      status: "done",
    });
  });

  it("allows directly marking a task as closed", () => {
    render(
      <TaskItem
        task={baseTask}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
      />
    );

    fireEvent.click(screen.getByText("Closed"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",
      taskId: "t1",
      status: "closed",
    });
  });

  it("does not cycle done tasks on click when status menu is available", () => {
    render(
      <TaskItem
        task={{ ...baseTask, status: "done" }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
  });

  it("does not cycle closed tasks on click when status menu is available", () => {
    render(
      <TaskItem
        task={{ ...baseTask, status: "closed" }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
  });

  it("shows a status hover hint on the task checkbox", () => {
    render(
      <TaskItem
        task={baseTask}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
      />
    );

    expect(screen.getByLabelText("Set status")).toHaveAttribute(
      "title",
      expect.stringContaining("select status")
    );
  });

  it("blocks status changes when task is assigned to another user", () => {
    render(
      <TaskItem
        task={{
          ...baseTask,
          author: makePerson({ id: "other-pubkey", name: "bob" }),
          content: "Follow up with @alice",
        }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
      />
    );

    const statusButton = screen.getByLabelText("Set status");
    expect(statusButton).toBeDisabled();
    expect(statusButton).toHaveAttribute("title", expect.stringContaining("assigned to"));
    fireEvent.click(statusButton);
    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
  });

  it("allows status changes when an unassigned task belongs to another user", () => {
    render(
      <TaskItem
        task={{
          ...baseTask,
          author: makePerson({ id: "other-pubkey", name: "alice" }),
        }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
      />
    );

    const statusButton = screen.getByLabelText("Set status");
    expect(statusButton).not.toBeDisabled();
    fireEvent.click(statusButton);
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.toggleComplete", taskId: "t1" });
  });

  it("uses people context to show enriched identity details in blocked reason", () => {
    const sparseAuthor = makePerson({
      id: "ad9cb1b0f13f54e84214e7dc809bcf6968a4e255c57c6a588eb976b4e8141318",
      name: "ad9cb1b0",
      displayName: "ad9cb1b0...1318",
    });
    const knownPerson = makePerson({
      id: sparseAuthor.id,
      name: "ryan",
      displayName: "Ryan",
      nip05: "ryan@example.com",
    });

    render(
      <TaskItem
        task={{
          ...baseTask,
          author: sparseAuthor,
          mentions: [sparseAuthor.id],
        }}
        people={[knownPerson]}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
      />
    );

    const statusButton = screen.getByLabelText("Set status");
    expect(statusButton).toBeDisabled();
    expect(statusButton).toHaveAttribute(
      "title",
      expect.stringContaining("assigned to Ryan (@ryan, ryan@example.com")
    );
    expect(statusButton).toHaveAttribute("title", expect.stringContaining(sparseAuthor.id));
  });

  it("calls author quick action for comment avatar/name clicks", () => {
    const commentTask: Task = {
      ...baseTask,
      id: "c1",
      taskType: "comment",
      content: "Looks good",
      author: makePerson({
        id: "alice-pubkey",
        name: "alice",
        displayName: "Alice",
      }),
    };

    render(
      <TaskItem
        task={commentTask}
        filteredChildren={[]}
        allTasks={[commentTask]}
        currentUser={baseTask.author}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /filter and mention alice/i })[0]);

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "filter.applyAuthorExclusive",
      author: commentTask.author,
    });
  });

  it("shows a precise hover timestamp for comment created time", () => {
    const commentTask: Task = {
      ...baseTask,
      id: "c2",
      taskType: "comment",
      content: "Precise time test",
      timestamp: new Date("2026-03-01T23:57:11.000Z"),
    };

    render(
      <TaskItem
        task={commentTask}
        filteredChildren={[]}
        allTasks={[commentTask]}
        currentUser={baseTask.author}
      />
    );

    expect(screen.getByTitle(/comment created at/i)).toHaveAttribute(
      "title",
      expect.stringMatching(/comment created at .*\d{2}:\d{2}:\d{2}/i)
    );
  });

  it("updates task priority from the priority chip", () => {
    render(
      <TaskItem
        task={{ ...baseTask, priority: 40 }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /priority/i }), {
      target: { value: "80" },
    });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.updatePriority",
      taskId: "t1",
      priority: 80,
    });
  });

  it("updates date type from the due date chip controls", () => {
    const dueDate = new Date("2026-05-01T00:00:00.000Z");
    render(
      <TaskItem
        task={{ ...baseTask, dueDate, dateType: "due" }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /type/i }), {
      target: { value: "scheduled" },
    });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.updateDueDate",
      taskId: "t1",
      dueDate,
      dueTime: undefined,
      dateType: "scheduled",
    });
  });
});
