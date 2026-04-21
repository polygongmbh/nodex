import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanView } from "./KanbanView";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";
import type { TaskCreateResult } from "@/types";

const dndMockState: {
  onDragEnd: ((result: {
    draggableId: string;
    source: { droppableId: string; index: number };
    destination: { droppableId: string; index: number } | null;
  }) => void) | null;
  onDragStart: (() => void) | null;
} = {
  onDragEnd: null,
  onDragStart: null,
};
const dispatchFeedInteraction = vi.fn();

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" } }),
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children, onDragEnd, onDragStart }: { children: ReactNode; onDragEnd: (result: {
    draggableId: string;
    source: { droppableId: string; index: number };
    destination: { droppableId: string; index: number } | null;
  }) => void; onDragStart?: () => void }) => {
    dndMockState.onDragEnd = onDragEnd;
    dndMockState.onDragStart = onDragStart ?? null;
    return <div>{children}</div>;
  },
  Droppable: ({
    children,
    droppableId,
  }: {
    children: (provided: { innerRef: () => void; droppableProps: Record<string, unknown> }, snapshot: { isDraggingOver: boolean }) => ReactNode;
    droppableId: string;
  }) =>
    children(
      {
        innerRef: () => {},
        droppableProps: { "data-droppable-id": droppableId },
      },
      { isDraggingOver: false }
    ),
  Draggable: ({
    children,
    draggableId,
  }: {
    children: (
      provided: {
        innerRef: () => void;
        draggableProps: Record<string, unknown>;
        dragHandleProps: Record<string, unknown>;
      },
      snapshot: { isDragging: boolean }
    ) => ReactNode;
    draggableId: string;
  }) =>
    children(
      {
        innerRef: () => {},
        draggableProps: { "data-draggable-id": draggableId },
        dragHandleProps: {},
      },
      { isDragging: false }
    ),
}));

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
});

describe("KanbanView closed column", () => {
  it("uses an auto-width board scrollbar and hides horizontal overflow inside columns", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const todoTask = makeTask({ id: "todo-task", author, status: "todo", content: "Todo task #general" });

    const { container } = render(
      <KanbanView
        tasks={[todoTask]}
        allTasks={[todoTask]}
        relays={[makeRelay()]}
        channels={[makeChannel()]}
        people={[author]}
        currentUser={author}
        searchQuery=""
        depthMode="leaves"
        onStatusChange={vi.fn()}
      />
    );

    const board = container.querySelector('[data-onboarding="kanban-board"]');
    const todoColumnList = container.querySelector('[data-droppable-id="todo"]')?.parentElement;

    expect(board?.className).toContain("scrollbar-auto");
    expect(todoColumnList?.className).toContain("overflow-x-hidden");
  });

  it("renders a closed column to the right of done", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const todoTask = makeTask({ id: "todo-task", author, status: "todo", content: "Todo task #general" });
    const doneTask = makeTask({ id: "done-task", author, status: "done", content: "Done task #general" });
    const closedTask = makeTask({ id: "closed-task", author, status: "closed", content: "Closed task #general" });

    render(
      <KanbanView
        tasks={[todoTask, doneTask, closedTask]}
        allTasks={[todoTask, doneTask, closedTask]}
        relays={[makeRelay()]}
        channels={[makeChannel()]}
        people={[author]}
        currentUser={author}
        searchQuery=""
        depthMode="leaves"
        onStatusChange={vi.fn()}
      />
    );

    const headings = screen
      .getAllByText(/^(To Do|In Progress|Done|Closed)$/)
      .map((node) => node.textContent?.trim());
    expect(headings).toEqual(["To Do", "In Progress", "Done", "Closed"]);
    expect(screen.getAllByText((_, node) => node?.textContent === "Closed task #general")[0]).toBeInTheDocument();
  });

  it("shows priority chips only for tasks with numeric priority", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const prioritizedTask = makeTask({
      id: "priority-task",
      author,
      status: "todo",
      content: "Prioritized task #general",
      priority: 80,
    });
    const nonPrioritizedTask = makeTask({
      id: "no-priority-task",
      author,
      status: "todo",
      content: "No priority task #general",
    });

    render(
      <KanbanView
        tasks={[prioritizedTask, nonPrioritizedTask]}
        allTasks={[prioritizedTask, nonPrioritizedTask]}
        relays={[makeRelay()]}
        channels={[makeChannel()]}
        people={[author]}
        currentUser={author}
        searchQuery=""
        depthMode="leaves"
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.getByRole("combobox", { name: /priority/i })).toHaveValue("4");
    expect(screen.getAllByRole("combobox", { name: /priority/i })).toHaveLength(1);
  });

  it("keeps priority pinned outside the metadata chip row", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const task = makeTask({
      id: "priority-and-tag-task",
      author,
      status: "todo",
      content: "Task with chips #general",
      tags: ["general"],
      priority: 80,
    });

    render(
      <KanbanView
        tasks={[task]}
        allTasks={[task]}
        relays={[makeRelay()]}
        channels={[makeChannel()]}
        people={[author]}
        currentUser={author}
        searchQuery=""
        depthMode="leaves"
        onStatusChange={vi.fn()}
      />
    );

    const chipRow = screen.getByTestId("kanban-chip-row-priority-and-tag-task");
    const hashtagChip = screen.getByRole("button", { name: /filter to #general/i });
    expect(screen.getByRole("combobox", { name: /priority/i })).toHaveValue("4");
    expect(chipRow).not.toHaveTextContent("P4");
    expect(chipRow).toContainElement(hashtagChip);
  });

  it("renders due date row above metadata chips", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const task = makeTask({
      id: "due-before-chip-task",
      author,
      status: "todo",
      content: "Task with due date and chips #general",
      tags: ["general"],
      priority: 80,
      dueDate: new Date("2026-02-18T10:00:00.000Z"),
      dueTime: "10:00",
    });

    render(
      <KanbanView
        tasks={[task]}
        allTasks={[task]}
        relays={[makeRelay()]}
        channels={[makeChannel()]}
        people={[author]}
        currentUser={author}
        searchQuery=""
        depthMode="leaves"
        onStatusChange={vi.fn()}
      />
    );

    const dueRow = screen.getByTestId("kanban-due-row-due-before-chip-task");
    const chipRow = screen.getByTestId("kanban-chip-row-due-before-chip-task");
    expect(dueRow.compareDocumentPosition(chipRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not render attachment previews in kanban cards", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const task = makeTask({
      id: "attachment-task",
      author,
      status: "todo",
      content: "Task with attachment #general",
      attachments: [
        {
          url: "https://example.com/spec.pdf",
          name: "spec.pdf",
          mimeType: "application/pdf",
        },
      ],
    });

    render(
      <KanbanView
        tasks={[task]}
        allTasks={[task]}
        relays={[makeRelay()]}
        channels={[makeChannel()]}
        people={[author]}
        currentUser={author}
        searchQuery=""
        depthMode="leaves"
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.queryByText("spec.pdf")).not.toBeInTheDocument();
  });

  it("hides tag chips in compact kanban cards while keeping due date and priority", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const task = makeTask({
      id: "compact-kanban-task",
      author,
      status: "todo",
      content: "Compact kanban task #general",
      tags: ["general"],
      priority: 80,
      dueDate: new Date("2026-02-18T10:00:00.000Z"),
      dueTime: "10:00",
    });

    render(
      <KanbanView
        tasks={[task]}
        allTasks={[task]}
        relays={[makeRelay()]}
        channels={[makeChannel()]}
        people={[author]}
        currentUser={author}
        searchQuery=""
        depthMode="leaves"
        compactTaskCardsEnabled
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.getByRole("combobox", { name: /priority/i })).toHaveValue("4");
    expect(screen.getByTestId("kanban-due-row-compact-kanban-task")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /filter to #general/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("kanban-chip-row-compact-kanban-task")).not.toBeInTheDocument();
  });

  it("renders a droppable target for empty columns", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });

    const { container } = render(
      <KanbanView
        tasks={[]}
        allTasks={[]}
        relays={[makeRelay()]}
        channels={[makeChannel()]}
        people={[author]}
        currentUser={author}
        searchQuery=""
        depthMode="leaves"
        onStatusChange={vi.fn()}
      />
    );

    const todoDropTarget = container.querySelector('[data-droppable-id="todo"]');
    expect(todoDropTarget).toBeInTheDocument();
  });

  it("focuses branch tasks from kanban cards", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const parent = makeTask({ id: "parent-task", author, status: "todo", content: "Parent task #general" });
    const child = makeTask({
      id: "child-task",
      author,
      status: "todo",
      content: "Child task #general",
      parentId: "parent-task",
    });

    render(
      <KanbanView
        tasks={[parent, child]}
        allTasks={[parent, child]}
        currentUser={author}
        depthMode="all"
      />
    );

    const parentCard = document.querySelector('[data-task-id="parent-task"]');
    expect(parentCard).toBeInTheDocument();
    fireEvent.click(parentCard!);

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "parent-task" });
  });

  it("does not focus leaf tasks from kanban cards", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const leaf = makeTask({ id: "leaf-task", author, status: "todo", content: "Leaf task #general" });

    render(
      <KanbanView
        tasks={[leaf]}
        allTasks={[leaf]}
        currentUser={author}
        depthMode="leaves"
      />
    );

    const leafCard = document.querySelector('[data-task-id="leaf-task"]');
    expect(leafCard).toBeInTheDocument();
    fireEvent.click(leafCard!);

    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "leaf-task" });
  });

  it("scrolls the board right when dragging near the right edge", () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    try {
      const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
      const task = makeTask({ id: "edge-scroll-task", author, status: "todo", content: "Task #general" });

      const { container } = render(
        <KanbanView tasks={[task]} allTasks={[task]} currentUser={author} depthMode="leaves" />
      );

      const board = container.querySelector('[data-onboarding="kanban-board"]') as HTMLElement;
      vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
        left: 0, right: 800, top: 0, bottom: 600, width: 800, height: 600, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      act(() => { dndMockState.onDragStart?.(); });

      // Near the right edge: 800 - 720 = 80px inside the 120px zone
      fireEvent.mouseMove(window, { clientX: 720, clientY: 300 });

      act(() => {
        const pending = rafCallbacks.splice(0);
        pending.forEach(cb => cb(0));
      });

      expect(board.scrollLeft).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("optimistically places dropped cards in destination column before parent props refresh", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const task = makeTask({ id: "drag-task", author, status: "todo", content: "Drag me #general" });
    const { container } = render(
      <KanbanView
        tasks={[task]}
        allTasks={[task]}
        relays={[makeRelay()]}
        channels={[makeChannel()]}
        people={[author]}
        currentUser={author}
        searchQuery=""
        depthMode="leaves"
        onStatusChange={vi.fn()}
      />
    );

    const todoDropTargetBefore = container.querySelector('[data-droppable-id="todo"]');
    const doneDropTargetBefore = container.querySelector('[data-droppable-id="done"]');
    expect(todoDropTargetBefore?.querySelector('[data-draggable-id="drag-task"]')).toBeInTheDocument();
    expect(doneDropTargetBefore?.querySelector('[data-draggable-id="drag-task"]')).not.toBeInTheDocument();

    act(() => {
      dndMockState.onDragEnd?.({
        draggableId: "drag-task",
        source: { droppableId: "todo", index: 0 },
        destination: { droppableId: "done", index: 0 },
      });
    });

    const todoDropTargetAfter = container.querySelector('[data-droppable-id="todo"]');
    const doneDropTargetAfter = container.querySelector('[data-droppable-id="done"]');
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",
      taskId: "drag-task",
      status: "done",
    });
    expect(doneDropTargetAfter?.querySelector('[data-draggable-id="drag-task"]')).toBeInTheDocument();
    expect(todoDropTargetAfter?.querySelector('[data-draggable-id="drag-task"]')).not.toBeInTheDocument();
  });
});
