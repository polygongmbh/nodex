import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileLayout } from "./MobileLayout";
import { MOBILE_TOAST_TOP_OFFSET_CSS_VAR } from "./use-mobile-toast-offset";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import {
  ingestPost,
  __resetPostsStoreForTests,
} from "@/features/feed-page/stores/posts-store";
import { useHydrationStatusStore } from "@/features/feed-page/stores/hydration-status-store";
import { useCurrentUserStore } from "@/features/feed-page/stores/current-user-store";
import type { Channel, Relay, Post } from "@/types";
import type { SelectablePerson } from "@/types/person";
import type { Person } from "@/types/person";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";
import { makeQuickFilterState } from "@/test/quick-filter-state";
import type { FeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import type { FeedViewState } from "@/features/feed-page/views/feed-view-state-context";
import type { MobileViewType } from "@/components/mobile/MobileNav";

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

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => true,
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
const mockSurfaceState = vi.fn(() => baseSurfaceState as FeedSurfaceState);

vi.mock("@/features/feed-page/views/feed-view-state-context", () => ({
  useFeedViewState: () => mockViewState(),
}));

vi.mock("@/features/feed-page/views/feed-surface-context", () => ({
  useFeedSurfaceState: () => mockSurfaceState(),
}));

vi.mock("@/features/feed-page/views/FailedPublishQueueBannerContainer", () => ({
  FailedPublishQueueBannerContainer: () => null,
}));

vi.mock("./MobileNav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./MobileNav")>();
  return {
    ...actual,
    MobileNav: ({
      onViewChange,
    }: {
      onViewChange: (view: MobileViewType) => void;
    }) => (
      <div data-testid="mobile-nav">
        <button onClick={() => onViewChange("status")}>Status</button>
        <button onClick={() => onViewChange("feed")}>Feed</button>
        <button onClick={() => onViewChange("tree")}>Tree</button>
        <button onClick={() => onViewChange("calendar")}>Calendar</button>
      </div>
    ),
  };
});

vi.mock("./MobileChannelChips", () => ({
  MobileChannelChips: ({ onManageToggle }: { onManageToggle?: () => void }) => (
    <div data-testid="mobile-channel-chips">
      <button onClick={onManageToggle}>Manage</button>
    </div>
  ),
}));

vi.mock("./SwipeIndicator", () => ({
  SwipeIndicator: () => <div data-testid="swipe-indicator" />,
}));

const signInCreateClick = vi.fn();
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
          placeholder="Search or create task"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        {!canCreateContent ? (
          <button
            type="button"
            onClick={() => signInCreateClick({ content: value, postType: "task" })}
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
  TaskTree: () => <div data-testid="task-tree" />,
}));

vi.mock("@/components/tasks/FeedView", () => ({
  FeedView: () => <div data-testid="feed-view" />,
}));

vi.mock("@/components/tasks/CalendarView", () => ({
  CalendarView: () => <div data-testid="calendar-view" />,
}));

vi.mock("@/components/tasks/UpcomingView", () => ({
  UpcomingView: () => <div data-testid="upcoming-view" />,
}));

const relays: Relay[] = [makeRelay()];
const channels: Channel[] = [makeChannel()];
const people: SelectablePerson[] = [makePerson({ pubkey: "me", name: "Me", displayName: "Me" })];
const tasks: Post[] = [];

const baseFeedViewState: FeedViewState = {
  currentView: "tree",
  displayDepthMode: "leaves",
  isSidebarFocused: false,
  isOnboardingOpen: false,
  activeOnboardingStepId: null,
  isManageRouteActive: false,
  canCreateContent: true,
  profileCompletionPromptSignal: 0,
};

const baseSurfaceState: FeedSurfaceState = {
  relays,
  channels,
  people,
  quickFilters: makeQuickFilterState(),
};

interface TaskViewModelOverride {
  allTasks?: Post[];
  focusedTaskId?: string | null;
  isHydrating?: boolean;
  currentUser?: Person;
}

type MobileLayoutOverrides = {
  viewState?: Partial<FeedViewState>;
  taskViewModel?: TaskViewModelOverride;
  surfaceState?: Partial<FeedSurfaceState>;
};

function applyTaskViewModelOverride(override: TaskViewModelOverride = {}) {
  __resetPostsStoreForTests();
  for (const post of override.allTasks ?? []) {
    ingestPost({ post });
  }
  useHydrationStatusStore.getState().setIsHydrating(override.isHydrating ?? false);
  useCurrentUserStore
    .getState()
    .setCurrentUser(override.currentUser ?? people[0]);
}

function setMocks(overrides: MobileLayoutOverrides = {}) {
  const surfaceState: FeedSurfaceState = {
    ...baseSurfaceState,
    quickFilters: makeQuickFilterState(),
    ...overrides.surfaceState,
  };
  mockViewState.mockReturnValue({ ...baseFeedViewState, ...overrides.viewState });
  mockSurfaceState.mockReturnValue(surfaceState);
  applyTaskViewModelOverride(overrides.taskViewModel);
}

function renderMobileLayout(overrides: MobileLayoutOverrides & { searchQuery?: string } = {}) {
  const { searchQuery, ...rest } = overrides;
  setMocks(rest);
  useFilterStore.getState().setSearchQuery(searchQuery ?? "");
  const focusedTaskId = rest.taskViewModel?.focusedTaskId ?? null;
  const posts = rest.taskViewModel?.allTasks ?? [];
  return render(
    <MemoryRouter>
      <MobileLayout posts={posts} focusedTaskId={focusedTaskId} />
    </MemoryRouter>
  );
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
  __resetPostsStoreForTests();
  useHydrationStatusStore.getState().setIsHydrating(false);
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

    expect(signInCreateClick).toHaveBeenCalledWith({
      content: "Ship #general",
      postType: "task",
    });
  });

  it("does not redirect to manage view when profile completion prompt signal increments (handled globally)", async () => {
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
    rerender(<MobileLayout posts={[]} focusedTaskId={null} />);

    // Prompt no longer hijacks the route; the global ProfileCompletionDialog
    // (mounted in FeedPageProviders) handles displaying the editor instead.
    expect(screen.getByTestId("task-tree")).toBeInTheDocument();
    expect(document.querySelector('[data-onboarding="mobile-filters"]')).not.toBeInTheDocument();
    expect(document.querySelector("#manage-profile-name")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(screen.getByPlaceholderText(/search or create task/i)).not.toBeVisible();
  });

  it("closes the manage view when the burger is tapped again", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout();

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(screen.getByPlaceholderText(/search or create task/i)).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(screen.getByPlaceholderText(/search or create task/i)).toBeVisible();
  });

  it("syncs manage route state when opening manage view", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    dispatchFeedInteraction.mockClear();

    renderMobileLayout();

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));

    expect(screen.getByPlaceholderText(/search or create task/i)).toHaveValue("Draft with #general");
  });

  it("exits manage by routing directly to the selected view", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    dispatchFeedInteraction.mockClear();

    renderMobileLayout({ viewState: { currentView: "list" } });

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));

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

    const sampleTasks: Post[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"] }),
    ];

    renderMobileLayout({
      taskViewModel: { allTasks: sampleTasks },
      searchQuery: "nomatchquery",
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("No matches for the quick filter, showing all posts");
    expect(status).toHaveClass("text-center");  });

  it("prompts to select a channel when timeline search has no matches and no channel is selected", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Post[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"] }),
    ];

    renderMobileLayout({
      viewState: { currentView: "feed" },
      taskViewModel: { allTasks: sampleTasks },
      searchQuery: "nomatchquery",
    });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No matches for the quick filter, showing all posts");
    expect(status).toHaveTextContent("Select a channel to create a post.");
  });

  it("omits the channel prompt when an included channel is already selected", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Post[] = [
      makeTask({ id: "task-nodex", content: "Ship #nodex", tags: ["nodex"] }),
    ];

    renderMobileLayout({
      viewState: { currentView: "feed" },
      surfaceState: {
        channels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
      },
      taskViewModel: { allTasks: sampleTasks },
      searchQuery: "nomatchquery",
    });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No matches for the quick filter, showing all posts");
    expect(status).not.toHaveTextContent("Select a channel to create a post.");
  });

  it("drops only the text filter when an included channel still has matches", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Post[] = [
      makeTask({ id: "task-nodex", content: "Ship #nodex", tags: ["nodex"] }),
    ];

    renderMobileLayout({
      surfaceState: {
        channels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
      },
      taskViewModel: { allTasks: sampleTasks },
      searchQuery: "nomatchquery",
    });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No matches for the quick filter, showing all posts");
    expect(status).toHaveTextContent("#nodex");  });

  it("drops only the text filter when a selected person still has matches", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const alice = makePerson({ pubkey: "alice", name: "alice", displayName: "Alice Doe", isSelected: true });
    const sampleTasks: Post[] = [
      makeTask({ id: "task-alice", content: "Ship #general", author: alice }),
    ];

    renderMobileLayout({
      surfaceState: { people: [alice] },
      taskViewModel: { allTasks: sampleTasks },
      searchQuery: "nomatchquery",
    });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No matches for the quick filter, showing all posts");
    expect(status).toHaveTextContent("Alice Doe");  });

  it("hides fallback notices while hydration is active", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Post[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"] }),
    ];

    renderMobileLayout({
      taskViewModel: { allTasks: sampleTasks, isHydrating: true },
      searchQuery: "nomatchquery",
    });

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);  });

  it("shows scope fallback text when scope and quick filter both have no matches", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Post[] = [
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
      taskViewModel: { allTasks: sampleTasks },
      searchQuery: "nomatchquery",
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Nothing yet in #nodex and #nostr, excluding #tech");
    expect(status).toHaveTextContent("showing everything");  });

  it("uses the same scoped fallback contract on mobile upcoming view", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const datedTasks: Post[] = [
      makeTask({
        id: "task-upcoming",
        content: "Upcoming #general",
        tags: ["general"],
        dueDate: new Date("2026-05-10T10:00:00.000Z"),
      }),
    ];

    renderMobileLayout({
      viewState: { currentView: "list" },
      surfaceState: {
        channels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
      },
      taskViewModel: { allTasks: datedTasks },
      searchQuery: "nomatchquery",
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
      taskViewModel: { allTasks: [rootTask, childTask], focusedTaskId: "child-task" },
    });

    expect(screen.getByTestId("upcoming-view")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /up/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Root task general" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Child task general" })).toBeInTheDocument();
  });

  it("shows the focused breadcrumb on mobile calendar", async () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const rootTask = makeTask({ id: "root-task", content: "Root task #general", tags: ["general"] });
    const childTask = makeTask({ id: "child-task", content: "Child task #general", tags: ["general"], parentId: "root-task" });

    renderMobileLayout({
      viewState: { currentView: "calendar" },
      taskViewModel: { allTasks: [rootTask, childTask], focusedTaskId: "child-task" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("calendar-view")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /up/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Root task general" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Child task general" })).toBeInTheDocument();
  });

  it("shows the mobile scope fallback notice when selected people and channels remove all scoped matches", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const selectedPerson = makePerson({ pubkey: "me", name: "me", displayName: "Me", isSelected: true });
    const otherPerson = makePerson({ pubkey: "bob", name: "bob", displayName: "Bob", isSelected: false });
    const sampleTasks: Post[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"], author: otherPerson }),
    ];

    renderMobileLayout({
      surfaceState: {
        channels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
        people: [selectedPerson, otherPerson],
      },
      taskViewModel: { allTasks: sampleTasks },
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Nothing yet with Me, in #nodex");
    expect(status).toHaveTextContent("showing everything");  });

  it("shows a single loading row on mobile upcoming while hydrating", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout({
      viewState: { currentView: "list" },
      taskViewModel: { isHydrating: true },
    });

    expect(screen.getAllByText("Loading events from relay…")).toHaveLength(1);
  });

  it("switches to feed on mobile compose combobox onboarding step", async () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    dispatchFeedInteraction.mockClear();

    const { rerender } = renderMobileLayout({
      viewState: { isOnboardingOpen: true, activeOnboardingStepId: "mobile-filters-use" },
    });

    setMocks({ viewState: { currentView: "tree", isOnboardingOpen: true, activeOnboardingStepId: "mobile-compose-combobox" } });
    rerender(<MobileLayout posts={[]} focusedTaskId={null} />);

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
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "ui.view.change", view: "feed" });
    expect(screen.queryByTestId("feed-view")).not.toBeInTheDocument();

    setMocks({ viewState: { currentView: "feed" } });
    rerender(<MobileLayout posts={[]} focusedTaskId={null} />);

    await waitFor(() => {
      expect(screen.getByTestId("feed-view")).toBeInTheDocument();
    });
  });

  it("switches top-bar views without closing manage route when not in manage", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    dispatchFeedInteraction.mockClear();

    renderMobileLayout();

    fireEvent.click(screen.getByRole("button", { name: "Feed" }));

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

    const { unmount } = renderMobileLayout({
      taskViewModel: { allTasks: [rootTask, childTask], focusedTaskId: null },
    });

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue(MOBILE_TOAST_TOP_OFFSET_CSS_VAR)).toBe("56px");
    });

    unmount();

    const next = renderMobileLayout({
      taskViewModel: { allTasks: [rootTask, childTask], focusedTaskId: "child-task" },
    });

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue(MOBILE_TOAST_TOP_OFFSET_CSS_VAR)).toBe("96px");
    });

    next.unmount();

    expect(document.documentElement.style.getPropertyValue(MOBILE_TOAST_TOP_OFFSET_CSS_VAR)).toBe("");
  });
});
