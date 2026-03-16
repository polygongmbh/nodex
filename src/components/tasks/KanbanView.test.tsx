import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { KanbanView } from "./KanbanView";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";
import type { TaskCreateResult } from "@/types";

vi.mock("@/lib/nostr/ndk-context", () => ({
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
});
