import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makePerson, makeTask } from "@/test/fixtures";
import { FeedSurfaceProvider } from "./feed-surface-context";
import { FeedViewStateProvider } from "./feed-view-state-context";
import { DesktopViewsPane } from "./DesktopViewsPane";
import {
  ingestPost,
  __resetPostsStoreForTests,
} from "@/features/feed-page/stores/posts-store";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import type { Post } from "@/types";

vi.mock("@/components/tasks/TaskTree", () => ({
  TaskTree: () => <div data-testid="tree-view" />,
}));

const statusRowProps = vi.fn();
vi.mock("@/components/tasks/TaskViewStatusRow", () => ({
  TaskViewStatusRow: (props: Record<string, unknown>) => {
    statusRowProps(props);
    return <div data-testid="status-row" />;
  },
}));

vi.mock("@/components/tasks/FeedView", () => ({
  FeedView: () => <div data-testid="feed-view" />,
}));

vi.mock("@/components/tasks/home/HomeView", () => ({
  HomeView: () => <div data-testid="home-view" />,
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

afterEach(() => {
  __resetPostsStoreForTests();
  statusRowProps.mockClear();
});

function renderPane(
  currentView: ViewType,
  { allTasks, focusedTaskId }: { allTasks: Post[]; focusedTaskId: string | null }
) {
  for (const post of allTasks) {
    ingestPost({ post });
  }
  return render(
    <FeedSurfaceProvider
      value={{
        relays: [{ id: "demo", name: "Demo", isActive: true, connectionStatus: "connected", url: "wss://demo.test" }],
        channels: [],
        people: [],
        mentionablePeople: [],
        quickFilters: {
          recentEnabled: false,
          recentDays: 7,
          priorityEnabled: false,
          minPriority: 0,
        },
      }}
    >
      <FeedViewStateProvider
        value={{
          currentView,
          isSidebarFocused: false,
          isOnboardingOpen: false,
          activeOnboardingStepId: null,
          canCreateContent: true,
          profileCompletionPromptSignal: 0,
        }}
      >
        <DesktopViewsPane posts={allTasks} focusedTaskId={focusedTaskId} />
      </FeedViewStateProvider>
    </FeedSurfaceProvider>
  );
}

const author = makePerson({ pubkey: "me", name: "me", displayName: "Me" });

describe("DesktopViewsPane overlay", () => {
  it("renders the shared overlay above an empty tree surface", () => {
    renderPane("tree", {
      allTasks: [],
      focusedTaskId: null,
    });

    expect(screen.getByTestId("tree-view")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders the same shared overlay for kanban without view-specific gating", async () => {
    renderPane("kanban", {
      allTasks: [],
      focusedTaskId: null,
    });

    await waitFor(() => expect(screen.getByTestId("kanban-view")).toBeInTheDocument());
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not render the shared overlay when scoped tasks are present", async () => {
    const task = makeTask({
      id: "pane-task",
      author,
      content: "Pane task #general",
      state: {
        status: "open"
      },
    });

    const { container } = renderPane("list", {
      allTasks: [task],
      focusedTaskId: null,
    });

    await waitFor(() => expect(screen.getByTestId("list-view")).toBeInTheDocument());
    expect(container.querySelector('[role="status"]')).not.toBeInTheDocument();
  });

  it("shows the shared overlay for a focused leaf task in table view", async () => {
    const leaf = makeTask({
      id: "focused-leaf",
      author,
      content: "Focused leaf #general",
      state: {
        status: "open"
      },
    });

    renderPane("list", {
      allTasks: [leaf],
      focusedTaskId: "focused-leaf",
    });

    await waitFor(() => expect(screen.getByTestId("list-view")).toBeInTheDocument());
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("suppresses the breadcrumb in the home view in favor of the sidebar projects indicator", async () => {
    const task = makeTask({ id: "home-focused", author, content: "Focused #general" });

    renderPane("home", { allTasks: [task], focusedTaskId: "home-focused" });

    await waitFor(() => expect(screen.getByTestId("home-view")).toBeInTheDocument());
    expect(statusRowProps).toHaveBeenCalledWith(
      expect.objectContaining({ focusedTaskId: null })
    );
  });

  it("keeps the breadcrumb for a focused task outside the home view", async () => {
    const task = makeTask({ id: "feed-focused", author, content: "Focused #general" });

    renderPane("feed", { allTasks: [task], focusedTaskId: "feed-focused" });

    await waitFor(() => expect(screen.getByTestId("feed-view")).toBeInTheDocument());
    expect(statusRowProps).toHaveBeenCalledWith(
      expect.objectContaining({ focusedTaskId: "feed-focused" })
    );
  });

  it("does not show the shared overlay for a focused leaf task in timeline view", async () => {
    const leaf = makeTask({
      id: "focused-feed-leaf",
      author,
      content: "Focused feed leaf #general",
      state: {
        status: "open"
      },
    });

    const { container } = renderPane("feed", {
      allTasks: [leaf],
      focusedTaskId: "focused-feed-leaf",
    });

    await waitFor(() => expect(screen.getByTestId("feed-view")).toBeInTheDocument());
    expect(container.querySelector('[role="status"]')).not.toBeInTheDocument();
  });
});
