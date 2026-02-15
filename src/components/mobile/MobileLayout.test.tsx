import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileLayout } from "./MobileLayout";
import type { Channel, Person, Relay, Task } from "@/types";

vi.mock("./MobileNav", () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
}));

vi.mock("./SwipeIndicator", () => ({
  SwipeIndicator: () => <div data-testid="swipe-indicator" />,
}));

vi.mock("@/components/tasks/TaskTree", () => ({
  TaskTree: () => <div data-testid="task-tree" />,
}));

vi.mock("@/components/tasks/FeedView", () => ({
  FeedView: () => <div data-testid="feed-view" />,
}));

vi.mock("@/components/tasks/CalendarView", () => ({
  CalendarView: () => <div data-testid="calendar-view" />,
}));

const relays: Relay[] = [{ id: "demo", name: "Demo", icon: "D", isActive: true }];
const channels: Channel[] = [{ id: "general", name: "general", filterState: "neutral" }];
const people: Person[] = [
  { id: "me", name: "Me", displayName: "Me", avatar: "", isOnline: true, isSelected: false },
];
const tasks: Task[] = [];

describe("MobileLayout auth wiring", () => {
  it("uses auth state (not current user) to gate compose", () => {
    const onSignInClick = vi.fn();

    render(
      <MobileLayout
        relays={relays}
        channels={channels}
        people={people}
        tasks={tasks}
        allTasks={tasks}
        searchQuery=""
        focusedTaskId={null}
        currentUser={people[0]}
        isSignedIn={false}
        currentView="tree"
        onViewChange={() => {}}
        onSearchChange={() => {}}
        onNewTask={() => {}}
        onToggleComplete={() => {}}
        onStatusChange={() => {}}
        onFocusTask={() => {}}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        onAddRelay={() => {}}
        onRemoveRelay={() => {}}
        onSignInClick={onSignInClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /compose/i }));

    expect(onSignInClick).toHaveBeenCalledTimes(1);
  });
});
