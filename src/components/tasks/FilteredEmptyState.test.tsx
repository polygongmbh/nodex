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
      screen.getByText("No post yet in #ops, by Alice, excluding #frontend, on relay.one.")
    ).toBeInTheDocument();
    expect(screen.getByText("Broaden the scope or break the silence.")).toBeInTheDocument();
  });

  it("renders a loading message and easter egg subtitle while the selected relay is connecting", () => {
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
      screen.getByText("Loading posts from #ops, by Alice, excluding #frontend, on relay.one.")
    ).toBeInTheDocument();
    expect(screen.getByText("How about a glance out of the window?")).toBeInTheDocument();
  });

  it("renders a feed error message when the selected relay is unavailable", () => {
    render(
      <FilteredEmptyState
        variant="feed"
        relays={[{ ...relays[0], connectionStatus: "connection-error" }, relays[1]]}
        channels={channels}
        people={people}
      />
    );

    expect(
      screen.getByText("Could not load posts in #ops, by Alice, excluding #frontend, on relay.one.")
    ).toBeInTheDocument();
    expect(screen.getByText("Check the selected feed and try again.")).toBeInTheDocument();
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
});
