import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { TreeTaskItem } from "./TreeTaskItem";
import type { Post } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import { makeComment, makePerson, makeTask, withTaskState } from "@/test/fixtures";
import { setRawEvent } from "@/stores/raw-events";

const dispatchFeedInteraction = vi.fn();

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" } }),
}));

vi.mock("@/infrastructure/nostr/use-nostr-profiles", () => ({
  useNostrProfile: (): { profile: null } => ({ profile: null }),
  useNostrProfiles: (): { getProfile: () => null } => ({
    getProfile: () => null,
  }),
  useCachedNostrProfile: () => null,
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

const baseTask: Post = makeTask({
  id: "t1",
  author: makePerson({ pubkey: "me", name: "me", displayName: "Me" }),
  content: "Ship feature #frontend",
  tags: ["frontend"],
  state: {
    status: "open"
  },
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

function chooseComboboxOptionByIndex(name: string | RegExp, optionIndex: number) {
  const trigger = screen.getByRole("combobox", { name });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
  const option = within(screen.getByRole("listbox")).getAllByRole("option")[optionIndex];
  fireEvent.pointerUp(option);
  fireEvent.click(option);
}

describe("TreeTaskItem status actions", () => {
  it("cycles between matching, collapsed, and all-visible child states", () => {
    const doneChild = makeTask({ id: "done-child", parentId: "t1", content: "Done child", state: {
      status: "done"
    } });
    const openChild = makeTask({ id: "open-child", parentId: "t1", content: "Open child", state: {
      status: "open"
    } });
    const childrenMap = new Map<string | undefined, Post[]>([["t1", [openChild, doneChild]]]);

    renderTreeTaskItem({
      childrenMap,
      matchingChildren: [openChild, doneChild],
      getMatchingChildrenFn: () => [openChild, doneChild],
    });

    const foldToggle = screen.getByTestId("tree-fold-toggle-t1");

    expect(foldToggle).toHaveAttribute("data-fold-state", "matchingOnly");
    expect(screen.getByText("Open child")).toBeInTheDocument();
    expect(screen.queryByText("Done child")).not.toBeInTheDocument();

    fireEvent.click(foldToggle);
    expect(foldToggle).toHaveAttribute("data-fold-state", "collapsed");
    expect(screen.queryByText("Open child")).not.toBeInTheDocument();

    fireEvent.click(foldToggle);
    expect(foldToggle).toHaveAttribute("data-fold-state", "allVisible");
    expect(screen.getByText("Done child")).toBeInTheDocument();

    fireEvent.click(foldToggle);
    expect(foldToggle).toHaveAttribute("data-fold-state", "matchingOnly");
    expect(screen.queryByText("Done child")).not.toBeInTheDocument();
  });

  it("cycles status on plain click even when status menu exists", () => {
    renderTreeTaskItem();

    fireEvent.click(screen.getByLabelText("Set status"), { detail: 1 });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.toggleComplete", taskId: "t1" });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "t1" });
  });

  it("does not enter the task when toggling from in progress to done", () => {
    renderTreeTaskItem({ task: withTaskState(baseTask, "active") });

    fireEvent.click(screen.getByLabelText("Set status"), { detail: 1 });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.toggleComplete", taskId: "t1" });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "t1" });
  });

  it("does not enter the task on option-click", () => {
    renderTreeTaskItem();

    fireEvent.click(screen.getByLabelText("Set status"), { altKey: true });

    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
  });

  it("opens raw nostr event dialog on shift+alt+click and skips task selection", () => {
    const taskWithRawEvent: Post = { ...baseTask, id: "task-with-raw-event" };
    setRawEvent(taskWithRawEvent.id, {
      id: "event-1",
      pubkey: "b".repeat(64),
      created_at: 1700000000,
      kind: 1,
      tags: [["t", "frontend"]],
      content: "Ship feature #frontend",
      sig: "c".repeat(128),
    });

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
    renderTreeTaskItem({ task: withTaskState(baseTask, "done") });

    fireEvent.click(screen.getByLabelText("Set status"));
    fireEvent.click(screen.getByText("In Progress"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",      taskId: "t1",
      state: { status: "active" },
    });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "t1" });
  });

  it("allows directly marking a task as done", () => {
    renderTreeTaskItem();

    fireEvent.click(screen.getByText("Done"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",      taskId: "t1",
      state: { status: "done" },
    });
  });

  it("allows directly marking a task as closed", () => {
    renderTreeTaskItem();

    fireEvent.click(screen.getByText("Closed"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",      taskId: "t1",
      state: { status: "closed" },
    });
  });

  it("does not cycle done tasks on click when status menu is available", () => {
    renderTreeTaskItem({ task: withTaskState(baseTask, "done") });

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
  });

  it("does not cycle closed tasks on click when status menu is available", () => {
    renderTreeTaskItem({ task: withTaskState(baseTask, "closed") });

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(dispatchFeedInteraction).not.toHaveBeenCalled();
  });

  it("blocks status changes when task is assigned to another user", () => {
    renderTreeTaskItem({
      task: {
        ...baseTask,
        author: makePerson({ pubkey: "other-pubkey", name: "bob" }),
        content: "Follow up with @alice",
      },
    });

    const statusButton = screen.getByLabelText("Set status");
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
        author: makePerson({ pubkey: "other-pubkey", name: "alice" }),
      },
    });

    const statusButton = screen.getByLabelText("Set status");
    expect(statusButton).not.toBeDisabled();
    fireEvent.click(statusButton, { detail: 1 });
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.toggleComplete", taskId: "t1" });
  });

  it("blocks status changes when another user's task matches a known person", () => {
    const sparseAuthor = makePerson({
      pubkey: "ad9cb1b0f13f54e84214e7dc809bcf6968a4e255c57c6a588eb976b4e8141318",
      name: "ad9cb1b0",
      displayName: "ad9cb1b0...1318",
    });
    const knownPerson = makePerson({
      pubkey: sparseAuthor.pubkey,
      name: "ryan",
      displayName: "Ryan",
      nip05: "ryan@example.com",
    });

    renderTreeTaskItem({
      task: {
        ...baseTask,
        author: sparseAuthor,
        mentions: [sparseAuthor.pubkey],
      },
      people: [knownPerson],
    });

    const statusButton = screen.getByLabelText("Set status");
    fireEvent.click(statusButton);
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "task.toggleComplete" })
    );
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "task.changeStatus" })
    );
  });

  it("supports modifier-based author filtering from comment avatar/name clicks", () => {
    const commentTask: Post = {
      ...baseTask,
      id: "c1",
      kind: NostrEventKind.TextNote,
      content: "Looks good",
      author: makePerson({
        pubkey: "alice-pubkey",
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

  it("does not focus the task on a plain comment author click", () => {
    const commentTask: Post = {
      ...baseTask,
      id: "c-plain-author",
      kind: NostrEventKind.TextNote,
      content: "Looks good",
      author: makePerson({
        pubkey: "plain-author",
        name: "alice",
        displayName: "Alice",
      }),
    };

    renderTreeTaskItem({ task: commentTask });

    fireEvent.click(screen.getAllByRole("button", { name: /person actions for alice/i })[0]);

    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({
      type: "task.focus.change",
      taskId: "c-plain-author",
    });
  });

  it("keeps the comment avatar stack on the right and removes the left author avatar", () => {
    const commentTask = makeComment({
      id: "c-right-avatar-only",
      content: "Looks good",
      author: makePerson({
        pubkey: "f5dc0ba672437167ccb3f58f2467990f9c574bc6522af1e76361404e7868a0f5",
        name: "alice",
        displayName: "Alice",
      }),
    });

    renderTreeTaskItem({ task: commentTask });

    expect(screen.queryByTestId("task-item-beam-c-right-avatar-only")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Assigned to 1 person")).toBeInTheDocument();
  });

  it("does not render attachment previews in tree cards", () => {
    const taskWithAttachment: Post = {
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

  it("updates task priority from the priority chip", () => {
    renderTreeTaskItem({ task: { ...baseTask, priority: 40 } });

    chooseComboboxOptionByIndex(/priority/i, 4);

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.updatePriority",
      taskId: "t1",
      priority: 80,
    });
  });

  it("updates task priority from the compact priority control", () => {
    renderTreeTaskItem({ task: { ...baseTask, priority: 40 }, compactView: true });

    chooseComboboxOptionByIndex(/priority/i, 4);

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.updatePriority",
      taskId: "t1",
      priority: 80,
    });
  });

});
