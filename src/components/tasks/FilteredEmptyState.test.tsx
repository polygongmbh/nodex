import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilteredEmptyState } from "./FilteredEmptyState";
import type { Channel, Relay, Task } from "@/types";
import type { Person } from "@/types/person";
import { makeQuickFilterState } from "@/test/quick-filter-state";
import { makeTask, makePerson } from "@/test/fixtures";
import { FeedSurfaceProvider } from "@/features/feed-page/views/feed-surface-context";
import { FeedTaskViewModelProvider } from "@/features/feed-page/views/feed-task-view-model-context";

const relays: Relay[] = [
  {
    id: "relay-one",
    name: "Relay One",
    url: "wss://relay.one",
    isActive: true,
    connectionStatus: "connected",
  },
  {
    id: "relay-two",
    name: "Relay Two",
    url: "wss://relay.two",
    isActive: false,
    connectionStatus: "connected",
  },
];
const singleRelay: Relay[] = [relays[0]];

const channels: Channel[] = [
  { id: "ops", name: "ops", filterState: "included" },
  { id: "frontend", name: "frontend", filterState: "excluded" },
];

const people: Person[] = [
  {
    id: "alice",
    name: "alice",
    displayName: "Alice",
    avatar: "",
    isOnline: true,
    isSelected: true,
  },
];

const author = makePerson({ id: "author", name: "author", displayName: "Author", isOnline: false });

const FILTER_SCOPE = "with Alice, in #ops, excluding #frontend, on relay.one";
const EMPTY_SCOPE_TEXT = `No post yet ${FILTER_SCOPE}`;
const PARENT_SCOPE_SUFFIX = ', under "Parent Task".';
const RECENT_SCOPE = "from the last 7 days";
const PRIORITY_SCOPE = "at priority P4 or higher";

function renderOverlay(
  viewModel: { isHydrating?: boolean; focusedTaskId?: string | null; allTasks?: Task[] } = {},
  surface: { relays?: Relay[]; channels?: Channel[]; people?: Person[]; quickFilters?: ReturnType<typeof makeQuickFilterState> } = {}
) {
  return render(
    <FeedSurfaceProvider
      value={{
        relays: surface.relays ?? relays,
        channels: surface.channels ?? channels,
        people: surface.people ?? people,
        searchQuery: "",
        quickFilters: surface.quickFilters ?? makeQuickFilterState(),
      }}
    >
      <FeedTaskViewModelProvider
        value={{ tasks: [], allTasks: viewModel.allTasks ?? [], focusedTaskId: viewModel.focusedTaskId ?? null, isHydrating: viewModel.isHydrating }}
      >
        <FilteredEmptyState />
      </FeedTaskViewModelProvider>
    </FeedSurfaceProvider>
  );
}

describe("FilteredEmptyState overlay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the selected filtered scope summary", () => {
    renderOverlay();

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(`${EMPTY_SCOPE_TEXT}.`)).toBeInTheDocument();
  });

  it("includes the recent-days quick filter in the scope summary", () => {
    renderOverlay(
      {},
      {
        channels: [{ id: "ops", name: "ops", filterState: "neutral" }],
        people: [{ ...people[0], isSelected: false }],
        quickFilters: makeQuickFilterState({ recentEnabled: true, recentDays: 7 }),
      }
    );

    expect(screen.getByText(`No post yet on relay.one, ${RECENT_SCOPE}.`)).toBeInTheDocument();
  });

  it("includes the minimum-priority quick filter in the scope summary", () => {
    renderOverlay(
      {},
      {
        channels: [{ id: "ops", name: "ops", filterState: "neutral" }],
        people: [{ ...people[0], isSelected: false }],
        quickFilters: makeQuickFilterState({ priorityEnabled: true, minPriority: 80 }),
      }
    );

    expect(screen.getByText(`No post yet on relay.one, ${PRIORITY_SCOPE}.`)).toBeInTheDocument();
  });

  it("omits inactive quick filters from the scope summary", () => {
    renderOverlay(
      {},
      {
        channels: [{ id: "ops", name: "ops", filterState: "neutral" }],
        people: [{ ...people[0], isSelected: false }],
        quickFilters: makeQuickFilterState({ recentEnabled: false, priorityEnabled: false }),
      }
    );

    expect(screen.getByText("No post yet on relay.one.")).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(RECENT_SCOPE))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PRIORITY_SCOPE))).not.toBeInTheDocument();
  });

  it("appends immediate parent context to the scope sentence", () => {
    const parentTask = makeTask({ id: "parent", author, content: "Parent Task\nSecond line should not be shown", status: "open" });
    renderOverlay({ focusedTaskId: "parent", allTasks: [parentTask] });

    expect(screen.getByText(`${EMPTY_SCOPE_TEXT}${PARENT_SCOPE_SUFFIX}`)).toBeInTheDocument();
  });

  it("truncates long parent context at word boundaries while preserving start and end fragments", () => {
    const parentTask = makeTask({ id: "parent", author, content: "This immediate parent task title starts with a useful context chunk and keeps going until it reaches a very specific ending token ZETA-OMEGA", status: "open" });
    renderOverlay({ focusedTaskId: "parent", allTasks: [parentTask] });

    expect(screen.getByText((content) =>
      content.includes('under "This immediate parent')
      && content.includes(" ... ")
      && content.includes('ing token ZETA-OMEGA".')
    )).toBeInTheDocument();
  });

  it("does not treat umlauts as boundaries when preserving the end fragment", () => {
    const parentTask = makeTask({ id: "parent", author, content: "Context prefix that is definitely long enough to trigger truncation and ends with kontinuierlichÜbermäßigÄußerst", status: "open" });
    renderOverlay({ focusedTaskId: "parent", allTasks: [parentTask] });

    expect(screen.getByText((content) =>
      content.includes(" ... ")
      && content.includes('lichÜbermäßigÄußerst".')
    )).toBeInTheDocument();
  });

  it("renders a loading overlay when isHydrating is true", () => {
    renderOverlay({ isHydrating: true }, { relays: singleRelay, channels: [], people: [] });

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
