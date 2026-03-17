import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useIndexFilters } from "./use-index-filters";
import { useRelayFilterState } from "@/features/feed-page/controllers/use-relay-filter-state";
import { makeChannel, makePerson, makeRelay } from "@/test/fixtures";
import type { Channel, Person, Relay } from "@/types";

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

const relays: Relay[] = [
  makeRelay({ id: "relay-one", name: "Relay One", isActive: false, connectionStatus: "connected", url: "wss://relay.one" }),
  makeRelay({ id: "relay-two", name: "Relay Two", isActive: false, connectionStatus: "connected", url: "wss://relay.two" }),
];

const channels: Channel[] = [
  makeChannel({ id: "general", name: "general" }),
  makeChannel({ id: "ops", name: "ops" }),
];

const peopleSeed: Person[] = [
  makePerson({ id: "alice", name: "alice", displayName: "Alice" }),
  makePerson({ id: "bob", name: "bob", displayName: "Bob" }),
];

function Harness({
  isMobile = false,
}: {
  isMobile?: boolean;
}) {
  const [people, setPeople] = useState<Person[]>(peopleSeed);
  const [searchQuery, setSearchQuery] = useState("");
  const [postedTags, setPostedTags] = useState<string[]>([]);
  const relayState = useRelayFilterState({
    relays,
    defaultRelayIds: [],
    t: ((key: string) => key) as unknown as TFunction,
  });
  const filters = useIndexFilters({
    relays,
    setActiveRelayIds: relayState.setActiveRelayIds,
    channels,
    composeChannels: channels,
    postedTags,
    setPostedTags,
    people,
    setPeople,
    sidebarPeople: people,
    isMobile,
    setSearchQuery,
    bumpChannelFrecency: vi.fn(),
    t: ((key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key) as unknown as TFunction,
  });

  return (
    <>
      <button onClick={() => relayState.handleRelayExclusive("relay-one")}>RelayExclusive</button>
      <button onClick={() => filters.handleChannelToggle("general")}>ChannelToggle</button>
      <button onClick={() => filters.handleChannelMatchModeChange("or")}>ModeOr</button>
      <button onClick={() => filters.handlePersonExclusive("alice")}>PersonExclusive</button>
      <button onClick={() => filters.handleHashtagExclusive("urgent")}>HashtagExclusive</button>
      <button onClick={() => filters.handleAuthorClick(makePerson({ id: "alice", name: "alice", displayName: "Alice" }))}>
        AuthorClick
      </button>
      <button onClick={filters.resetFiltersToDefault}>Reset</button>
      <output data-testid="relay-ids">{Array.from(relayState.effectiveActiveRelayIds).sort().join(",")}</output>
      <output data-testid="channel-state-general">
        {filters.channelFilterStates.get("general") || "neutral"}
      </output>
      <output data-testid="channel-state-urgent">
        {filters.channelFilterStates.get("urgent") || "neutral"}
      </output>
      <output data-testid="channel-match-mode">{filters.channelMatchMode}</output>
      <output data-testid="selected-people">
        {people.filter((person) => person.isSelected).map((person) => person.id).join(",")}
      </output>
      <output data-testid="posted-tags">{postedTags.join(",")}</output>
      <output data-testid="mention-request">{filters.mentionRequest?.mention ?? ""}</output>
      <output data-testid="search-query">{searchQuery}</output>
    </>
  );
}

function renderHarness(options?: { isMobile?: boolean }) {
  return render(
    <MemoryRouter>
      <Harness {...options} />
    </MemoryRouter>
  );
}

describe("useIndexFilters", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("adds a missing hashtag to postedTags and applies an exclusive channel filter", () => {
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "HashtagExclusive" }));

    expect(screen.getByTestId("posted-tags")).toHaveTextContent("urgent");
    expect(screen.getByTestId("channel-state-urgent")).toHaveTextContent("included");
    expect(screen.getByTestId("channel-state-general")).toHaveTextContent("neutral");
  });

  it("selects the clicked author and queues a mention request on mobile", () => {
    renderHarness({ isMobile: true });

    fireEvent.click(screen.getByRole("button", { name: "AuthorClick" }));

    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");
    expect(screen.getByTestId("mention-request")).toHaveTextContent("@alice");
    expect(screen.getByTestId("search-query")).toHaveTextContent("@alice");
  });

  it("resets relay, channel, people, and match-mode filters to defaults", () => {
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "RelayExclusive" }));
    fireEvent.click(screen.getByRole("button", { name: "ChannelToggle" }));
    fireEvent.click(screen.getByRole("button", { name: "ModeOr" }));
    fireEvent.click(screen.getByRole("button", { name: "PersonExclusive" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByTestId("relay-ids")).toHaveTextContent("relay-one,relay-two");
    expect(screen.getByTestId("channel-state-general")).toHaveTextContent("neutral");
    expect(screen.getByTestId("channel-match-mode")).toHaveTextContent("and");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("");
  });
});
