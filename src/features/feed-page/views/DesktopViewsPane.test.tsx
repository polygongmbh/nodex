import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makePerson, makeTask } from "@/test/fixtures";
import { FeedSurfaceProvider } from "./feed-surface-context";
import { FeedTaskViewModelProvider, type FeedTaskViewModel } from "./feed-task-view-model-context";
import { FeedViewStateProvider } from "./feed-view-state-context";
import { DesktopViewsPane } from "./DesktopViewsPane";

vi.mock("@/components/tasks/TaskTree", () => ({
  TaskTree: () => <div data-testid="tree-view" />,
}));

vi.mock("@/components/tasks/TaskViewStatusRow", () => ({
  TaskViewStatusRow: () => <div data-testid="status-row" />,
}));

vi.mock("@/components/tasks/FeedView", () => ({
  FeedView: () => <div data-testid="feed-view" />,
}));

vi.mock("@/components/tasks/KanbanView", () => ({
  KanbanView: () => <div data-testid="kanban-view" />,
}));

vi.mock("@/components/tasks/CalendarView", () => ({
  CalendarView: () => <div data-testid="calendar-view" />,
}));

vi.mock("@/components/tasks/ListView", () => ({
  ListView: () => <div data-testid="list-view" />,
}));

function renderPane(currentView: "feed" | "tree" | "kanban" | "calendar" | "list", value: FeedTaskViewModel) {
  return render(
    <FeedSurfaceProvider
      value={{
        relays: [{ id: "demo", name: "Demo", isActive: true, connectionStatus: "connected", url: "wss://demo.test" }],
        channels: [],
        composeChannels: [],
        people: [],
        mentionablePeople: [],
        searchQuery: "",
        quickFilters: {
          recentEnabled: false,
          recentDays: 7,
          priorityEnabled: false,
          minPriority: 0,
        },
        channelMatchMode: "and",
      }}
    >
      <FeedViewStateProvider
        value={{
          currentView,
          kanbanDepthMode: "leaves",
          isSidebarFocused: false,
          isOnboardingOpen: false,
          activeOnboardingStepId: null,
          isManageRouteActive: false,
          canCreateContent: true,
          profileCompletionPromptSignal: 0,
          failedPublishDrafts: [],
          visibleFailedPublishDrafts: [],
          selectedPublishableRelayIds: [],
          desktopSwipeHandlers: {},
        }}
      >
        <FeedTaskViewModelProvider value={value}>
          <DesktopViewsPane />
        </FeedTaskViewModelProvider>
      </FeedViewStateProvider>
    </FeedSurfaceProvider>
  );
}

describe("DesktopViewsPane overlay", () => {
  it("renders the shared overlay above an empty tree surface", () => {
    renderPane("tree", {
      tasks: [],
      allTasks: [],
      focusedTaskId: null,
    });

    expect(screen.getByTestId("tree-view")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders the same shared overlay for kanban without view-specific gating", async () => {
    renderPane("kanban", {
      tasks: [],
      allTasks: [],
      focusedTaskId: null,
    });

    await waitFor(() => expect(screen.getByTestId("kanban-view")).toBeInTheDocument());
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not render the shared overlay when scoped tasks are present", async () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: true });
    const task = makeTask({
      id: "pane-task",
      author,
      content: "Pane task #general",
      status: "todo",
    });

    const { container } = renderPane("list", {
      tasks: [task],
      allTasks: [task],
      focusedTaskId: null,
    });

    await waitFor(() => expect(screen.getByTestId("list-view")).toBeInTheDocument());
    expect(container.querySelector('[role="status"]')).not.toBeInTheDocument();
  });

  it("shows the shared overlay for a focused leaf task in table view", async () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: true });
    const leaf = makeTask({
      id: "focused-leaf",
      author,
      content: "Focused leaf #general",
      status: "todo",
    });

    renderPane("list", {
      tasks: [leaf],
      allTasks: [leaf],
      focusedTaskId: "focused-leaf",
    });

    await waitFor(() => expect(screen.getByTestId("list-view")).toBeInTheDocument());
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not show the shared overlay for a focused leaf task in timeline view", async () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: true });
    const leaf = makeTask({
      id: "focused-feed-leaf",
      author,
      content: "Focused feed leaf #general",
      status: "todo",
    });

    const { container } = renderPane("feed", {
      tasks: [leaf],
      allTasks: [leaf],
      focusedTaskId: "focused-feed-leaf",
    });

    await waitFor(() => expect(screen.getByTestId("feed-view")).toBeInTheDocument());
    expect(container.querySelector('[role="status"]')).not.toBeInTheDocument();
  });
});
