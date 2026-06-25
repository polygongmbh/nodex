import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { HomeView } from "./HomeView";
import { FeedSurfaceProvider, type FeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useCurrentUserStore } from "@/features/feed-page/stores/current-user-store";
import { useHomeDayStore } from "@/features/feed-page/stores/home-day-store";
import { clearKind0Cache, makeChannel, makePerson, makeRelay, makeTask, seedKind0Profile } from "@/test/fixtures";
import { makeQuickFilterState } from "@/test/quick-filter-state";
import type { Post } from "@/types";

const feedViewProps = vi.fn();
vi.mock("@/components/tasks/FeedView", () => ({
  FeedView: (props: Record<string, unknown>) => {
    feedViewProps(props);
    return <div data-testid="feed-view" />;
  },
}));

vi.mock("@/features/auth/controllers/use-auth-action-policy", () => ({
  useAuthActionPolicy: () => ({ canOpenCompose: false, canCreateContent: false }),
}));

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: null }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => <div />,
  DropdownMenuShortcut: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => vi.fn(),
}));

const me = makePerson({ pubkey: "a".repeat(64), name: "alice", displayName: "@alice" });

// A mid-month day: its number is unique in the rendered month grid (only
// days near the month edges also appear as outside days).
const today = new Date();
const midMonthDay = new Date(today.getFullYear(), today.getMonth(), 15);

function renderHomeView(posts: Post[], props: Partial<ComponentProps<typeof HomeView>> = {}) {
  const surfaceState: FeedSurfaceState = {
    relays: [makeRelay()],
    channels: [makeChannel()],
    people: [me],
    mentionablePeople: [me],
    quickFilters: makeQuickFilterState(),
  };
  return render(
    <FeedSurfaceProvider value={surfaceState}>
      <HomeView posts={posts} focusedTaskId={null} {...props} />
    </FeedSurfaceProvider>
  );
}

function clickCalendarDay(dayOfMonth: number) {
  const calendar = screen.getByTestId("home-mini-calendar");
  fireEvent.click(within(calendar).getByText(String(dayOfMonth)));
}

beforeEach(() => {
  feedViewProps.mockClear();
  useCurrentUserStore.getState().setCurrentUser(me);
  useHomeDayStore.getState().clearSelectedDay();
  // Author display resolves from the kind-0 cache now, not the surface `people`.
  clearKind0Cache();
  seedKind0Profile(me.pubkey, { name: "alice", display_name: "@alice" });
});

describe("HomeView", () => {
  const datedTask = makeTask({
    id: "task-dated",
    author: me,
    content: "Dated task #general",
    dueDate: midMonthDay,
  });
  const undatedTask = makeTask({
    id: "task-undated",
    author: me,
    content: "Undated task #general",
  });

  it("renders the timeline with the home feed scope", () => {
    renderHomeView([datedTask]);

    expect(screen.getByTestId("feed-view")).toBeInTheDocument();
    expect(feedViewProps).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "home", posts: [datedTask] })
    );
  });

  it("filters my tasks to the selected day and restores them when the day is clicked again", () => {
    renderHomeView([datedTask, undatedTask]);

    expect(screen.getByText(/Dated task/)).toBeInTheDocument();
    expect(screen.getByText(/Undated task/)).toBeInTheDocument();

    clickCalendarDay(15);
    expect(screen.getByText(/Dated task/)).toBeInTheDocument();
    expect(screen.queryByText(/Undated task/)).not.toBeInTheDocument();

    clickCalendarDay(15);
    expect(screen.getByText(/Undated task/)).toBeInTheDocument();
  });

  it("shows a hint when the selected day has no tasks of mine", () => {
    renderHomeView([datedTask, undatedTask]);

    clickCalendarDay(16);

    expect(screen.getByText("No tasks for this day.")).toBeInTheDocument();
    expect(screen.queryByText(/Dated task/)).not.toBeInTheDocument();
  });

  it("prompts to sign in when signed out", () => {
    useCurrentUserStore.getState().setCurrentUser(undefined);

    renderHomeView([datedTask]);

    expect(screen.getByText("Sign in to see tasks assigned to you.")).toBeInTheDocument();
  });
});
