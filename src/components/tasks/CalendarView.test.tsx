import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarView } from "./CalendarView";
import type { Channel, Person, Relay, Task } from "@/types";

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" } }),
}));

const relays: Relay[] = [
  {
    id: "demo",
    name: "Demo",
    icon: "R",
    isActive: true,
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
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
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
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
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
        onSearchChange={vi.fn()}
        onNewTask={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /previous month/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next month/i })).toBeInTheDocument();
  });
});
