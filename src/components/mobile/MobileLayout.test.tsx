import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileLayout } from "./MobileLayout";
import { MOBILE_TOAST_TOP_OFFSET_CSS_VAR } from "./use-mobile-toast-offset";
import type { Channel, Relay, Task } from "@/types";
import type { Person } from "@/types/person";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";
import { makeQuickFilterState } from "@/test/quick-filter-state";
import type { FeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import type { FeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import type { FeedViewState } from "@/features/feed-page/views/feed-view-state-context";

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

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ndkMock,
}));

const dispatchFeedInteraction = vi.fn().mockResolvedValue({
  envelope: { id: 1, dispatchedAtMs: 0, intent: { type: "ui.focusTasks" } },
  outcome: { status: "handled" as const },
});

vi.mock("@/features/feed-page/interactions/feed-interaction-context", async () => {
  const actual = await vi.importActual<typeof import("@/features/feed-page/interactions/feed-interaction-context")>(
    "@/features/feed-page/interactions/feed-interaction-context"
  );
  return {
    ...actual,
    useFeedInteractionDispatch: () => dispatchFeedInteraction,
  };
});

const mockViewState = vi.fn(() => baseFeedViewState as FeedViewState);
const mockTaskViewModel = vi.fn(() => baseTaskViewModel as FeedTaskViewModel);
const mockSurfaceState = vi.fn(() => baseSurfaceState as FeedSurfaceState);

vi.mock("@/features/feed-page/views/feed-view-state-context", () => ({
  useFeedViewState: () => mockViewState(),
}));

vi.mock("@/features/feed-page/views/feed-task-view-model-context", () => ({
  useFeedTaskViewModel: () => mockTaskViewModel(),
}));

vi.mock("@/features/feed-page/views/feed-surface-context", () => ({
  useFeedSurfaceState: () => mockSurfaceState(),
}));

vi.mock("./MobileNav", () => ({
  MobileNav: ({
    onViewChange,
    onManageOpen,
  }: {
    onViewChange: (view: "tree" | "feed" | "list" | "calendar") => void;
    onManageOpen?: () => void;
  }) => (
    <div data-testid="mobile-nav">
      <button onClick={() => onViewChange("feed")} aria-label="Switch to feed view">
        Feed
      </button>
      <button onClick={() => onViewChange("tree")} aria-label="Switch to tree view">
        Tree
      </button>
      <button onClick={() => onViewChange("calendar")} aria-label="Switch to calendar view">
        Calendar
      </button>
      <button onClick={onManageOpen} aria-label="Switch to Manage view">
        Manage
      </button>
    </div>
  ),
}));

vi.mock("./SwipeIndicator", () => ({
  SwipeIndicator: () => <div data-testid="swipe-indicator" />,
}));

vi.mock("./UnifiedBottomBar", () => ({
  UnifiedBottomBar: ({
    canCreateContent,
  }: {
    canCreateContent: boolean;
  }) => {
    const [value, setValue] = useState("");
    return (
      <div data-testid="unified-bottom-bar">
        <textarea
          aria-label="Mobile compose"
          placeholder="Search or create task"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        {!canCreateContent ? (
          <button
            type="button"
            onClick={() => {
              void dispatchFeedInteraction({
                type: "task.create",
                content: value,
                tags: ["general"],
                relays: ["demo"],
                taskType: "task",
              });
            }}
          >
            Sign in to create
          </button>
        ) : null}
      </div>
    );
  },
}));

vi.mock("./MobileFilters", () => ({
  MobileFilters: ({ profileEditorOpenSignal = 0 }: { profileEditorOpenSignal?: number }) => (
    <div data-onboarding="mobile-filters">
      {profileEditorOpenSignal > 0 ? <input id="manage-profile-name" /> : null}
    </div>
  ),
}));

vi.mock("@/components/tasks/TaskTree", () => ({
  TaskTree: ({ searchQueryOverride }: { searchQueryOverride?: string }) => (
    <div data-testid="task-tree" data-search-query={searchQueryOverride ?? ""} />
  ),
}));

vi.mock("@/components/tasks/FeedView", () => ({
  FeedView: () => <div data-testid="feed-view" />,
}));

vi.mock("@/components/tasks/CalendarView", () => ({
  CalendarView: ({ mobileView }: { mobileView?: "calendar" | "upcoming" }) => (
    <div data-testid="calendar-view" data-mobile-view={mobileView ?? "calendar"} />
  ),
}));

const relays: Relay[] = [makeRelay()];
const channels: Channel[] = [makeChannel()];
const people: Person[] = [makePerson({ id: "me", name: "Me", displayName: "Me" })];
const tasks: Task[] = [];

const baseFeedViewState: FeedViewState = {
  currentView: "tree",
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
};

const baseTaskViewModel: FeedTaskViewModel = {
  tasks,
  allTasks: tasks,
  focusedTaskId: null,
  relays,
  channels,
  composeChannels: channels,
  people,
  currentUser: people[0],
  searchQuery: "",
};

const baseSurfaceState: FeedSurfaceState = {
  relays,
  channels,
  composeChannels: channels,
  people,
  searchQuery: "",
  quickFilters: makeQuickFilterState(),
  channelMatchMode: "and",
};

type MobileLayoutOverrides = {
  viewState?: Partial<FeedViewState>;
  taskViewModel?: Partial<FeedTaskViewModel>;
  surfaceState?: Partial<FeedSurfaceState>;
};

function setMocks(overrides: MobileLayoutOverrides = {}) {
  const taskViewModel: FeedTaskViewModel = { ...baseTaskViewModel, ...overrides.taskViewModel };
  const surfaceState: FeedSurfaceState = {
    ...baseSurfaceState,
    relays: taskViewModel.relays ?? baseSurfaceState.relays,
    channels: taskViewModel.channels ?? baseSurfaceState.channels,
    composeChannels: taskViewModel.composeChannels ?? taskViewModel.channels ?? baseSurfaceState.composeChannels,
    people: taskViewModel.people ?? baseSurfaceState.people,
    searchQuery: taskViewModel.searchQuery ?? "",
    quickFilters: makeQuickFilterState(),
    channelMatchMode: taskViewModel.channelMatchMode ?? "and",
    ...overrides.surfaceState,
  };
  mockViewState.mockReturnValue({ ...baseFeedViewState, ...overrides.viewState });
  mockTaskViewModel.mockReturnValue(taskViewModel);
  mockSurfaceState.mockReturnValue(surfaceState);
}

function renderMobileLayout(overrides: MobileLayoutOverrides = {}) {
  setMocks(overrides);
  return render(<MobileLayout />);
}

function setSignedInUser() {
  ndkMock.user = {
    pubkey: "abc123",
    npub: "npub1abc",
    profile: { name: "guest-user", displayName: "Guest User" },
  };
}

beforeEach(() => {
  setMocks();
});

afterEach(() => {
  document.documentElement.style.removeProperty(MOBILE_TOAST_TOP_OFFSET_CSS_VAR);
});

describe("MobileLayout auth wiring", () => {
  it("shows the same loading fallback copy as desktop while lazy mobile views resolve", () => {
    renderMobileLayout({ viewState: { currentView: "feed" } });

    expect(screen.getByText("Loading view...")).toBeInTheDocument();
  });

  it("uses auth state (not current user) to gate compose", () => {
    ndkMock.user = null;
    ndkMock.needsProfileSetup = false;
    dispatchFeedInteraction.mockClear();

    renderMobileLayout({ viewState: { canCreateContent: false } });

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in to create/i }));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.create",
      content: "Ship #general",
      tags: ["general"],
      relays: ["demo"],
      taskType: "task",
    });
  });

  it("redirects to manage view and opens profile editor when profile completion prompt signal increments", async () => {
    ndkMock.user = null;
    ndkMock.needsProfileSetup = false;

    const { rerender } = renderMobileLayout({
      viewState: { canCreateContent: false, profileCompletionPromptSignal: 0 },
    });

    expect(screen.getByTestId("task-tree")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search or create task/i)).toBeInTheDocument();

    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    setMocks({ viewState: { canCreateContent: true, profileCompletionPromptSignal: 1 } });
    rerender(<MobileLayout />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search or create task/i)).not.toBeVisible();
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
      expect(document.querySelector("#manage-profile-name")).toBeInTheDocument();
    });
  });

  it("stays on the feed surface when a signed-in guest already has local profile fields and no prompt signal", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout({
      viewState: { canCreateContent: true, profileCompletionPromptSignal: 0 },
    });

    expect(screen.getByTestId("task-tree")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search or create task/i)).toBeVisible();
    expect(document.querySelector("#manage-profile-name")).not.toBeInTheDocument();
  });

  it("hides unified compose bar when manage view is open", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout();

    expect(screen.getByPlaceholderText(/search or create task/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /switch to manage view/i }));
    expect(screen.getByPlaceholderText(/search or create task/i)).not.toBeVisible();
  });

  it("syncs manage route state when opening manage view", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    dispatchFeedInteraction.mockClear();

    renderMobileLayout();

    fireEvent.click(screen.getByRole("button", { name: /switch to manage view/i }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "ui.manageRoute.change", isActive: true });
  });

  it("restores manage panel from route state", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout({ viewState: { isManageRouteActive: true } });

    expect(screen.getByPlaceholderText(/search or create task/i)).not.toBeVisible();
    expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
  });

  it("preserves compose draft text when opening and closing manage view", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout();

    const composeField = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Draft with #general" } });
    fireEvent.click(screen.getByRole("button", { name: /switch to manage view/i }));
    fireEvent.click(screen.getByRole("button", { name: /switch to tree view/i }));

    expect(screen.getByPlaceholderText(/search or create task/i)).toHaveValue("Draft with #general");
  });

  it("exits manage by routing directly to the selected view", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    dispatchFeedInteraction.mockClear();

    renderMobileLayout({ viewState: { currentView: "list" } });

    fireEvent.click(screen.getByRole("button", { name: /switch to manage view/i }));
    fireEvent.click(screen.getByRole("button", { name: /switch to calendar view/i }));

    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(1, {
      type: "ui.manageRoute.change",
      isActive: true,
    });
    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(2, {
      type: "ui.view.change",
      view: "calendar",
    });
    expect(dispatchFeedInteraction).toHaveBeenCalledTimes(2);
  });

  it("falls back to showing all tasks when mobile quick filter has no matches", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Task[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"] }),
    ];

    renderMobileLayout({
      taskViewModel: { tasks: sampleTasks, allTasks: sampleTasks, searchQuery: "nomatchquery" },
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("No matches for the quick filter, showing all posts");
    expect(status).toHaveClass("text-center");
    expect(screen.getByTestId("task-tree")).toHaveAttribute("data-search-query", "");
  });

  it("drops only the text filter when an included channel still has matches", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Task[] = [
      makeTask({ id: "task-nodex", content: "Ship #nodex", tags: ["nodex"] }),
    ];

    renderMobileLayout({
      surfaceState: { channels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })] },
      taskViewModel: {
        tasks: sampleTasks,
        allTasks: sampleTasks,
        channels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
        composeChannels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
        searchQuery: "nomatchquery",
      },
    });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No matches for the quick filter, showing all posts");
    expect(status).toHaveTextContent("#nodex");
    expect(screen.getByTestId("task-tree")).toHaveAttribute("data-search-query", "");
  });

  it("drops only the text filter when a selected person still has matches", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const alice = makePerson({ id: "alice", name: "alice", displayName: "Alice Doe", isSelected: true });
    const sampleTasks: Task[] = [
      makeTask({ id: "task-alice", content: "Ship #general", author: alice }),
    ];

    renderMobileLayout({
      surfaceState: { people: [alice] },
      taskViewModel: { tasks: sampleTasks, allTasks: sampleTasks, people: [alice], searchQuery: "nomatchquery" },
    });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No matches for the quick filter, showing all posts");
    expect(status).toHaveTextContent("Alice Doe");
    expect(screen.getByTestId("task-tree")).toHaveAttribute("data-search-query", "");
  });

  it("hides fallback notices while hydration is active", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Task[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"] }),
    ];

    renderMobileLayout({
      taskViewModel: { tasks: sampleTasks, allTasks: sampleTasks, searchQuery: "nomatchquery", isHydrating: true },
    });

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(screen.getByTestId("task-tree")).toHaveAttribute("data-search-query", "");
  });

  it("shows scope fallback text when scope and quick filter both have no matches", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Task[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"] }),
    ];

    renderMobileLayout({
      surfaceState: {
        channels: [
          makeChannel({ id: "nodex", name: "nodex", filterState: "included" }),
          makeChannel({ id: "nostr", name: "nostr", filterState: "included" }),
          makeChannel({ id: "tech", name: "tech", filterState: "excluded" }),
        ],
      },
      taskViewModel: { tasks: sampleTasks, allTasks: sampleTasks, searchQuery: "nomatchquery" },
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Nothing yet in #nodex and #nostr, excluding #tech");
    expect(status).toHaveTextContent("showing everything");
    expect(screen.getByTestId("task-tree")).toHaveAttribute("data-search-query", "nomatchquery");
  });

  it("uses the same scoped fallback contract on mobile upcoming view", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const datedTasks: Task[] = [
      makeTask({
        id: "task-upcoming",
        content: "Upcoming #general",
        tags: ["general"],
        dueDate: new Date("2026-05-10T10:00:00.000Z"),
      }),
    ];

    renderMobileLayout({
      viewState: { currentView: "list" },
      surfaceState: { channels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })] },
      taskViewModel: { tasks: datedTasks, allTasks: datedTasks, searchQuery: "nomatchquery" },
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Nothing yet in #nodex");
    expect(status).toHaveTextContent("showing everything");
    expect(status).toHaveClass("text-center");
  });

  it("shows the focused breadcrumb on mobile upcoming", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const rootTask = makeTask({ id: "root-task", content: "Root task #general", tags: ["general"] });
    const childTask = makeTask({ id: "child-task", content: "Child task #general", tags: ["general"], parentId: "root-task" });

    renderMobileLayout({
      viewState: { currentView: "list" },
      taskViewModel: { tasks: [childTask], allTasks: [rootTask, childTask], focusedTaskId: "child-task" },
    });

    expect(screen.getByTestId("calendar-view")).toHaveAttribute("data-mobile-view", "upcoming");
    expect(screen.getByRole("button", { name: /up/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Root task general" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Child task general" })).toBeInTheDocument();
  });

  it("shows the focused breadcrumb on mobile calendar", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const rootTask = makeTask({ id: "root-task", content: "Root task #general", tags: ["general"] });
    const childTask = makeTask({ id: "child-task", content: "Child task #general", tags: ["general"], parentId: "root-task" });

    renderMobileLayout({
      viewState: { currentView: "calendar" },
      taskViewModel: { tasks: [childTask], allTasks: [rootTask, childTask], focusedTaskId: "child-task" },
    });

    expect(screen.getByTestId("calendar-view")).toHaveAttribute("data-mobile-view", "calendar");
    expect(screen.getByRole("button", { name: /up/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Root task general" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Child task general" })).toBeInTheDocument();
  });

  it("shows the mobile scope fallback notice when selected people and channels remove all scoped matches", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const selectedPerson = makePerson({ id: "me", name: "me", displayName: "Me", isSelected: true });
    const otherPerson = makePerson({ id: "bob", name: "bob", displayName: "Bob", isSelected: false });
    const sampleTasks: Task[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"], author: otherPerson }),
    ];

    renderMobileLayout({
      surfaceState: {
        channels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
        composeChannels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
        people: [selectedPerson, otherPerson],
      },
      taskViewModel: { tasks: sampleTasks, allTasks: sampleTasks, people: [selectedPerson, otherPerson] },
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Nothing yet with Me, in #nodex");
    expect(status).toHaveTextContent("showing everything");
    expect(screen.getByTestId("task-tree")).toHaveAttribute("data-search-query", "");
  });

  it("shows a single loading row on mobile upcoming while hydrating", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout({
      viewState: { currentView: "list" },
      taskViewModel: { isHydrating: true },
    });

    expect(screen.getAllByText("Loading events from relay…")).toHaveLength(1);
  });

  it("opens Manage and unfolds profile editor on mobile onboarding step 5", async () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout({
      viewState: { isOnboardingOpen: true, activeOnboardingStepId: "mobile-filters-properties" },
    });

    await waitFor(() => {
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
      expect(document.querySelector("#manage-profile-name")).toBeInTheDocument();
    });
  });

  it("switches to feed on mobile onboarding step 7", async () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    dispatchFeedInteraction.mockClear();

    const { rerender } = renderMobileLayout({
      viewState: { isOnboardingOpen: true, activeOnboardingStepId: "mobile-filters-properties" },
    });

    await waitFor(() => {
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
    });

    setMocks({ viewState: { currentView: "tree", isOnboardingOpen: true, activeOnboardingStepId: "mobile-compose-combobox" } });
    rerender(<MobileLayout />);

    await waitFor(() => {
      expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "ui.view.change", view: "feed" });
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).not.toBeInTheDocument();
    });
  });

  it("uses currentView as the source of truth for rendered mobile view", async () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    dispatchFeedInteraction.mockClear();

    const { rerender } = renderMobileLayout();

    expect(screen.getByTestId("task-tree")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /switch to feed view/i }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "ui.view.change", view: "feed" });
    expect(screen.queryByTestId("feed-view")).not.toBeInTheDocument();

    setMocks({ viewState: { currentView: "feed" } });
    rerender(<MobileLayout />);

    await waitFor(() => {
      expect(screen.getByTestId("feed-view")).toBeInTheDocument();
    });
  });

  it("switches top-bar views without closing manage route when not in manage", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    dispatchFeedInteraction.mockClear();

    renderMobileLayout();

    fireEvent.click(screen.getByRole("button", { name: /switch to feed view/i }));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "ui.view.change", view: "feed" });
    const manageRouteCalls = dispatchFeedInteraction.mock.calls.filter(
      ([intent]) => intent?.type === "ui.manageRoute.change" && intent?.isActive === false
    );
    expect(manageRouteCalls).toHaveLength(0);
  });

  it("publishes a larger mobile toast top offset when focused breadcrumb chrome is visible", async () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const rootTask = makeTask({ id: "root-task", content: "Root task #general", tags: ["general"] });
    const childTask = makeTask({ id: "child-task", content: "Child task #general", tags: ["general"], parentId: "root-task" });

    const { rerender, unmount } = renderMobileLayout({
      taskViewModel: { tasks: [childTask], allTasks: [rootTask, childTask], focusedTaskId: null },
    });

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue(MOBILE_TOAST_TOP_OFFSET_CSS_VAR)).toBe("56px");
    });

    setMocks({ taskViewModel: { tasks: [childTask], allTasks: [rootTask, childTask], focusedTaskId: "child-task" } });
    rerender(<MobileLayout />);

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue(MOBILE_TOAST_TOP_OFFSET_CSS_VAR)).toBe("96px");
    });

    unmount();

    expect(document.documentElement.style.getPropertyValue(MOBILE_TOAST_TOP_OFFSET_CSS_VAR)).toBe("");
  });
});
