import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarView } from "./CalendarView";
import type { Channel, Person, Relay, Task } from "@/types";

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
  it("uses a stacked desktop layout on smaller widths and side panel on xl", () => {
    const { container } = render(
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

    const layout = container.querySelector("div.flex-1.flex.overflow-hidden");
    expect(layout?.className).toContain("xl:flex-row");

    const addEventButton = screen.getByRole("button", { name: /add event/i });
    const panel = addEventButton.closest("div[class*='overflow-y-auto']");
    expect(panel?.className).toContain("xl:w-80");
  });
});
