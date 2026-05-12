import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanView } from "./KanbanView";
import { makePerson, makeTask } from "@/test/fixtures";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";

const dndMockState: {
  onDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null;
  onDragStart: ((event: { active: { id: string } }) => void) | null;
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

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
      onDragStart,
    }: {
      children: ReactNode;
      onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
      onDragStart?: (event: { active: { id: string } }) => void;
    }) => {
      dndMockState.onDragEnd = onDragEnd ?? null;
      dndMockState.onDragStart = onDragStart ?? null;
      return <div>{children}</div>;
    },
    DragOverlay: ({ children }: { children: ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
    useDroppable: ({ id }: { id: string }) => ({
      setNodeRef: (el: HTMLElement | null) => {
        if (el) el.setAttribute("data-droppable-id", String(id));
      },
      isOver: false,
    }),
    useDraggable: ({ id }: { id: string; disabled?: boolean }) => ({
      setNodeRef: (el: HTMLElement | null) => {
        if (el) el.setAttribute("data-draggable-id", String(id));
      },
      listeners: {},
      attributes: {},
      isDragging: false,
    }),
    useSensor: vi.fn().mockReturnValue({}),
    useSensors: vi.fn().mockReturnValue([]),
    PointerSensor: class {},
    TouchSensor: class {},
    pointerWithin: vi.fn(),
  };
});

const author = makePerson({ pubkey: "me", name: "me", displayName: "Me" });

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
  usePreferencesStore.setState({ compactTaskCardsEnabled: false });
});

describe("KanbanView", () => {
  // Column structure

  it("renders a closed column to the right of done", () => {
    const todoTask = makeTask({ id: "todo-task", author, state: {
      type: "open"
    }, content: "Todo task #general" });
    const doneTask = makeTask({ id: "done-task", author, state: {
      type: "done"
    }, content: "Done task #general" });
    const closedTask = makeTask({ id: "closed-task", author, state: {
      type: "closed"
    }, content: "Closed task #general" });

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
    const olderHighPriority = makeTask({
      id: "older-high-priority",
      author,
      state: {
        type: "open"
      },
      content: "Older high priority task #general",
      priority: 80,
      timestamp: new Date("2026-02-17T08:00:00.000Z"),
      lastEditedAt: new Date("2026-02-17T08:00:00.000Z"),
    });
    const newerNoPriority = makeTask({
      id: "newer-no-priority",
      author,
      state: {
        type: "open"
      },
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
    const blockedTask = makeTask({
      id: "blocked-task",
      author,
      state: { type: "active", description: "Blocked" },
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
    const prioritizedTask = makeTask({
      id: "priority-task",
      author,
      state: {
        type: "open"
      },
      content: "Prioritized task #general",
      priority: 80,
    });
    const nonPrioritizedTask = makeTask({
      id: "no-priority-task",
      author,
      state: {
        type: "open"
      },
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
    const task = makeTask({
      id: "priority-and-tag-task",
      author,
      state: {
        type: "open"
      },
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

  it("does not render attachment previews in kanban cards", () => {
    const task = makeTask({
      id: "attachment-task",
      author,
      state: {
        type: "open"
      },
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

  // Interaction

  it("focuses branch tasks on click", () => {
    const parent = makeTask({ id: "parent-task", author, state: {
      type: "open"
    }, content: "Parent task #general" });
    const child = makeTask({
      id: "child-task",
      author,
      state: {
        type: "open"
      },
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

  it("focuses leaf tasks and jumps to the feed view on click", () => {
    const leaf = makeTask({ id: "leaf-task", author, state: {
      type: "open"
    }, content: "Leaf task #general" });

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
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "leaf-task", view: "feed" });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ui.view.change" }));
  });

  it("jumps to the feed when clicking a parent whose subtasks are all terminal", () => {
    const parent = makeTask({ id: "parent-done", author, state: {
      type: "open"
    }, content: "Parent done #general" });
    const doneChild = makeTask({
      id: "done-child",
      author,
      state: {
        type: "done"
      },
      content: "Done child #general",
      parentId: "parent-done",
    });
    const closedChild = makeTask({
      id: "closed-child",
      author,
      state: {
        type: "closed"
      },
      content: "Closed child #general",
      parentId: "parent-done",
    });

    render(
      <KanbanView
        focusedTaskId={null}
        tasks={[parent, doneChild, closedChild]}
        allTasks={[parent, doneChild, closedChild]}
        currentUser={author}
        depthMode="all"
      />
    );

    fireEvent.click(document.querySelector('[data-task-id="parent-done"]')!);
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "parent-done", view: "feed" });
  });

  it("does not switch view when clicking a branch task", () => {
    const parent = makeTask({ id: "parent-task", author, state: {
      type: "open"
    }, content: "Parent task #general" });
    const child = makeTask({
      id: "child-task",
      author,
      state: {
        type: "open"
      },
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
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "parent-task", view: undefined });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ui.view.change" }));
  });

  it("bolds the first line of projects with non-terminal subtasks", () => {
    const activeProject = makeTask({ id: "active-project", author, state: {
      type: "open"
    }, content: "Active project #general" });
    const activeChild = makeTask({
      id: "active-child",
      author,
      state: {
        type: "open"
      },
      content: "Active child #general",
      parentId: "active-project",
    });
    const doneProject = makeTask({ id: "done-project", author, state: {
      type: "open"
    }, content: "Done project #general" });
    const doneChild = makeTask({
      id: "done-child",
      author,
      state: {
        type: "done"
      },
      content: "Done child #general",
      parentId: "done-project",
    });
    const leaf = makeTask({ id: "leaf-task", author, state: {
      type: "open"
    }, content: "Leaf task #general" });

    render(
      <KanbanView
        focusedTaskId={null}
        tasks={[activeProject, activeChild, doneProject, doneChild, leaf]}
        allTasks={[activeProject, activeChild, doneProject, doneChild, leaf]}
        currentUser={author}
        depthMode="all"
      />
    );

    const findBold = (taskId: string) =>
      document.querySelector(`[data-task-id="${taskId}"] .font-bold`);
    expect(findBold("active-project")).not.toBeNull();
    expect(findBold("done-project")).toBeNull();
    expect(findBold("leaf-task")).toBeNull();
  });

  it("renders subtask counts as open/active/done, omitting active when zero", () => {
    const parent = makeTask({ id: "parent", author, state: {
      type: "open"
    }, content: "Parent #general" });
    const open1 = makeTask({ id: "o1", author, state: {
      type: "open"
    }, parentId: "parent", content: "o1 #general" });
    const open2 = makeTask({ id: "o2", author, state: {
      type: "open"
    }, parentId: "parent", content: "o2 #general" });
    const active1 = makeTask({ id: "a1", author, state: {
      type: "active"
    }, parentId: "parent", content: "a1 #general" });
    const done1 = makeTask({ id: "d1", author, state: {
      type: "done"
    }, parentId: "parent", content: "d1 #general" });
    const done2 = makeTask({ id: "d2", author, state: {
      type: "done"
    }, parentId: "parent", content: "d2 #general" });
    const done3 = makeTask({ id: "d3", author, state: {
      type: "done"
    }, parentId: "parent", content: "d3 #general" });

    const restingParent = makeTask({ id: "resting", author, state: {
      type: "open"
    }, content: "Resting #general" });
    const restingOpen = makeTask({ id: "ro1", author, state: {
      type: "open"
    }, parentId: "resting", content: "ro1 #general" });
    const restingDone = makeTask({ id: "rd1", author, state: {
      type: "done"
    }, parentId: "resting", content: "rd1 #general" });

    const leaf = makeTask({ id: "leaf", author, state: {
      type: "open"
    }, content: "Leaf #general" });

    render(
      <KanbanView
        focusedTaskId={null}
        tasks={[parent, open1, open2, active1, done1, done2, done3, restingParent, restingOpen, restingDone, leaf]}
        allTasks={[parent, open1, open2, active1, done1, done2, done3, restingParent, restingOpen, restingDone, leaf]}
        currentUser={author}
        depthMode="all"
      />
    );

    const parentCard = document.querySelector('[data-task-id="parent"]')!;
    expect(parentCard.textContent).toContain("2/1/3");

    const restingCard = document.querySelector('[data-task-id="resting"]')!;
    expect(restingCard.textContent).toContain("1/1");
    expect(restingCard.textContent).not.toContain("1/0/1");

    const leafCard = document.querySelector('[data-task-id="leaf"]')!;
    expect(leafCard.textContent).not.toMatch(/\d\/\d/);
  });

  it("optimistically moves card to destination column on drop", () => {
    const task = makeTask({ id: "drag-task", author, state: {
      type: "open"
    }, content: "Drag me #general" });
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
        active: { id: "drag-task" },
        over: { id: "done" },
      });
    });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",      taskId: "drag-task",
      state: { type: "done" },
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
      const task = makeTask({ id: "edge-scroll-task", author, state: {
        type: "open"
      }, content: "Task #general" });

      const { container } = render(
        <KanbanView tasks={[task]} allTasks={[task]} currentUser={author} focusedTaskId={null} depthMode="leaves" />
      );

      const board = container.querySelector('[data-onboarding="kanban-board"]') as HTMLElement;
      vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
        left: 0, right: 800, top: 0, bottom: 600, width: 800, height: 600, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      act(() => { dndMockState.onDragStart?.({ active: { id: "edge-scroll-task" } }); });
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
