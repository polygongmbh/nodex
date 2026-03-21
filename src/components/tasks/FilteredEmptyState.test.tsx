import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilteredEmptyState } from "./FilteredEmptyState";
import type { Channel, Person, Relay } from "@/types";

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

describe("FilteredEmptyState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the selected filtered scope summary", () => {
    render(
      <FilteredEmptyState
        variant="feed"
        relays={relays}
        channels={channels}
        people={people}
      />
    );

    expect(
      screen.getByText("No post yet by Alice, in #ops, excluding #frontend, on relay.one.")
    ).toBeInTheDocument();
    expect(screen.getByText("Broaden the scope or break the silence.")).toBeInTheDocument();
  });

  it("renders a scope footer sentence for non-empty filtered results", () => {
    render(
      <FilteredEmptyState
        variant="feed"
        relays={relays}
        channels={channels}
        people={people}
        mode="footer"
      />
    );

    expect(document.querySelector('[data-empty-mode="footer"]')).toBeInTheDocument();
    expect(
      screen.getByText("This is all by Alice, in #ops, excluding #frontend, on relay.one.")
    ).toBeInTheDocument();
    expect(screen.queryByText("No post yet")).not.toBeInTheDocument();
  });

  it("renders a scope footer sentence for a feed-only selection", () => {
    render(
      <FilteredEmptyState
        variant="feed"
        relays={singleRelay}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
        mode="footer"
      />
    );

    expect(screen.getByText("This is all on relay.one.")).toBeInTheDocument();
  });

  it("keeps the default feed empty screen when only a relay is selected", () => {
    render(
      <FilteredEmptyState
        variant="feed"
        relays={singleRelay}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
      />
    );

    expect(screen.getByText("Nobody here but us chickens.")).toBeInTheDocument();
    expect(screen.getByText("Be the first to post.")).toBeInTheDocument();
    expect(screen.queryByText("No post yet on relay.one.")).not.toBeInTheDocument();
  });

  it("appends immediate parent context to empty and footer scope sentences", () => {
    const parentTitle = "Parent Task\nSecond line should not be shown";
    const { rerender } = render(
      <FilteredEmptyState
        variant="feed"
        relays={relays}
        channels={channels}
        people={people}
        contextTaskTitle={parentTitle}
      />
    );

    expect(
      screen.getByText('No post yet by Alice, in #ops, excluding #frontend, on relay.one, under "Parent Task".')
    ).toBeInTheDocument();

    rerender(
      <FilteredEmptyState
        variant="feed"
        relays={relays}
        channels={channels}
        people={people}
        contextTaskTitle={parentTitle}
        mode="footer"
      />
    );

    expect(
      screen.getByText('This is all by Alice, in #ops, excluding #frontend, on relay.one, under "Parent Task".')
    ).toBeInTheDocument();
  });

  it("truncates long parent context at word boundaries while preserving start and end fragments", () => {
    const longParentTitle = "This immediate parent task title starts with a useful context chunk and keeps going until it reaches a very specific ending token ZETA-OMEGA";
    const expectedTail = longParentTitle.slice(-20);
    render(
      <FilteredEmptyState
        variant="feed"
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
        variant="feed"
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
        variant="feed"
        relays={[{ ...relays[0], connectionStatus: "connecting" }, relays[1]]}
        channels={channels}
        people={people}
      />
    );

    expect(
      screen.getByText("Loading posts by Alice, from #ops, excluding #frontend, on relay.one.")
    ).toBeInTheDocument();
    expect(screen.getByText("One calm breath while we pull this in.")).toBeInTheDocument();
  });

  it("prefers hydration copy over empty-state copy when hydration is active", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(
      <FilteredEmptyState
        variant="feed"
        relays={relays.map((relay) => ({ ...relay, isActive: true }))}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
        isHydrating
      />
    );

    expect(screen.getByText("Loading events from relay…")).toBeInTheDocument();
    expect(screen.queryByText("Nobody here but us chickens.")).not.toBeInTheDocument();
  });

  it("renders a feed error message when the selected relay is unavailable", () => {
    render(
      <FilteredEmptyState
        variant="feed"
        relays={[{ ...relays[0], connectionStatus: "connection-error" }, relays[1]]}
        channels={channels}
        people={people}
        searchQuery="urgent"
      />
    );

    expect(
      screen.getByText("Could not load posts from relay.one.")
    ).toBeInTheDocument();
    expect(screen.getByText("Unable to connect to the selected space.")).toBeInTheDocument();
    expect(screen.queryByText(/#ops/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/alice/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/#frontend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/urgent/i)).not.toBeInTheDocument();
  });

  it("renders a read-rejected subtitle when the relay denies read access", () => {
    render(
      <FilteredEmptyState
        variant="feed"
        relays={[{ ...relays[0], connectionStatus: "verification-failed" }, relays[1]]}
        channels={channels}
        people={people}
      />
    );

    expect(screen.getByText("Could not load posts from relay.one.")).toBeInTheDocument();
    expect(screen.getByText("Read access was rejected by the selected space.")).toBeInTheDocument();
  });

  it("renders the playful unfiltered feed message", () => {
    render(
      <FilteredEmptyState
        variant="feed"
        relays={relays.map((relay) => ({ ...relay, isActive: true }))}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
      />
    );

    expect(screen.getByText("Nobody here but us chickens.")).toBeInTheDocument();
    expect(screen.getByText("Be the first to post.")).toBeInTheDocument();
  });

  it("renders a randomized unfiltered collection message", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(
      <FilteredEmptyState
        variant="collection"
        relays={relays.map((relay) => ({ ...relay, isActive: true }))}
        channels={[{ id: "ops", name: "ops", filterState: "neutral" }]}
        people={[{ ...people[0], isSelected: false }]}
      />
    );

    expect(screen.getByText("Silence lives here for now. Leave the first trace.")).toBeInTheDocument();
  });
});
