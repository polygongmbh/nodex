import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
      screen.getByText("Nothing posted yet in #ops, by Alice, excluding #frontend, on relay.one.")
    ).toBeInTheDocument();
    expect(screen.getByText("Broaden the scope or break the silence.")).toBeInTheDocument();
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
