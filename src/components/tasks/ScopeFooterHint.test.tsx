import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScopeFooterHint } from "./ScopeFooterHint";
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
const FOOTER_SCOPE_TEXT = `This is all ${FILTER_SCOPE}`;
const PARENT_SCOPE_SUFFIX = ', under "Parent Task".';
const RECENT_SCOPE = "from the last 7 days";
const PRIORITY_SCOPE = "at priority P4 or higher";

function renderHint(
  viewModel: { focusedTaskId?: string | null; allTasks?: Task[] } = {},
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
        value={{ tasks: [], allTasks: viewModel.allTasks ?? [], focusedTaskId: viewModel.focusedTaskId ?? null }}
      >
        <ScopeFooterHint />
      </FeedTaskViewModelProvider>
    </FeedSurfaceProvider>
  );
}

describe("ScopeFooterHint", () => {
  it("renders a scope footer sentence when a scope is selected", () => {
    renderHint();

    expect(screen.getByText(`${FOOTER_SCOPE_TEXT}.`)).toBeInTheDocument();
    expect(screen.queryByText("No post yet")).not.toBeInTheDocument();
  });

  it("renders for a single-relay selection", () => {
    renderHint(
      {},
      { relays: singleRelay, channels: [{ id: "ops", name: "ops", filterState: "neutral" }], people: [{ ...people[0], isSelected: false }] }
    );

    expect(screen.getByText("This is all on relay.one.")).toBeInTheDocument();
  });

  it("includes both quick filters in the footer scope sentence", () => {
    renderHint(
      {},
      {
        relays: singleRelay,
        channels: [{ id: "ops", name: "ops", filterState: "neutral" }],
        people: [{ ...people[0], isSelected: false }],
        quickFilters: makeQuickFilterState({ recentEnabled: true, recentDays: 7, priorityEnabled: true, minPriority: 80 }),
      }
    );

    expect(screen.getByText(`This is all on relay.one, ${RECENT_SCOPE}, ${PRIORITY_SCOPE}.`)).toBeInTheDocument();
  });

  it("appends parent context to the footer scope sentence", () => {
    const parentTask = makeTask({ id: "parent", author, content: "Parent Task\nSecond line should not be shown", status: "open" });
    renderHint({ focusedTaskId: "parent", allTasks: [parentTask] });

    expect(screen.getByText(`${FOOTER_SCOPE_TEXT}${PARENT_SCOPE_SUFFIX}`)).toBeInTheDocument();
  });

  it("truncates long parent context in the footer scope sentence", () => {
    const parentTask = makeTask({ id: "parent", author, content: "This immediate parent task title starts with a useful context chunk and keeps going until it reaches a very specific ending token ZETA-OMEGA", status: "open" });
    renderHint({ focusedTaskId: "parent", allTasks: [parentTask] });

    expect(screen.getByText((content) =>
      content.includes('under "This immediate parent')
      && content.includes(" ... ")
      && content.includes('ing token ZETA-OMEGA".')
    )).toBeInTheDocument();
  });

  it("renders nothing when no scope is selected", () => {
    const { container } = renderHint({}, { relays: [], channels: [], people: [] });

    expect(container.firstChild).toBeNull();
  });
});
