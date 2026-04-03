import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilteredEmptyState } from "./FilteredEmptyState";
import type { Channel, Person, Relay } from "@/types";
import { makeQuickFilterState } from "@/test/quick-filter-state";

const relays: Relay[] = [
  {
    id: "relay-one",
    name: "Relay One",
    url: "wss://relay.one",
    icon: "R",
    isActive: true,
    connectionStatus: "connected",
  },
  {
    id: "relay-two",
    name: "Relay Two",
    url: "wss://relay.two",
    icon: "R",
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

const FILTER_SCOPE = "by Alice, in #ops, excluding #frontend, on relay.one";
const EMPTY_SCOPE_TEXT = `No post yet ${FILTER_SCOPE}`;
const FOOTER_SCOPE_TEXT = `This is all ${FILTER_SCOPE}`;
const MOBILE_SCOPE_TEXT = `Nothing yet ${FILTER_SCOPE}, showing everything.`;
const PARENT_SCOPE_SUFFIX = ', under "Parent Task".';
const RECENT_SCOPE = "from the last 7 days";
const PRIORITY_SCOPE = "at priority P4 or higher";

describe("FilteredEmptyState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the selected filtered scope summary", () => {
    render(
      <FilteredEmptyState
        relays={relays}
        channels={channels}
        people={people}
      />
    );

    expect(screen.getByText(`${EMPTY_SCOPE_TEXT}.`)).toBeInTheDocument();
  });

  it("includes the recent-days quick filter in the empty-state scope summary", () => {
    render(
      <FilteredEmptyState
        relays={relays}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
        quickFilters={makeQuickFilterState({ recentEnabled: true, recentDays: 7 })}
      />
    );

    expect(screen.getByText(`No post yet on relay.one, ${RECENT_SCOPE}.`)).toBeInTheDocument();
  });

  it("includes the minimum-priority quick filter in the empty-state scope summary", () => {
    render(
      <FilteredEmptyState
        relays={relays}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
        quickFilters={makeQuickFilterState({ priorityEnabled: true, minPriority: 80 })}
      />
    );

    expect(screen.getByText(`No post yet on relay.one, ${PRIORITY_SCOPE}.`)).toBeInTheDocument();
  });

  it("renders a scope footer sentence for non-empty filtered results", () => {
    render(
      <FilteredEmptyState
        relays={relays}
        channels={channels}
        people={people}
        mode="footer"
      />
    );

    expect(document.querySelector('[data-empty-mode="footer"]')).toBeInTheDocument();
    expect(screen.getByText(`${FOOTER_SCOPE_TEXT}.`)).toBeInTheDocument();
    expect(screen.queryByText("No post yet")).not.toBeInTheDocument();
  });

  it("renders a scope footer sentence for a feed-only selection", () => {
    render(
      <FilteredEmptyState
        relays={singleRelay}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
        mode="footer"
      />
    );

    expect(screen.getByText("This is all on relay.one.")).toBeInTheDocument();
  });

  it("includes both quick filters in the footer scope sentence", () => {
    render(
      <FilteredEmptyState
        relays={singleRelay}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
        quickFilters={makeQuickFilterState({
          recentEnabled: true,
          recentDays: 7,
          priorityEnabled: true,
          minPriority: 80,
        })}
        mode="footer"
      />
    );

    expect(screen.getByText(`This is all on relay.one, ${RECENT_SCOPE}, ${PRIORITY_SCOPE}.`)).toBeInTheDocument();
  });

  it("renders a scoped mobile fallback hint when filtered content is empty", () => {
    render(
      <FilteredEmptyState
        relays={relays}
        channels={channels}
        people={people}
        mode="mobile"
      />
    );

    expect(document.querySelector('[data-empty-mode="mobile"]')).toBeInTheDocument();
    expect(screen.getByText(MOBILE_SCOPE_TEXT)).toBeInTheDocument();
  });

  it("renders overlay scope copy with the larger overlay type scale", () => {
    render(
      <FilteredEmptyState
        relays={relays}
        channels={channels}
        people={people}
        mode="overlay"
      />
    );

    const overlay = document.querySelector('[data-empty-mode="overlay"]');
    expect(overlay).toBeInTheDocument();
    expect(screen.getByText(`${EMPTY_SCOPE_TEXT}.`)).toBeInTheDocument();
    expect(screen.getByText(`${EMPTY_SCOPE_TEXT}.`).className).toContain("text-base");
  });

  it("omits inactive quick filters from the scope summary", () => {
    render(
      <FilteredEmptyState
        relays={relays}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
        quickFilters={makeQuickFilterState({ recentEnabled: false, priorityEnabled: false })}
      />
    );

    expect(screen.getByText("No post yet on relay.one.")).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(RECENT_SCOPE))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PRIORITY_SCOPE))).not.toBeInTheDocument();
  });

  it("appends immediate parent context to empty and footer scope sentences", () => {
    const parentTitle = "Parent Task\nSecond line should not be shown";
    const { rerender } = render(
      <FilteredEmptyState
        relays={relays}
        channels={channels}
        people={people}
        contextTaskTitle={parentTitle}
      />
    );

    expect(screen.getByText(`${EMPTY_SCOPE_TEXT}${PARENT_SCOPE_SUFFIX}`)).toBeInTheDocument();

    rerender(
      <FilteredEmptyState
        relays={relays}
        channels={channels}
        people={people}
        contextTaskTitle={parentTitle}
        mode="footer"
      />
    );

    expect(screen.getByText(`${FOOTER_SCOPE_TEXT}${PARENT_SCOPE_SUFFIX}`)).toBeInTheDocument();
  });

  it("truncates long parent context at word boundaries while preserving start and end fragments", () => {
    const longParentTitle = "This immediate parent task title starts with a useful context chunk and keeps going until it reaches a very specific ending token ZETA-OMEGA";
    const expectedTail = longParentTitle.slice(-20);
    render(
      <FilteredEmptyState
        relays={relays}
        channels={channels}
        people={people}
        contextTaskTitle={longParentTitle}
        mode="footer"
      />
    );

    expect(screen.getByText((content) =>
      content.includes('under "This immediate parent')
      && content.includes(" ... ")
      && content.includes(`${expectedTail}".`)
    )).toBeInTheDocument();
  });

  it("does not treat umlauts as boundaries when preserving the end fragment", () => {
    const umlautEndingTitle = "Context prefix that is definitely long enough to trigger truncation and ends with kontinuierlichÜbermäßigÄußerst";
    const expectedTail = umlautEndingTitle.slice(-20);
    render(
      <FilteredEmptyState
        relays={relays}
        channels={channels}
        people={people}
        contextTaskTitle={umlautEndingTitle}
        mode="footer"
      />
    );

    expect(screen.getByText((content) =>
      content.includes(" ... ")
      && content.includes(`${expectedTail}".`)
    )).toBeInTheDocument();
  });

  it("renders a loading message and waiting prompt subtitle while the selected relay is connecting", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(
      <FilteredEmptyState
        relays={[{ ...relays[0], connectionStatus: "connecting" }, relays[1]]}
        channels={channels}
        people={people}
      />
    );

    expect(screen.getByText("Loading posts by Alice, from #ops, excluding #frontend, on relay.one.")).toBeInTheDocument();
    expect(screen.getByText("One calm breath while we pull this in.")).toBeInTheDocument();
  });

  it("prefers hydration copy over empty-state copy when hydration is active", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(
      <FilteredEmptyState
        relays={relays.map((relay) => ({ ...relay, isActive: true }))}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
        isHydrating
      />
    );

    expect(screen.getByText("Loading events from relay…")).toBeInTheDocument();
    expect(screen.queryByText("Silence lives here for now. Leave the first trace.")).not.toBeInTheDocument();
  });

  it("renders a rotating poetic empty-state line when unfiltered content is empty", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(
      <FilteredEmptyState
        relays={relays.map((relay) => ({ ...relay, isActive: true }))}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
      />
    );

    expect(screen.getByText("Silence lives here for now. Leave the first trace.")).toBeInTheDocument();
  });

  it("renders an error message when the selected relay is unavailable", () => {
    render(
      <FilteredEmptyState
        relays={[{ ...relays[0], connectionStatus: "connection-error" }, relays[1]]}
        channels={channels}
        people={people}
        searchQuery="urgent"
      />
    );

    expect(screen.getByText("Could not load posts from relay.one.")).toBeInTheDocument();
    expect(screen.getByText("Unable to connect to the selected space.")).toBeInTheDocument();
    expect(screen.queryByText(/#ops/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/alice/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/#frontend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/urgent/i)).not.toBeInTheDocument();
  });

  it("renders a read-rejected subtitle when the relay denies read access", () => {
    render(
      <FilteredEmptyState
        relays={[{ ...relays[0], connectionStatus: "verification-failed" }, relays[1]]}
        channels={channels}
        people={people}
      />
    );

    expect(screen.getByText("Could not load posts from relay.one.")).toBeInTheDocument();
    expect(screen.getByText("Read access was rejected by the selected space.")).toBeInTheDocument();
  });

});
