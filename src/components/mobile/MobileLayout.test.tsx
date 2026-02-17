import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileLayout } from "./MobileLayout";
import type { Channel, Person, Relay, Task } from "@/types";
import { makeChannel, makePerson, makeRelay } from "@/test/fixtures";

const ndkMock = {
  user: null as null | {
    pubkey: string;
    npub: string;
    profile?: { displayName?: string; name?: string };
  },
  needsProfileSetup: false,
  authMethod: "guest",
  logout: vi.fn(),
  getGuestPrivateKey: () => "f".repeat(64),
  updateUserProfile: vi.fn(async () => true),
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

vi.mock("@/components/tasks/TaskTree", () => ({
  TaskTree: () => <div data-testid="task-tree" />,
}));

vi.mock("@/components/tasks/FeedView", () => ({
  FeedView: () => <div data-testid="feed-view" />,
}));

vi.mock("@/components/tasks/CalendarView", () => ({
  CalendarView: () => <div data-testid="calendar-view" />,
}));

const relays: Relay[] = [makeRelay()];
const channels: Channel[] = [makeChannel()];
const people: Person[] = [makePerson({ id: "me", name: "Me", displayName: "Me" })];
const tasks: Task[] = [];

describe("MobileLayout auth wiring", () => {
  it("uses auth state (not current user) to gate compose", () => {
    ndkMock.user = null;
    ndkMock.needsProfileSetup = false;
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
        onGuideClick={() => {}}
        onHashtagClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in to create/i }));

    expect(onSignInClick).toHaveBeenCalledTimes(1);
  });

  it("forces manage view and hides bottom bar when profile setup is required", () => {
    ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
    ndkMock.needsProfileSetup = true;

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
        isSignedIn={true}
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
        onSignInClick={() => {}}
        onGuideClick={() => {}}
        onHashtagClick={() => {}}
      />
    );

    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search or create task/i)).not.toBeInTheDocument();
  });
});
