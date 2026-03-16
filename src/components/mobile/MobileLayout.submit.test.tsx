import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileLayout } from "./MobileLayout";
import type { Channel, Person, Relay, Task, TaskCreateResult } from "@/types";
import { makeChannel, makePerson, makeRelay } from "@/test/fixtures";

const successResult: TaskCreateResult = { ok: true, mode: "local" };

const ndkMock = {
  user: null,
  needsProfileSetup: false,
  authMethod: "guest",
  logout: vi.fn(),
  getGuestPrivateKey: () => "f".repeat(64),
  updateUserProfile: vi.fn(async () => true),
  isProfileSyncing: false,
};

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ndkMock,
}));

vi.mock("./MobileNav", () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
}));

vi.mock("./SwipeIndicator", () => ({
  SwipeIndicator: () => <div data-testid="swipe-indicator" />,
}));

vi.mock("./UnifiedBottomBar", () => ({
  UnifiedBottomBar: ({ onSubmit }: { onSubmit: (...args: unknown[]) => Promise<unknown> | unknown }) => (
    <button
      onClick={() =>
        onSubmit(
          "Ship #general",
          ["general"],
          ["demo-relay"],
          "task",
          undefined,
          undefined,
          "due",
          ["a".repeat(64)]
        )
      }
    >
      Submit
    </button>
  ),
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

const relays: Relay[] = [makeRelay({ id: "demo-relay" })];
const channels: Channel[] = [makeChannel()];
const people: Person[] = [makePerson({ id: "me", name: "Me", displayName: "Me" })];
const tasks: Task[] = [];

describe("MobileLayout submit wiring", () => {
  it("forwards explicit mention pubkeys in the correct onNewTask argument slot", () => {
    const onNewTask = vi.fn(async () => successResult);

    render(
      <MobileLayout
        relays={relays}
        channels={channels}
        people={people}
        tasks={tasks}
        allTasks={tasks}
        searchQuery=""
        focusedTaskId="parent-123"
        currentUser={people[0]}
        isSignedIn={true}
        currentView="feed"
        onViewChange={() => {}}
        onSearchChange={() => {}}
        onNewTask={onNewTask}
        onToggleComplete={() => {}}
        onStatusChange={() => {}}
        onFocusTask={() => {}}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        onAddRelay={() => {}}
        onRemoveRelay={() => {}}
        onSignInClick={() => {}}
        onGuideClick={() => {}}
        onHashtagClick={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onNewTask).toHaveBeenCalledWith(
      "Ship #general",
      ["general"],
      ["demo-relay"],
      "task",
      undefined,
      undefined,
      "due",
      "parent-123",
      undefined,
      ["a".repeat(64)],
      undefined,
      undefined,
      undefined,
      undefined
    );
  });
});
