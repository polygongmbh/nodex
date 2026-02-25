import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        onNewTask={() => ({ ok: true, mode: "local" })}
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

  it("redirects to manage view and opens profile editor after sign-in when cached profile metadata is missing", async () => {
    ndkMock.user = null;
    ndkMock.needsProfileSetup = false;

    const { rerender } = render(
      <MobileLayout
        relays={relays}
        channels={channels}
        people={people}
        tasks={tasks}
        allTasks={tasks}
        searchQuery=""
        focusedTaskId={null}
        currentUser={people[0]}
        hasCachedCurrentUserProfileMetadata={false}
        isSignedIn={false}
        currentView="tree"
        onViewChange={() => {}}
        onSearchChange={() => {}}
        onNewTask={() => ({ ok: true, mode: "local" })}
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

    expect(screen.getByTestId("task-tree")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search or create task/i)).toBeInTheDocument();

    ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
    ndkMock.needsProfileSetup = false;

    rerender(
      <MobileLayout
        relays={relays}
        channels={channels}
        people={people}
        tasks={tasks}
        allTasks={tasks}
        searchQuery=""
        focusedTaskId={null}
        currentUser={people[0]}
        hasCachedCurrentUserProfileMetadata={false}
        isSignedIn={true}
        currentView="tree"
        onViewChange={() => {}}
        onSearchChange={() => {}}
        onNewTask={() => ({ ok: true, mode: "local" })}
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

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search or create task/i)).not.toBeVisible();
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
      expect(document.querySelector("#manage-profile-name")).toBeInTheDocument();
    });
  });

  it("hides unified compose bar when manage view is open", () => {
    ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
    ndkMock.needsProfileSetup = false;

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
        onNewTask={() => ({ ok: true, mode: "local" })}
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

    expect(screen.getByPlaceholderText(/search or create task/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /switch to manage view/i }));
    expect(screen.getByPlaceholderText(/search or create task/i)).not.toBeVisible();
  });

  it("syncs manage route state when opening manage view", () => {
    ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
    ndkMock.needsProfileSetup = false;
    const onManageRouteChange = vi.fn();

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
        onNewTask={() => ({ ok: true, mode: "local" })}
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
        onManageRouteChange={onManageRouteChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /switch to manage view/i }));
    expect(onManageRouteChange).toHaveBeenCalledWith(true);
  });

  it("restores manage panel from route state", () => {
    ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
    ndkMock.needsProfileSetup = false;

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
        onNewTask={() => ({ ok: true, mode: "local" })}
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
        isManageRouteActive
      />
    );

    expect(screen.getByPlaceholderText(/search or create task/i)).not.toBeVisible();
    expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
  });

  it("preserves compose draft text when opening and closing manage view", () => {
    ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
    ndkMock.needsProfileSetup = false;

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
        onNewTask={() => ({ ok: true, mode: "local" })}
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

    const composeField = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Draft with #general" } });
    fireEvent.click(screen.getByRole("button", { name: /switch to manage view/i }));
    fireEvent.click(screen.getByRole("button", { name: /switch to tree view/i }));

    expect(screen.getByPlaceholderText(/search or create task/i)).toHaveValue("Draft with #general");
  });

  it("falls back to showing all tasks when mobile quick filter has no matches", () => {
    ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
    ndkMock.needsProfileSetup = false;

    const sampleTasks: Task[] = [
      makeTask({ id: "task-1", content: "Ship #general", tags: ["general"] }),
    ];

    render(
      <MobileLayout
        relays={relays}
        channels={channels}
        people={people}
        tasks={sampleTasks}
        allTasks={sampleTasks}
        searchQuery="nomatchquery"
        focusedTaskId={null}
        currentUser={people[0]}
        isSignedIn={true}
        currentView="tree"
        onViewChange={() => {}}
        onSearchChange={() => {}}
        onNewTask={() => ({ ok: true, mode: "local" })}
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

    expect(screen.getByTestId("mobile-quick-filter-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("task-tree")).toHaveAttribute("data-search-query", "");
  });

  it("opens Manage and unfolds profile editor on mobile onboarding step 5", async () => {
    ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
    ndkMock.needsProfileSetup = false;

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
        isSignedIn
        currentView="tree"
        onViewChange={() => {}}
        onSearchChange={() => {}}
        onNewTask={() => ({ ok: true, mode: "local" })}
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
        isOnboardingOpen
        activeOnboardingStepId="mobile-filters-properties"
      />
    );

    await waitFor(() => {
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
      expect(document.querySelector("#manage-profile-name")).toBeInTheDocument();
    });
  });

  it("switches to feed on mobile onboarding step 7", async () => {
    ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
    ndkMock.needsProfileSetup = false;
    const onViewChange = vi.fn();

    const { rerender } = render(
      <MobileLayout
        relays={relays}
        channels={channels}
        people={people}
        tasks={tasks}
        allTasks={tasks}
        searchQuery=""
        focusedTaskId={null}
        currentUser={people[0]}
        isSignedIn
        currentView="tree"
        onViewChange={onViewChange}
        onSearchChange={() => {}}
        onNewTask={() => ({ ok: true, mode: "local" })}
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
        isOnboardingOpen
        activeOnboardingStepId="mobile-filters-properties"
      />
    );

    await waitFor(() => {
      expect(document.querySelector('[data-onboarding="mobile-filters"]')).toBeInTheDocument();
    });

    rerender(
      <MobileLayout
        relays={relays}
        channels={channels}
        people={people}
        tasks={tasks}
        allTasks={tasks}
        searchQuery=""
        focusedTaskId={null}
        currentUser={people[0]}
        isSignedIn
        currentView="tree"
        onViewChange={onViewChange}
        onSearchChange={() => {}}
        onNewTask={() => ({ ok: true, mode: "local" })}
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
    ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
    ndkMock.needsProfileSetup = false;
    const onViewChange = vi.fn();

    const { rerender } = render(
      <MobileLayout
        relays={relays}
        channels={channels}
        people={people}
        tasks={tasks}
        allTasks={tasks}
        searchQuery=""
        focusedTaskId={null}
        currentUser={people[0]}
        isSignedIn
        currentView="tree"
        onViewChange={onViewChange}
        onSearchChange={() => {}}
        onNewTask={() => ({ ok: true, mode: "local" })}
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

    expect(screen.getByTestId("task-tree")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /switch to feed view/i }));
    expect(onViewChange).toHaveBeenCalledWith("feed");
    expect(screen.queryByTestId("feed-view")).not.toBeInTheDocument();

    rerender(
      <MobileLayout
        relays={relays}
        channels={channels}
        people={people}
        tasks={tasks}
        allTasks={tasks}
        searchQuery=""
        focusedTaskId={null}
        currentUser={people[0]}
        isSignedIn
        currentView="feed"
        onViewChange={onViewChange}
        onSearchChange={() => {}}
        onNewTask={() => ({ ok: true, mode: "local" })}
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

    await waitFor(() => {
      expect(screen.getByTestId("feed-view")).toBeInTheDocument();
    });
  });

  it("switches top-bar views without closing manage route when not in manage", () => {
    ndkMock.user = { pubkey: "abc123", npub: "npub1abc", profile: { displayName: "Guest User" } };
    ndkMock.needsProfileSetup = false;
    const onViewChange = vi.fn();
    const onManageRouteChange = vi.fn();

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
        isSignedIn
        currentView="tree"
        onViewChange={onViewChange}
        onSearchChange={() => {}}
        onNewTask={() => ({ ok: true, mode: "local" })}
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
        onManageRouteChange={onManageRouteChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /switch to feed view/i }));

    expect(onViewChange).toHaveBeenCalledWith("feed");
    expect(onManageRouteChange).not.toHaveBeenCalledWith(false);
  });
});
