import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanView } from "./KanbanView";
import { makePerson, makeTask } from "@/test/fixtures";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";

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
    disableInteractiveElementBlocking?: boolean;
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
  usePreferencesStore.setState({ compactTaskCardsEnabled: false });
});

describe("KanbanView", () => {
  // Column structure

  it("renders a closed column to the right of done", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const todoTask = makeTask({ id: "todo-task", author, status: "open", content: "Todo task #general" });
    const doneTask = makeTask({ id: "done-task", author, status: "done", content: "Done task #general" });
    const closedTask = makeTask({ id: "closed-task", author, status: "closed", content: "Closed task #general" });

    render(
      <KanbanView
        focusedTaskId={null}
        tasks={[todoTask, doneTask, closedTask]}
        allTasks={[todoTask, doneTask, closedTask]}
        currentUser={author}
        depthMode="leaves"
      />
    );

    const headings = screen
      .getAllByText(/^(Open|In Progress|Done|Closed)$/)
      .map((node) => node.textContent?.trim());
    expect(headings).toEqual(["Open", "In Progress", "Done", "Closed"]);
    expect(screen.getAllByText((_, node) => node?.textContent === "Closed task #general")[0]).toBeInTheDocument();
  });

  it("uses shared priority-first ordering for active kanban columns", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const olderHighPriority = makeTask({
      id: "older-high-priority",
      author,
      status: "open",
      content: "Older high priority task #general",
      priority: 80,
      timestamp: new Date("2026-02-17T08:00:00.000Z"),
      lastEditedAt: new Date("2026-02-17T08:00:00.000Z"),
    });
    const newerNoPriority = makeTask({
      id: "newer-no-priority",
      author,
      status: "open",
      content: "Newer no priority task #general",
      timestamp: new Date("2026-02-17T10:00:00.000Z"),
      lastEditedAt: new Date("2026-02-17T10:00:00.000Z"),
    });

    const { container } = render(
      <KanbanView
        focusedTaskId={null}
        tasks={[newerNoPriority, olderHighPriority]}
        allTasks={[newerNoPriority, olderHighPriority]}
        currentUser={author}
        depthMode="leaves"
      />
    );

    const openCards = Array.from(
      container.querySelectorAll('[data-droppable-id="open"] [data-draggable-id]')
    ).map((node) => node.getAttribute("data-draggable-id"));
    expect(openCards).toEqual(["older-high-priority", "newer-no-priority"]);
  });

  it("renders a separate column for a custom task status", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const blockedTask = makeTask({
      id: "blocked-task",
      author,
      status: { type: "active", description: "Blocked" },
      content: "Blocked task #general",
    });

    render(
      <KanbanView
        focusedTaskId={null}
        tasks={[blockedTask]}
        allTasks={[blockedTask]}
        currentUser={author}
        depthMode="leaves"
      />
    );

    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("renders a droppable target for empty columns", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });

    const { container } = render(
      <KanbanView
        focusedTaskId={null}
        tasks={[]}
        allTasks={[]}
        currentUser={author}
        depthMode="leaves"
      />
    );

    expect(container.querySelector('[data-droppable-id="open"]')).toBeInTheDocument();
  });

  // Card content

  it("shows priority chips only for tasks with numeric priority", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const prioritizedTask = makeTask({
      id: "priority-task",
      author,
      status: "open",
      content: "Prioritized task #general",
      priority: 80,
    });
    const nonPrioritizedTask = makeTask({
      id: "no-priority-task",
      author,
      status: "open",
      content: "No priority task #general",
    });

    render(
      <KanbanView
        focusedTaskId={null}
        tasks={[prioritizedTask, nonPrioritizedTask]}
        allTasks={[prioritizedTask, nonPrioritizedTask]}
        currentUser={author}
        depthMode="leaves"
      />
    );

    expect(screen.getByRole("combobox", { name: /priority/i })).toBeInTheDocument();
    expect(screen.getAllByRole("combobox", { name: /priority/i })).toHaveLength(1);
  });

  it("keeps priority pinned outside the metadata chip row", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const task = makeTask({
      id: "priority-and-tag-task",
      author,
      status: "open",
      content: "Task with chips #general",
      tags: ["general"],
      priority: 80,
    });

    render(
      <KanbanView
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={author}
        depthMode="leaves"
      />
    );

    const chipRow = screen.getByTestId("kanban-chip-row-priority-and-tag-task");
    const hashtagChip = screen.getByRole("button", { name: /filter to #general/i });
    expect(screen.getByRole("combobox", { name: /priority/i })).toBeInTheDocument();
    expect(chipRow).not.toHaveTextContent("P4");
    expect(chipRow).toContainElement(hashtagChip);
  });

  it("renders due date row above metadata chips", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const task = makeTask({
      id: "due-before-chip-task",
      author,
      status: "open",
      content: "Task with due date and chips #general",
      tags: ["general"],
      priority: 80,
      dueDate: new Date("2026-02-18T10:00:00.000Z"),
      dueTime: "10:00",
    });

    render(
      <KanbanView
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={author}
        depthMode="leaves"
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
      status: "open",
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
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={author}
        depthMode="leaves"
      />
    );

    expect(screen.queryByText("spec.pdf")).not.toBeInTheDocument();
  });

  it("hides tag chips in compact mode while keeping due date and priority", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const task = makeTask({
      id: "compact-kanban-task",
      author,
      status: "open",
      content: "Compact kanban task #general",
      tags: ["general"],
      priority: 80,
      dueDate: new Date("2026-02-18T10:00:00.000Z"),
      dueTime: "10:00",
    });

    usePreferencesStore.setState({ compactTaskCardsEnabled: true });
    render(
      <KanbanView
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={author}
        depthMode="leaves"
      />
    );

    expect(screen.getByRole("combobox", { name: /priority/i })).toBeInTheDocument();
    expect(screen.getByTestId("kanban-due-row-compact-kanban-task")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /filter to #general/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("kanban-chip-row-compact-kanban-task")).not.toBeInTheDocument();
  });

  // Interaction

  it("focuses branch tasks on click", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const parent = makeTask({ id: "parent-task", author, status: "open", content: "Parent task #general" });
    const child = makeTask({
      id: "child-task",
      author,
      status: "open",
      content: "Child task #general",
      parentId: "parent-task",
    });

    render(
      <KanbanView
        focusedTaskId={null}
        tasks={[parent, child]}
        allTasks={[parent, child]}
        currentUser={author}
        depthMode="all"
      />
    );

    fireEvent.click(document.querySelector('[data-task-id="parent-task"]')!);
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "parent-task" });
  });

  it("does not focus leaf tasks on click", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const leaf = makeTask({ id: "leaf-task", author, status: "open", content: "Leaf task #general" });

    render(
      <KanbanView
        focusedTaskId={null}
        tasks={[leaf]}
        allTasks={[leaf]}
        currentUser={author}
        depthMode="leaves"
      />
    );

    fireEvent.click(document.querySelector('[data-task-id="leaf-task"]')!);
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "leaf-task" });
  });

  it("optimistically moves card to destination column on drop", () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: false });
    const task = makeTask({ id: "drag-task", author, status: "open", content: "Drag me #general" });
    const { container } = render(
      <KanbanView
        focusedTaskId={null}
        tasks={[task]}
        allTasks={[task]}
        currentUser={author}
        depthMode="leaves"
      />
    );

    expect(container.querySelector('[data-droppable-id="open"] [data-draggable-id="drag-task"]')).toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="done"] [data-draggable-id="drag-task"]')).not.toBeInTheDocument();

    act(() => {
      dndMockState.onDragEnd?.({
        draggableId: "drag-task",
        source: { droppableId: "open", index: 0 },
        destination: { droppableId: "done", index: 0 },
      });
    });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",
      taskId: "drag-task",
      status: { type: "done" },
    });
    expect(container.querySelector('[data-droppable-id="done"] [data-draggable-id="drag-task"]')).toBeInTheDocument();
    expect(container.querySelector('[data-droppable-id="open"] [data-draggable-id="drag-task"]')).not.toBeInTheDocument();
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
      const task = makeTask({ id: "edge-scroll-task", author, status: "open", content: "Task #general" });

      const { container } = render(
        <KanbanView tasks={[task]} allTasks={[task]} currentUser={author} focusedTaskId={null} depthMode="leaves" />
      );

      const board = container.querySelector('[data-onboarding="kanban-board"]') as HTMLElement;
      vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
        left: 0, right: 800, top: 0, bottom: 600, width: 800, height: 600, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      act(() => { dndMockState.onDragStart?.(); });
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
});
