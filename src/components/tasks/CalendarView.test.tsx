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
  it("renders core navigation and search controls", () => {
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
    expect(screen.getByPlaceholderText(/search tasks/i)).toBeInTheDocument();
  });
});
