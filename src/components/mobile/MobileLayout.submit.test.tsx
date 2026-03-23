import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileLayout } from "./MobileLayout";
import type { Channel, Person, Relay, Task, TaskCreateResult } from "@/types";
import type { NDKContextValue } from "@/infrastructure/nostr/ndk-context";
import { makeChannel, makePerson, makeRelay } from "@/test/fixtures";
import {
  FeedTaskViewModelProvider,
  type FeedTaskViewModel,
} from "@/features/feed-page/views/feed-task-view-model-context";
import { FeedTaskCommandProvider } from "@/features/feed-page/views/feed-task-command-context";

const successResult: TaskCreateResult = { ok: true, mode: "local" };

const ndkMock: Pick<
  NDKContextValue,
  "user" | "needsProfileSetup" | "authMethod" | "logout" | "getGuestPrivateKey" | "updateUserProfile" | "isProfileSyncing"
> = {
  user: null,
  needsProfileSetup: false,
  authMethod: "guest",
  logout: vi.fn(),
  getGuestPrivateKey: () => "f".repeat(64),
  updateUserProfile: vi.fn(async () => true),
  isProfileSyncing: false,
};

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
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
    const taskViewModel: FeedTaskViewModel = {
      tasks,
      allTasks: tasks,
      relays,
      channels,
      composeChannels: channels,
      people,
      currentUser: people[0],
      searchQuery: "",
      focusedTaskId: "parent-123",
    };

    render(
      <FeedTaskCommandProvider value={{ onNewTask }}>
        <FeedTaskViewModelProvider value={taskViewModel}>
          <MobileLayout
            viewState={{
              relays,
              channels,
              people,
              canCreateContent: true,
              currentView: "feed",
            }}
            actions={{}}
          />
        </FeedTaskViewModelProvider>
      </FeedTaskCommandProvider>
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
