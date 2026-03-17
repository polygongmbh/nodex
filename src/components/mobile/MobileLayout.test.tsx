import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { MobileLayout } from "./MobileLayout";
import type { Channel, Person, Relay, Task } from "@/types";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";

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
    onSearchChange,
    isSignedIn,
    onSignInClick,
  }: {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    isSignedIn: boolean;
    onSignInClick: () => void;
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
            onSearchChange(event.target.value);
          }}
        />
        {!isSignedIn ? (
          <button type="button" onClick={onSignInClick}>
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

const baseProps: MobileLayoutProps = {
  relays,
  channels,
  people,
  tasks,
  allTasks: tasks,
  searchQuery: "",
  focusedTaskId: null,
  currentUser: people[0],
  isSignedIn: true,
  currentView: "tree",
  onViewChange: () => {},
  onSearchChange: () => {},
  onNewTask: defaultOnNewTask,
  onToggleComplete: () => {},
  onStatusChange: () => {},
  onFocusTask: () => {},
  onRelayToggle: () => {},
  onChannelToggle: () => {},
  onPersonToggle: () => {},
  onAddRelay: () => {},
  onRemoveRelay: () => {},
  onSignInClick: () => {},
  onGuideClick: () => {},
  onHashtagClick: () => {},
};

function renderMobileLayout(overrides: Partial<MobileLayoutProps> = {}) {
  return render(<MobileLayout {...baseProps} {...overrides} />);
}

function setSignedInUser() {
  ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
}

describe("MobileLayout auth wiring", () => {
  it("uses auth state (not current user) to gate compose", () => {
    ndkMock.user = null;
    ndkMock.needsProfileSetup = false;
    const onSignInClick = vi.fn();

    renderMobileLayout({
      isSignedIn: false,
      onSignInClick,
    });

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in to create/i }));

    expect(onSignInClick).toHaveBeenCalledTimes(1);
  });

  it("redirects to manage view and opens profile editor after sign-in when cached profile metadata is missing", async () => {
    ndkMock.user = null;
    ndkMock.needsProfileSetup = false;

    const { rerender } = renderMobileLayout({
      hasCachedCurrentUserProfileMetadata: false,
      isSignedIn: false,
    });

    expect(screen.getByTestId("task-tree")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search or create task/i)).toBeInTheDocument();

    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    rerender(
      <MobileLayout
        {...baseProps}
        hasCachedCurrentUserProfileMetadata={false}
        isSignedIn
      />
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
      onManageRouteChange,
    });

    fireEvent.click(screen.getByRole("button", { name: /switch to manage view/i }));
    expect(onManageRouteChange).toHaveBeenCalledWith(true);
  });

  it("restores manage panel from route state", () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout({
      isManageRouteActive: true,
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
      tasks: sampleTasks,
      allTasks: sampleTasks,
      searchQuery: "nomatchquery",
    });

    expect(screen.getByTestId("mobile-quick-filter-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("task-tree")).toHaveAttribute("data-search-query", "");
  });

  it("opens Manage and unfolds profile editor on mobile onboarding step 5", async () => {
    setSignedInUser();
    ndkMock.needsProfileSetup = false;

    renderMobileLayout({
      isOnboardingOpen: true,
      activeOnboardingStepId: "mobile-filters-properties",
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
      onViewChange,
      isOnboardingOpen: true,
      activeOnboardingStepId: "mobile-filters-properties",
    });

    await waitFor(() => {
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
    });

    rerender(
      <MobileLayout
        {...baseProps}
        currentUser={people[0]}
        isSignedIn
        currentView="tree"
        onViewChange={onViewChange}
        isOnboardingOpen
        activeOnboardingStepId="mobile-compose-combobox"
      />
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
      onViewChange,
    });

    expect(screen.getByTestId("task-tree")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /switch to feed view/i }));
    expect(onViewChange).toHaveBeenCalledWith("feed");
    expect(screen.queryByTestId("feed-view")).not.toBeInTheDocument();

    rerender(
      <MobileLayout
        {...baseProps}
        currentUser={people[0]}
        isSignedIn
        currentView="feed"
        onViewChange={onViewChange}
      />
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
      onViewChange,
      onManageRouteChange,
    });

    fireEvent.click(screen.getByRole("button", { name: /switch to feed view/i }));

    expect(onViewChange).toHaveBeenCalledWith("feed");
    expect(onManageRouteChange).not.toHaveBeenCalledWith(false);
  });
});
