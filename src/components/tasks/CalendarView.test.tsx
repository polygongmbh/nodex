import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarView } from "./CalendarView";
import type { Channel, Relay, Post, TaskPost } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import type { Person } from "@/types/person";
import { makePerson, makeTask } from "@/test/fixtures";

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
    isActive: true,
    url: "wss://demo.test",
  },
];

const channels: Channel[] = [
  { id: "general", name: "general", filterState: "neutral" },
];

const people: Person[] = [
  makePerson({
    pubkey: "me",
    name: "me",
    displayName: "Me",
  }),
];

const tasks: Post[] = [];

describe("CalendarView responsiveness", () => {
  it("shows both Create Task and Create Event buttons on the selected-day panel", () => {
    render(
      <CalendarView posts={tasks} selectedDate={new Date("2026-02-18T10:00:00.000Z")} focusedTaskId={null} />
    );

    expect(screen.getByTestId("calendar-create-task")).toBeInTheDocument();
    expect(screen.getByTestId("calendar-create-event")).toBeInTheDocument();
  });

  it("focuses ancestor from day-card breadcrumb without selecting current card task", () => {
    dispatchFeedInteraction.mockClear();
    const root: TaskPost = {
      id: "root",
      kind: NostrEventKind.Task,
      pubkey: people[0].pubkey,
      content: "Root task #general",
      tags: ["general"],
      relays: ["demo"],

      timestamp: new Date("2026-02-17T09:00:00.000Z"),
      lastEditedAt: new Date("2026-02-17T09:00:00.000Z"),
      stateUpdates: [],
      dates: [{ datetime: new Date("2026-02-18T10:00:00.000Z"), type: "due" }],
      assigneePubkeys: [],
    };
    const child: TaskPost = {
      ...root,
      id: "child",
      content: "Child task #general",
      parentId: "root",
      timestamp: new Date("2026-02-17T10:00:00.000Z"),
    };
    render(
      <CalendarView posts={[root, child]} selectedDate={new Date("2026-02-18T10:00:00.000Z")} focusedTaskId={null} />
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp("\\broot\\b", "i") }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "root" });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "child" });
  }, 10000);

  it("shows week numbers and stacked month sections on desktop", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T10:00:00.000Z"));

    render(
      <CalendarView posts={tasks} focusedTaskId={null} />
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
      <CalendarView posts={tasks} focusedTaskId={null} />
    );

    expect(screen.getByRole("heading", { name: /january 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /february 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /march 2026/i })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("draws a multi-day task as one bar per week row instead of a chip per day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T10:00:00.000Z"));
    // Thu Feb 19 → Tue Feb 24 crosses one week boundary: two week rows.
    const trip = makeTask({
      id: "trip",
      author: people[0],
      content: "Conference trip #general",
      dates: [
        { date: "2026-02-19", type: "start" },
        { date: "2026-02-24", type: "end" },
      ],
    });
    const single = makeTask({
      id: "single",
      author: people[0],
      content: "Dentist visit #general",
      dueDate: new Date("2026-02-20T10:00:00.000Z"),
    });

    render(
      <CalendarView posts={[trip, single]} selectedDate={new Date("2026-03-20T00:00:00.000Z")} focusedTaskId={null} />
    );

    expect(screen.getAllByText(/Conference trip/)).toHaveLength(2);
    expect(screen.getAllByText(/Dentist visit/)).toHaveLength(1);

    vi.useRealTimers();
  });

  it("lists a multi-day task in the selected-day panel on a middle day", () => {
    const trip = makeTask({
      id: "trip",
      author: people[0],
      content: "Conference trip #general",
      dates: [
        { date: "2026-02-19", type: "start" },
        { date: "2026-02-24", type: "end" },
      ],
    });

    const { container } = render(
      <CalendarView posts={[trip]} selectedDate={new Date(2026, 1, 21)} focusedTaskId={null} />
    );

    expect(container.querySelector('[data-task-id="trip"]')).toBeInTheDocument();
  });

  it("focuses a multi-day project from its bar", () => {
    dispatchFeedInteraction.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T10:00:00.000Z"));
    const project = makeTask({
      id: "launch",
      author: people[0],
      content: "Launch week #general",
      dates: [
        { date: "2026-02-16", type: "start" },
        { date: "2026-02-18", type: "end" },
      ],
    });
    const subtask = makeTask({ id: "launch-sub", author: people[0], content: "Prep #general", parentId: "launch" });

    render(
      <CalendarView posts={[project, subtask]} selectedDate={new Date(2026, 2, 20)} focusedTaskId={null} />
    );

    fireEvent.click(screen.getByText("Launch week #general"));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "launch" });
    vi.useRealTimers();
  });

  it("renders core month navigation controls", () => {
    render(
      <CalendarView posts={tasks} focusedTaskId={null} />
    );

    expect(screen.getByRole("button", { name: /previous month/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next month/i })).toBeInTheDocument();
  }, 10000);

  it("hides closed scheduled tasks from the selected day panel", () => {
    const openTask = makeTask({
      id: "open-calendar-task",
      author: people[0],
      content: "Open calendar task #general",
      state: {
        status: "open"
      },
      dueDate: new Date("2026-02-18T10:00:00.000Z"),
    });
    const doneTask = makeTask({
      id: "done-calendar-task",
      author: people[0],
      content: "Done calendar task #general",
      state: {
        status: "done"
      },
      dueDate: new Date("2026-02-18T11:00:00.000Z"),
    });
    const closedTask = makeTask({
      id: "closed-calendar-task",
      author: people[0],
      content: "Closed calendar task #general",
      state: {
        status: "closed"
      },
      dueDate: new Date("2026-02-18T12:00:00.000Z"),
    });

    const { container } = render(
      <CalendarView
        posts={[openTask, doneTask, closedTask]}
        focusedTaskId={null}
        selectedDate={new Date("2026-02-18T00:00:00.000Z")} />
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
      state: {
        status: "open"
      },
      dueDate: new Date("2026-02-18T12:00:00.000Z"),
      priority: 80,
    });

    render(
      <CalendarView posts={[task]} selectedDate={new Date("2026-02-18T00:00:00.000Z")} focusedTaskId={null} />
    );

    const chipRow = screen.getByTestId("calendar-chip-row-calendar-priority-task");
    expect(chipRow).toHaveTextContent("P4");
    expect(screen.getAllByRole("button", { name: "#general" }).length).toBeGreaterThan(0);
  });

  it("focuses branch tasks from selected-day cards", () => {
    dispatchFeedInteraction.mockClear();
    const parent = makeTask({
      id: "calendar-parent",
      author: people[0],
      content: "Calendar parent #general",
      state: {
        status: "open"
      },
      dueDate: new Date("2026-02-18T10:00:00.000Z"),
    });
    const child = makeTask({
      id: "calendar-child",
      author: people[0],
      content: "Calendar child #general",
      state: {
        status: "open"
      },
      dueDate: new Date("2026-02-18T11:00:00.000Z"),
      parentId: "calendar-parent",
    });

    const { container } = render(
      <CalendarView
        posts={[parent, child]}
        focusedTaskId={null}
        selectedDate={new Date("2026-02-18T00:00:00.000Z")} />
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
      state: {
        status: "open"
      },
      dueDate: new Date("2026-02-18T10:00:00.000Z"),
    });

    const { container } = render(
      <CalendarView posts={[leaf]} selectedDate={new Date("2026-02-18T00:00:00.000Z")} focusedTaskId={null} />
    );

    const leafCard = container.querySelector('[data-task-id="calendar-leaf"]');
    expect(leafCard).toBeInTheDocument();
    fireEvent.click(leafCard!);

    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "calendar-leaf" });
  });
});
