import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { MobileLayout } from "./MobileLayout";
import type { Channel, Person, Relay, Task } from "@/types";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";
import {
  FeedTaskViewModelProvider,
  type FeedTaskViewModel,
} from "@/features/feed-page/views/feed-task-view-model-context";

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

vi.mock("./MobileNav", () => ({
  MobileNav: ({ onViewChange }: { onViewChange: (view: "tree" | "feed" | "list" | "calendar" | "filters") => void }) => (
    <div data-testid="mobile-nav">
      <button onClick={() => onViewChange("feed")} aria-label="Switch to feed view">
        Feed
      </button>
      <button onClick={() => onViewChange("tree")} aria-label="Switch to tree view">
        Tree
      </button>
      <button onClick={() => onViewChange("filters")} aria-label="Switch to Manage view">
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
    searchQuery,
    isSignedIn,
    onSubmit,
  }: {
    searchQuery: string;
    isSignedIn: boolean;
    onSubmit: (...args: unknown[]) => unknown;
  }) => {
    const [value, setValue] = useState(searchQuery);

    useEffect(() => {
      setValue(searchQuery);
    }, [searchQuery]);

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
        {!isSignedIn ? (
          <button
            type="button"
            onClick={() => {
              void onSubmit(value, ["general"], ["demo"], "task");
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
  TaskTree: ({ searchQuery }: { searchQuery: string }) => (
    <div data-testid="task-tree" data-search-query={searchQuery} />
  ),
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
const defaultOnNewTask = () => ({ ok: true as const, mode: "local" as const });

type MobileLayoutProps = ComponentProps<typeof MobileLayout>;
type MobileLayoutOverrides = {
  viewState?: Partial<MobileLayoutProps["viewState"]>;
  actions?: Partial<MobileLayoutProps["actions"]>;
  composerState?: Partial<NonNullable<MobileLayoutProps["composerState"]>>;
  publishState?: Partial<NonNullable<MobileLayoutProps["publishState"]>>;
  taskViewModel?: Partial<FeedTaskViewModel>;
};

const baseProps: MobileLayoutProps = {
  viewState: {
    relays,
    channels,
    people,
    isSignedIn: true,
    currentView: "tree",
  },
  actions: {
    onViewChange: () => {},
  },
};
const baseTaskViewModel: FeedTaskViewModel = {
  tasks,
  allTasks: tasks,
  relays,
  channels,
  composeChannels: channels,
  people,
  currentUser: people[0],
  searchQuery: "",
  onNewTask: defaultOnNewTask,
};

function renderMobileLayout(overrides: MobileLayoutOverrides = {}) {
  const taskViewModel: FeedTaskViewModel = {
    ...baseTaskViewModel,
    ...overrides.taskViewModel,
  };

  return render(
    <FeedTaskViewModelProvider value={taskViewModel}>
      <MobileLayout
        viewState={{
          ...baseProps.viewState,
          ...overrides.viewState,
        }}
        actions={{
          ...baseProps.actions,
          ...overrides.actions,
        }}
        composerState={{
          ...baseProps.composerState,
          ...overrides.composerState,
        }}
        publishState={{
          ...baseProps.publishState,
          ...overrides.publishState,
        }}
      />
    </FeedTaskViewModelProvider>
  );
}

function setSignedInUser() {
  ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
}

describe("MobileLayout auth wiring", () => {
  it("uses auth state (not current user) to gate compose", () => {
    ndkMock.user = null;
    ndkMock.needsProfileSetup = false;
    const onNewTask = vi.fn().mockResolvedValue({ ok: false, reason: "not-authenticated" });

    renderMobileLayout({
      viewState: { isSignedIn: false },
      taskViewModel: { onNewTask },
    });

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in to create/i }));

    expect(onNewTask).toHaveBeenCalledTimes(1);
  });

  it("redirects to manage view and opens profile editor after sign-in when cached profile metadata is missing", async () => {
    ndkMock.user = null;
    ndkMock.needsProfileSetup = false;

    const { rerender } = renderMobileLayout({
      viewState: {
        hasCachedCurrentUserProfileMetadata: false,
        isSignedIn: false,
      },
    });

    expect(screen.getByTestId("task-tree")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search or create task/i)).toBeInTheDocument();

    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    rerender(
      <FeedTaskViewModelProvider value={baseTaskViewModel}>
        <MobileLayout
          viewState={{
            ...baseProps.viewState,
            hasCachedCurrentUserProfileMetadata: false,
            isSignedIn: true,
          }}
          actions={baseProps.actions}
        />
      </FeedTaskViewModelProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search or create task/i)).not.toBeVisible();
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
      expect(document.querySelector("#manage-profile-name")).toBeInTheDocument();
    });
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
    const onManageRouteChange = vi.fn();

    renderMobileLayout({
      actions: { onManageRouteChange },
    });

    fireEvent.click(screen.getByRole("button", { name: /switch to manage view/i }));
    expect(onManageRouteChange).toHaveBeenCalledWith(true);
  });

  it("restores manage panel from route state", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout({
      viewState: { isManageRouteActive: true },
    });

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

  it("falls back to showing all tasks when mobile quick filter has no matches", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Task[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"] }),
    ];

    renderMobileLayout({
      taskViewModel: {
        tasks: sampleTasks,
        allTasks: sampleTasks,
        searchQuery: "nomatchquery",
      },
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("No matches for the quick filter, showing all posts on Demo.");
    expect(status).toHaveClass("text-center");
    expect(screen.getByTestId("task-tree")).toHaveAttribute("data-search-query", "");
  });

  it("hides fallback notices while hydration is active", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Task[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"] }),
    ];

    renderMobileLayout({
      taskViewModel: {
        tasks: sampleTasks,
        allTasks: sampleTasks,
        searchQuery: "nomatchquery",
        isHydrating: true,
      },
    });

    expect(screen.queryByText("No matches for the quick filter, showing all posts.")).not.toBeInTheDocument();
    expect(screen.getByText("Loading events from relay…")).toBeInTheDocument();
  });

  it("shows scope fallback text when scope and quick filter both have no matches", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Task[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"] }),
    ];

    renderMobileLayout({
      viewState: {
        channels: [
          makeChannel({ id: "nodex", name: "nodex", filterState: "included" }),
          makeChannel({ id: "nostr", name: "nostr", filterState: "included" }),
          makeChannel({ id: "tech", name: "tech", filterState: "excluded" }),
        ],
      },
      taskViewModel: {
        tasks: sampleTasks,
        allTasks: sampleTasks,
        searchQuery: "nomatchquery",
      },
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(
      "Nothing yet in #nodex and #nostr, excluding #tech, on Demo, showing everything."
    );
    expect(screen.getByTestId("task-tree")).toHaveAttribute("data-search-query", "");
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
      viewState: {
        currentView: "list",
        channels: [makeChannel({ id: "nodex", name: "nodex", filterState: "included" })],
      },
      taskViewModel: {
        tasks: datedTasks,
        allTasks: datedTasks,
        searchQuery: "nomatchquery",
      },
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Nothing yet in #nodex, on Demo, showing everything.");
    expect(status).toHaveClass("text-center");
  });

  it("shows a single loading row on mobile upcoming while hydrating", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout({
      viewState: {
        currentView: "list",
      },
      taskViewModel: {
        isHydrating: true,
      },
    });

    expect(screen.getAllByText("Loading events from relay…")).toHaveLength(1);
  });

  it("opens Manage and unfolds profile editor on mobile onboarding step 5", async () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout({
      viewState: {
        isOnboardingOpen: true,
        activeOnboardingStepId: "mobile-filters-properties",
      },
    });

    await waitFor(() => {
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
      expect(document.querySelector("#manage-profile-name")).toBeInTheDocument();
    });
  });

  it("switches to feed on mobile onboarding step 7", async () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    const onViewChange = vi.fn();

    const { rerender } = renderMobileLayout({
      actions: { onViewChange },
      viewState: {
        isOnboardingOpen: true,
        activeOnboardingStepId: "mobile-filters-properties",
      },
    });

    await waitFor(() => {
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
    });

    rerender(
      <FeedTaskViewModelProvider value={baseTaskViewModel}>
        <MobileLayout
          viewState={{
            ...baseProps.viewState,
            isSignedIn: true,
            currentView: "tree",
            isOnboardingOpen: true,
            activeOnboardingStepId: "mobile-compose-combobox",
          }}
          actions={{
            ...baseProps.actions,
            onViewChange,
          }}
        />
      </FeedTaskViewModelProvider>
    );

    await waitFor(() => {
      expect(onViewChange).toHaveBeenCalledWith("feed");
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).not.toBeInTheDocument();
    });
  });

  it("uses currentView as the source of truth for rendered mobile view", async () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    const onViewChange = vi.fn();

    const { rerender } = renderMobileLayout({
      actions: { onViewChange },
    });

    expect(screen.getByTestId("task-tree")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /switch to feed view/i }));
    expect(onViewChange).toHaveBeenCalledWith("feed");
    expect(screen.queryByTestId("feed-view")).not.toBeInTheDocument();

    rerender(
      <FeedTaskViewModelProvider value={baseTaskViewModel}>
        <MobileLayout
          viewState={{
            ...baseProps.viewState,
            isSignedIn: true,
            currentView: "feed",
          }}
          actions={{
            ...baseProps.actions,
            onViewChange,
          }}
        />
      </FeedTaskViewModelProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("feed-view")).toBeInTheDocument();
    });
  });

  it("switches top-bar views without closing manage route when not in manage", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;
    const onViewChange = vi.fn();
    const onManageRouteChange = vi.fn();

    renderMobileLayout({
      actions: {
        onViewChange,
        onManageRouteChange,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /switch to feed view/i }));

    expect(onViewChange).toHaveBeenCalledWith("feed");
    expect(onManageRouteChange).not.toHaveBeenCalledWith(false);
  });
});
