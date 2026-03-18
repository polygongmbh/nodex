import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { KanbanView } from "./KanbanView";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";
import type { TaskCreateResult } from "@/types";

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" } }),
}));

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Droppable: ({
    children,
    droppableId,
  }: {
    children: (provided: { innerRef: () => void; droppableProps: Record<string, never> }, snapshot: { isDraggingOver: boolean }) => ReactNode;
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
        draggableProps: Record<string, never>;
        dragHandleProps: Record<string, never>;
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

describe("KanbanView closed column", () => {
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
        onSearchChange={vi.fn()}
        onNewTask={vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }))}
        onToggleComplete={vi.fn()}
        onStatusChange={vi.fn()}
      />
    );

    const headings = screen
      .getAllByText(/^(To Do|In Progress|Done|Closed)$/)
      .map((node) => node.textContent?.trim());
    expect(headings).toEqual(["To Do", "In Progress", "Done", "Closed"]);
    expect(
      screen.getByText((_, node) => node?.textContent === "Closed task #general")
    ).toBeInTheDocument();
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
        onSearchChange={vi.fn()}
        onNewTask={vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }))}
        onToggleComplete={vi.fn()}
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.getByText("P80")).toBeInTheDocument();
    expect(screen.queryByText("P40")).not.toBeInTheDocument();
  });

  it("renders priority and other chips in the same metadata row", () => {
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
        onSearchChange={vi.fn()}
        onNewTask={vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }))}
        onToggleComplete={vi.fn()}
        onStatusChange={vi.fn()}
      />
    );

    const chipRow = screen.getByTestId("kanban-chip-row-priority-and-tag-task");
    const hashtagChip = screen.getByRole("button", { name: /filter to #general/i });
    expect(chipRow).toHaveTextContent("P80");
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
        onSearchChange={vi.fn()}
        onNewTask={vi.fn(async (): Promise<TaskCreateResult> => ({ ok: true, mode: "local" }))}
        onToggleComplete={vi.fn()}
        onStatusChange={vi.fn()}
      />
    );

    const dueRow = screen.getByTestId("kanban-due-row-due-before-chip-task");
    const chipRow = screen.getByTestId("kanban-chip-row-due-before-chip-task");
    expect(dueRow.compareDocumentPosition(chipRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
