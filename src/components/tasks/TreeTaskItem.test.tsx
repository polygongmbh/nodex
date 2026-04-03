import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { TreeTaskItem } from "./TreeTaskItem";
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
  DropdownMenuSeparator: () => <div />,
  DropdownMenuShortcut: ({ children }: { children: ReactNode }) => <span>{children}</span>,
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

function renderTreeTaskItem(props: Partial<ComponentProps<typeof TreeTaskItem>> = {}) {
  const defaultProps: ComponentProps<typeof TreeTaskItem> = {
    task: props.task ?? baseTask,
    filteredChildren: props.filteredChildren ?? [],
    childrenMap: new Map(),
    currentUser: props.currentUser ?? baseTask.author,
    getFilteredChildrenFn: props.getFilteredChildrenFn ?? (() => []),
    ...props,
  };

  return render(<TreeTaskItem {...defaultProps} />);
}

describe("TreeTaskItem status actions", () => {
  it("cycles status on plain click even when status menu exists", () => {
    renderTreeTaskItem();

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.toggleComplete", taskId: "t1" });
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "t1" });
  });

  it("does not enter the task when toggling from in progress to done", () => {
    renderTreeTaskItem({ task: { ...baseTask, status: "in-progress" } });

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.toggleComplete", taskId: "t1" });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "t1" });
  });

  it("does not enter the task on option-click", () => {
    renderTreeTaskItem();

    fireEvent.click(screen.getByLabelText("Set status"), { altKey: true });

    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
  });

  it("opens raw nostr event dialog on shift+alt+click and skips task selection", () => {
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

    renderTreeTaskItem({ task: taskWithRawEvent });

    fireEvent.click(screen.getByRole("button", { name: /task: ship feature #frontend/i }), {
      shiftKey: true,
      altKey: true,
      button: 0,
    });

    expect(screen.getByText("Raw Nostr Event")).toBeInTheDocument();
    expect(screen.getByText(/"id": "event-1"/)).toBeInTheDocument();
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "t1" });
  });

  it("does not enter the task when selecting a status from the dropdown", () => {
    renderTreeTaskItem({ task: { ...baseTask, status: "done" } });

    fireEvent.click(screen.getByLabelText("Set status"));
    fireEvent.click(screen.getByText("In Progress"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",
      taskId: "t1",
      status: "in-progress",
    });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "t1" });
  });

  it("allows directly marking a task as done", () => {
    renderTreeTaskItem();

    fireEvent.click(screen.getByText("Done"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",
      taskId: "t1",
      status: "done",
    });
  });

  it("allows directly marking a task as closed", () => {
    renderTreeTaskItem();

    fireEvent.click(screen.getByText("Closed"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",
      taskId: "t1",
      status: "closed",
    });
  });

  it("does not cycle done tasks on click when status menu is available", () => {
    renderTreeTaskItem({ task: { ...baseTask, status: "done" } });

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
  });

  it("does not cycle closed tasks on click when status menu is available", () => {
    renderTreeTaskItem({ task: { ...baseTask, status: "closed" } });

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
  });

  it("shows a status hover hint on the task checkbox", () => {
    renderTreeTaskItem();

    expect(screen.getByLabelText("Set status")).toHaveAttribute(
      "title",
      expect.stringContaining("select status")
    );
  });

  it("blocks status changes when task is assigned to another user", () => {
    renderTreeTaskItem({
      task: {
        ...baseTask,
        author: makePerson({ id: "other-pubkey", name: "bob" }),
        content: "Follow up with @alice",
      },
    });

    const statusButton = screen.getByLabelText("Set status");
    expect(statusButton).toBeDisabled();
    expect(statusButton).toHaveAttribute("title", expect.stringContaining("assigned to"));
    fireEvent.click(statusButton);
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "task.toggleComplete" })
    );
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "task.changeStatus" })
    );
  });

  it("allows status changes when an unassigned task belongs to another user", () => {
    renderTreeTaskItem({
      task: {
        ...baseTask,
        author: makePerson({ id: "other-pubkey", name: "alice" }),
      },
    });

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

    renderTreeTaskItem({
      task: {
        ...baseTask,
        author: sparseAuthor,
        mentions: [sparseAuthor.id],
      },
      people: [knownPerson],
    });

    const statusButton = screen.getByLabelText("Set status");
    expect(statusButton).toBeDisabled();
    expect(statusButton).toHaveAttribute(
      "title",
      expect.stringContaining("assigned to Ryan (@ryan, ryan@example.com")
    );
    expect(statusButton).toHaveAttribute("title", expect.stringContaining(sparseAuthor.id));
  });

  it("supports modifier-based author filtering from comment avatar/name clicks", () => {
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

    renderTreeTaskItem({ task: commentTask });

    fireEvent.click(screen.getAllByRole("button", { name: /person actions for alice/i })[0], { ctrlKey: true });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "person.filter.exclusive",
      person: commentTask.author,
    });
  });

  it("hides comment author actions and tag chips in compact mode while keeping the due date", () => {
    const commentTask: Task = {
      ...baseTask,
      id: "compact-comment",
      taskType: "comment",
      content: "Compact comment #frontend",
      dueDate: new Date("2026-05-01T00:00:00.000Z"),
      dueTime: "10:00",
      author: makePerson({
        id: "compact-author",
        name: "commentator",
        displayName: "Commentator",
      }),
    };

    renderTreeTaskItem({ task: commentTask, compactView: true });

    expect(screen.queryByRole("button", { name: /person actions for commentator/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /filter to #frontend/i })).not.toBeInTheDocument();
    expect(screen.getByText("May 1, 2026")).toBeInTheDocument();
  });

  it("does not render attachment previews in tree cards", () => {
    const taskWithAttachment: Task = {
      ...baseTask,
      id: "attachment-task",
      attachments: [
        {
          url: "https://example.com/spec.pdf",
          name: "spec.pdf",
          mimeType: "application/pdf",
        },
      ],
    };

    renderTreeTaskItem({ task: taskWithAttachment });

    expect(screen.queryByText("spec.pdf")).not.toBeInTheDocument();
  });

  it("shows a precise hover timestamp for comment created time", () => {
    const commentTask: Task = {
      ...baseTask,
      id: "c2",
      taskType: "comment",
      content: "Precise time test",
      timestamp: new Date("2026-03-01T23:57:11.000Z"),
    };

    renderTreeTaskItem({ task: commentTask });

    expect(screen.getByTitle(/comment created at/i)).toHaveAttribute(
      "title",
      expect.stringMatching(/comment created at .*\d{2}:\d{2}:\d{2}/i)
    );
  });

  it("updates task priority from the priority chip", () => {
    renderTreeTaskItem({ task: { ...baseTask, priority: 40 } });

    fireEvent.change(screen.getByRole("combobox", { name: /priority/i }), {
      target: { value: "4" },
    });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.updatePriority",
      taskId: "t1",
      priority: 80,
    });
  });

  it("updates task priority from the compact priority control", () => {
    renderTreeTaskItem({ task: { ...baseTask, priority: 40 }, compactView: true });

    fireEvent.change(screen.getByRole("combobox", { name: /priority/i }), {
      target: { value: "4" },
    });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.updatePriority",
      taskId: "t1",
      priority: 80,
    });
  });

  it("updates date type from the due date chip controls", () => {
    const dueDate = new Date("2026-05-01T00:00:00.000Z");
    renderTreeTaskItem({ task: { ...baseTask, dueDate, dateType: "due" } });

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
