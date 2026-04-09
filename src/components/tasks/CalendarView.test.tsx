import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarView } from "./CalendarView";
import type { Channel, Relay, Task } from "@/types";
import type { Person } from "@/types/person";
import { makeTask } from "@/test/fixtures";

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" } }),
}));

const dispatchFeedInteraction = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

const relays: Relay[] = [
  {
    id: "demo",
    name: "Demo",
    icon: "R",
    isActive: true,
    url: "wss://demo.test",
  },
];

const channels: Channel[] = [
  { id: "general", name: "general", filterState: "neutral" },
];

const people: Person[] = [
  {
    id: "me",
    name: "me",
    displayName: "Me",
    isOnline: true,
    isSelected: false,
  },
];

const tasks: Task[] = [];

describe("CalendarView responsiveness", () => {
  it("focuses ancestor from day-card breadcrumb without selecting current card task", () => {
    dispatchFeedInteraction.mockClear();
    const root: Task = {
      id: "root",
      author: people[0],
      content: "Root task #general",
      tags: ["general"],
      relays: ["demo"],
      taskType: "task",
      timestamp: new Date("2026-02-17T09:00:00.000Z"),
      likes: 0,
      replies: 0,
      reposts: 0,
      status: "todo",
      dueDate: new Date("2026-02-18T10:00:00.000Z"),
    };
    const child: Task = {
      ...root,
      id: "child",
      content: "Child task #general",
      parentId: "root",
      timestamp: new Date("2026-02-17T10:00:00.000Z"),
    };
    render(
      <CalendarView
        tasks={[child]}
        allTasks={[root, child]}
        relays={relays}
        channels={channels}
        people={people}
        searchQuery=""
        isMobile
        mobileView="calendar"
        selectedDate={new Date("2026-02-18T10:00:00.000Z")}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /focus task: root/i }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "root" });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "child" });
  }, 10000);

  it("shows week numbers and stacked month sections on desktop", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T10:00:00.000Z"));

    render(
      <CalendarView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={people}
        searchQuery=""
      />
    );

    expect(screen.getAllByText("Wk").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /january 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /february 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /march 2026/i })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("renders stacked month sections on mobile calendar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T10:00:00.000Z"));

    render(
      <CalendarView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={people}
        searchQuery=""
        isMobile
        mobileView="calendar"
      />
    );

    expect(screen.getByRole("heading", { name: /january 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /february 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /march 2026/i })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("renders core month navigation controls", () => {
    render(
      <CalendarView
        tasks={tasks}
        allTasks={tasks}
        relays={relays}
        channels={channels}
        people={people}
        searchQuery=""
      />
    );

    expect(screen.getByRole("button", { name: /previous month/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next month/i })).toBeInTheDocument();
  }, 10000);

  it("hides closed scheduled tasks from the selected day panel", () => {
    const openTask = makeTask({
      id: "open-calendar-task",
      author: people[0],
      content: "Open calendar task #general",
      status: "todo",
      dueDate: new Date("2026-02-18T10:00:00.000Z"),
    });
    const doneTask = makeTask({
      id: "done-calendar-task",
      author: people[0],
      content: "Done calendar task #general",
      status: "done",
      dueDate: new Date("2026-02-18T11:00:00.000Z"),
    });
    const closedTask = makeTask({
      id: "closed-calendar-task",
      author: people[0],
      content: "Closed calendar task #general",
      status: "closed",
      dueDate: new Date("2026-02-18T12:00:00.000Z"),
    });

    const { container } = render(
      <CalendarView
        tasks={[openTask, doneTask, closedTask]}
        allTasks={[openTask, doneTask, closedTask]}
        relays={relays}
        channels={channels}
        people={people}
        searchQuery=""
        selectedDate={new Date("2026-02-18T00:00:00.000Z")}
      />
    );

    expect(container.querySelector('[data-task-id="open-calendar-task"]')).toBeInTheDocument();
    expect(container.querySelector('[data-task-id="done-calendar-task"]')).toBeInTheDocument();
    expect(container.querySelector('[data-task-id="closed-calendar-task"]')).not.toBeInTheDocument();
  });

  it("shows priority chips in selected-day metadata row", () => {
    const task = makeTask({
      id: "calendar-priority-task",
      author: people[0],
      content: "Calendar priority task #general",
      tags: ["general"],
      status: "todo",
      dueDate: new Date("2026-02-18T12:00:00.000Z"),
      priority: 80,
    });

    render(
      <CalendarView
        tasks={[task]}
        allTasks={[task]}
        relays={relays}
        channels={channels}
        people={people}
        searchQuery=""
        selectedDate={new Date("2026-02-18T00:00:00.000Z")}
      />
    );

    const chipRow = screen.getByTestId("calendar-chip-row-calendar-priority-task");
    expect(chipRow).toHaveTextContent("P4");
    expect(screen.getByRole("button", { name: /filter to #general/i })).toBeInTheDocument();
  });

  it("focuses branch tasks from selected-day cards", () => {
    dispatchFeedInteraction.mockClear();
    const parent = makeTask({
      id: "calendar-parent",
      author: people[0],
      content: "Calendar parent #general",
      status: "todo",
      dueDate: new Date("2026-02-18T10:00:00.000Z"),
    });
    const child = makeTask({
      id: "calendar-child",
      author: people[0],
      content: "Calendar child #general",
      status: "todo",
      dueDate: new Date("2026-02-18T11:00:00.000Z"),
      parentId: "calendar-parent",
    });

    const { container } = render(
      <CalendarView
        tasks={[parent, child]}
        allTasks={[parent, child]}
        selectedDate={new Date("2026-02-18T00:00:00.000Z")}
      />
    );

    const parentCard = container.querySelector('[data-task-id="calendar-parent"]');
    expect(parentCard).toBeInTheDocument();
    fireEvent.click(parentCard!);

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "calendar-parent" });
  });

  it("does not focus leaf tasks from selected-day cards", () => {
    dispatchFeedInteraction.mockClear();
    const leaf = makeTask({
      id: "calendar-leaf",
      author: people[0],
      content: "Calendar leaf #general",
      status: "todo",
      dueDate: new Date("2026-02-18T10:00:00.000Z"),
    });

    const { container } = render(
      <CalendarView
        tasks={[leaf]}
        allTasks={[leaf]}
        selectedDate={new Date("2026-02-18T00:00:00.000Z")}
      />
    );

    const leafCard = container.querySelector('[data-task-id="calendar-leaf"]');
    expect(leafCard).toBeInTheDocument();
    fireEvent.click(leafCard!);

    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "calendar-leaf" });
  });
});
