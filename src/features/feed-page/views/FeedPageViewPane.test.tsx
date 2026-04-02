import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makePerson, makeTask } from "@/test/fixtures";
import { FeedSurfaceProvider } from "./feed-surface-context";
import { FeedTaskViewModelProvider, type FeedTaskViewModel } from "./feed-task-view-model-context";
import { FeedPageViewPane } from "./FeedPageViewPane";

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
        relays: [{ id: "demo", name: "Demo", icon: "D", isActive: true, connectionStatus: "connected" }],
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
      <FeedTaskViewModelProvider value={value}>
        <FeedPageViewPane currentView={currentView} kanbanDepthMode="leaves" loadingLabel="Loading view" />
      </FeedTaskViewModelProvider>
    </FeedSurfaceProvider>
  );
}

describe("FeedPageViewPane overlay", () => {
  it("renders the shared overlay above an empty tree surface", () => {
    renderPane("tree", {
      tasks: [],
      allTasks: [],
    });

    expect(screen.getByTestId("tree-view")).toBeInTheDocument();
    expect(document.querySelector('[data-empty-mode="overlay"]')).toBeInTheDocument();
  });

  it("renders the same shared overlay for kanban without view-specific gating", async () => {
    renderPane("kanban", {
      tasks: [],
      allTasks: [],
    });

    await waitFor(() => expect(screen.getByTestId("kanban-view")).toBeInTheDocument());
    expect(document.querySelector('[data-empty-mode="overlay"]')).toBeInTheDocument();
  });

  it("does not render the shared overlay when scoped tasks are present", async () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: true });
    const task = makeTask({
      id: "pane-task",
      author,
      content: "Pane task #general",
      status: "todo",
    });

    renderPane("list", {
      tasks: [task],
      allTasks: [task],
    });

    await waitFor(() => expect(screen.getByTestId("list-view")).toBeInTheDocument());
    expect(document.querySelector('[data-empty-mode="overlay"]')).not.toBeInTheDocument();
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
    expect(document.querySelector('[data-empty-mode="overlay"]')).toBeInTheDocument();
  });

  it("does not show the shared overlay for a focused leaf task in timeline view", async () => {
    const author = makePerson({ id: "me", name: "me", displayName: "Me", isOnline: true });
    const leaf = makeTask({
      id: "focused-feed-leaf",
      author,
      content: "Focused feed leaf #general",
      status: "todo",
    });

    renderPane("feed", {
      tasks: [leaf],
      allTasks: [leaf],
      focusedTaskId: "focused-feed-leaf",
    });

    await waitFor(() => expect(screen.getByTestId("feed-view")).toBeInTheDocument());
    expect(document.querySelector('[data-empty-mode="overlay"]')).not.toBeInTheDocument();
  });
});
