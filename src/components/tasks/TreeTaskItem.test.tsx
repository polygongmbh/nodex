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
    matchingChildren: props.matchingChildren ?? [],
    childrenMap: new Map(),
    currentUser: props.currentUser ?? baseTask.author,
    getMatchingChildrenFn: props.getMatchingChildrenFn ?? (() => []),
    ...props,
  };

  return render(<TreeTaskItem {...defaultProps} />);
}

describe("TreeTaskItem status actions", () => {
  it("cycles root folding through matching, collapsed, all, and back for nested open and done subtasks", () => {
    const doneChild = makeTask({ id: "b", parentId: "t1", content: "Task B", status: "done" });
    const openChild = makeTask({ id: "c", parentId: "t1", content: "Task C", status: "todo" });
    const openGrandchild = makeTask({ id: "d", parentId: "c", content: "Task D", status: "todo" });
    const childrenMap = new Map<string | undefined, Task[]>([
      ["t1", [doneChild, openChild]],
      ["c", [openGrandchild]],
    ]);

    renderTreeTaskItem({
      childrenMap,
      matchingChildren: [doneChild, openChild],
      getMatchingChildrenFn: (parentId) => childrenMap.get(parentId) || [],
    });

    const foldToggle = screen.getByTestId("tree-fold-toggle-t1");
    expect(foldToggle).toHaveAttribute("data-fold-state", "matchingOnly");
    expect(screen.queryByText("Task B")).not.toBeInTheDocument();
    expect(screen.getByText("Task C")).toBeInTheDocument();
    expect(screen.queryByText("Task D")).not.toBeInTheDocument();

    fireEvent.click(foldToggle);
    expect(screen.getByTestId("tree-fold-toggle-t1")).toHaveAttribute("data-fold-state", "collapsed");
    expect(screen.queryByText("Task B")).not.toBeInTheDocument();
    expect(screen.queryByText("Task C")).not.toBeInTheDocument();
    expect(screen.queryByText("Task D")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tree-fold-toggle-t1"));
    expect(screen.getByTestId("tree-fold-toggle-t1")).toHaveAttribute("data-fold-state", "allVisible");
    expect(screen.getByText("Task B")).toBeInTheDocument();
    expect(screen.getByText("Task C")).toBeInTheDocument();
    expect(screen.getByText("Task D")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tree-fold-toggle-t1"));
    expect(screen.getByTestId("tree-fold-toggle-t1")).toHaveAttribute("data-fold-state", "matchingOnly");
    expect(screen.queryByText("Task B")).not.toBeInTheDocument();
    expect(screen.getByText("Task C")).toBeInTheDocument();
    expect(screen.queryByText("Task D")).not.toBeInTheDocument();
  });

  it("keeps done subtasks hidden until the all-visible state when broader scope is active", () => {
    const openChild = makeTask({ id: "open-child", parentId: "t1", content: "Open child", status: "todo" });
    const doneChild = makeTask({ id: "done-child", parentId: "t1", content: "Done child", status: "done" });
    const childrenMap = new Map<string | undefined, Task[]>([["t1", [openChild, doneChild]]]);

    renderTreeTaskItem({
      childrenMap,
      matchingChildren: [openChild, doneChild],
      hasMatchingFilters: false,
      getMatchingChildrenFn: () => [openChild, doneChild],
    });

    const foldToggle = screen.getByTestId("tree-fold-toggle-t1");
    expect(foldToggle).toHaveAttribute("data-fold-state", "matchingOnly");
    expect(screen.getByText("Open child")).toBeInTheDocument();
    expect(screen.queryByText("Done child")).not.toBeInTheDocument();

    fireEvent.click(foldToggle);
    expect(screen.getByTestId("tree-fold-toggle-t1")).toHaveAttribute("data-fold-state", "collapsed");
    expect(screen.queryByText("Open child")).not.toBeInTheDocument();
    expect(screen.queryByText("Done child")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tree-fold-toggle-t1"));
    expect(screen.getByTestId("tree-fold-toggle-t1")).toHaveAttribute("data-fold-state", "allVisible");
    expect(screen.getByText("Open child")).toBeInTheDocument();
    expect(screen.getByText("Done child")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tree-fold-toggle-t1"));
    expect(screen.getByTestId("tree-fold-toggle-t1")).toHaveAttribute("data-fold-state", "matchingOnly");
    expect(screen.getByText("Open child")).toBeInTheDocument();
    expect(screen.queryByText("Done child")).not.toBeInTheDocument();
  });

  it("keeps matching descendant branches visible when the parent directly matches an active filter", () => {
    const doneChild = makeTask({ id: "b", parentId: "t1", content: "Task B", status: "done" });
    const openChild = makeTask({ id: "c", parentId: "t1", content: "Task C", status: "todo" });
    const openGrandchild = makeTask({ id: "d", parentId: "c", content: "Task D", status: "todo" });
    const childrenMap = new Map<string | undefined, Task[]>([
      ["t1", [doneChild, openChild]],
      ["c", [openGrandchild]],
    ]);

    renderTreeTaskItem({
      childrenMap,
      matchingChildren: [doneChild, openChild],
      hasMatchingFilters: true,
      isDirectMatchFn: (taskId) => taskId === "t1",
      getMatchingChildrenFn: (parentId) => childrenMap.get(parentId) || [],
    });

    expect(screen.getByText("Task B")).toBeInTheDocument();
    expect(screen.getByText("Task C")).toBeInTheDocument();
    expect(screen.getByText("Task D")).toBeInTheDocument();
  });

  it("shows matching branches far enough to reveal deep descendants when the parent does not directly match", () => {
    const doneChild = makeTask({ id: "b", parentId: "t1", content: "Task B", status: "done" });
    const matchingChild = makeTask({ id: "c", parentId: "t1", content: "Task C", status: "todo" });
    const openGrandchild = makeTask({ id: "d", parentId: "c", content: "Task D", status: "todo" });
    const childrenMap = new Map<string | undefined, Task[]>([
      ["t1", [doneChild, matchingChild]],
      ["c", [openGrandchild]],
    ]);

    renderTreeTaskItem({
      childrenMap,
      matchingChildren: [matchingChild],
      hasMatchingFilters: true,
      isDirectMatchFn: (taskId) => taskId === "c",
      getMatchingChildrenFn: (parentId) => {
        if (parentId === "t1") return [matchingChild];
        if (parentId === "c") return [openGrandchild];
        return [];
      },
    });

    expect(screen.queryByText("Task B")).not.toBeInTheDocument();
    expect(screen.getByText("Task C")).toBeInTheDocument();
    expect(screen.getByText("Task D")).toBeInTheDocument();
  });

  it("auto-unfolds nested matching branches far enough to reveal deep matches", () => {
    const matchingChild = makeTask({ id: "c", parentId: "t1", content: "Task C", status: "todo" });
    const matchingGrandchild = makeTask({ id: "d", parentId: "c", content: "Task D", status: "todo" });
    const childrenMap = new Map<string | undefined, Task[]>([
      ["t1", [matchingChild]],
      ["c", [matchingGrandchild]],
    ]);

    renderTreeTaskItem({
      childrenMap,
      matchingChildren: [matchingChild],
      hasMatchingFilters: true,
      matchedByFilter: false,
      isDirectMatchFn: (taskId) => taskId === "d",
      getMatchingChildrenFn: (parentId) => {
        if (parentId === "t1") return [matchingChild];
        if (parentId === "c") return [matchingGrandchild];
        return [];
      },
    });

    expect(screen.getByTestId("tree-fold-toggle-c")).toHaveAttribute("data-fold-state", "matchingOnly");
    expect(screen.getByText("Task D")).toBeInTheDocument();
  });

  it("dims only the non-matching ancestor row while keeping matching descendants undimmed", () => {
    const matchingChild = makeTask({ id: "c", parentId: "t1", content: "Task C", status: "todo" });
    const childrenMap = new Map<string | undefined, Task[]>([["t1", [matchingChild]]]);

    renderTreeTaskItem({
      task: { ...baseTask, content: "Task A" },
      childrenMap,
      matchingChildren: [matchingChild],
      hasMatchingFilters: true,
      matchedByFilter: false,
      isDirectMatchFn: (taskId) => taskId === "c",
      getMatchingChildrenFn: (parentId) => (parentId === "t1" ? [matchingChild] : []),
    });

    const rootRow = screen.getByRole("button", { name: /task: task a/i });
    const childRow = screen.getByRole("button", { name: /task: task c/i });

    expect(rootRow.className).toContain("opacity-50");
    expect(childRow.className).not.toContain("opacity-50");
  });

  it("lets a descendant collapse while its ancestor is showing all subtasks", () => {
    const doneChild = makeTask({ id: "b", parentId: "t1", content: "Task B", status: "done" });
    const openChild = makeTask({ id: "c", parentId: "t1", content: "Task C", status: "todo" });
    const openGrandchild = makeTask({ id: "d", parentId: "c", content: "Task D", status: "todo" });
    const childrenMap = new Map<string | undefined, Task[]>([
      ["t1", [doneChild, openChild]],
      ["c", [openGrandchild]],
    ]);

    renderTreeTaskItem({
      childrenMap,
      matchingChildren: [doneChild, openChild],
      getMatchingChildrenFn: (parentId) => childrenMap.get(parentId) || [],
    });

    fireEvent.click(screen.getByTestId("tree-fold-toggle-t1"));
    fireEvent.click(screen.getByTestId("tree-fold-toggle-t1"));

    expect(screen.getByTestId("tree-fold-toggle-t1")).toHaveAttribute("data-fold-state", "allVisible");
    expect(screen.getByTestId("tree-fold-toggle-c")).toHaveAttribute("data-fold-state", "allVisible");
    expect(screen.getByText("Task D")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tree-fold-toggle-c"));

    expect(screen.getByTestId("tree-fold-toggle-c")).toHaveAttribute("data-fold-state", "collapsed");
    expect(screen.queryByText("Task D")).not.toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
    expect(screen.getByText("Task C")).toBeInTheDocument();
  });

  it("uses clear fold-toggle tooltips for each tree state", () => {
    const doneChild = makeTask({ id: "b", parentId: "t1", content: "Task B", status: "done" });
    const openChild = makeTask({ id: "c", parentId: "t1", content: "Task C", status: "todo" });
    const childrenMap = new Map<string | undefined, Task[]>([["t1", [doneChild, openChild]]]);

    renderTreeTaskItem({
      childrenMap,
      matchingChildren: [doneChild, openChild],
      getMatchingChildrenFn: (parentId) => childrenMap.get(parentId) || [],
    });

    const foldToggle = screen.getByTestId("tree-fold-toggle-t1");
    const initialTitle = foldToggle.getAttribute("title");
    expect(initialTitle).toBeTruthy();

    fireEvent.click(foldToggle);
    const collapsedTitle = screen.getByTestId("tree-fold-toggle-t1").getAttribute("title");
    expect(collapsedTitle).toBeTruthy();
    expect(collapsedTitle).not.toBe(initialTitle);

    fireEvent.click(screen.getByTestId("tree-fold-toggle-t1"));
    const openOnlyTitle = screen.getByTestId("tree-fold-toggle-t1").getAttribute("title");
    expect(openOnlyTitle).toBeTruthy();
    expect(openOnlyTitle).not.toBe(collapsedTitle);
  });

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

  it("blocks status changes when another user's task matches a known person", () => {
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
    fireEvent.click(statusButton);
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "task.toggleComplete" })
    );
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "task.changeStatus" })
    );
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
