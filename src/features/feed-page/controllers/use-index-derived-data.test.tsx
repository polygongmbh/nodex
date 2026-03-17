import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { TFunction } from "i18next";
import { MemoryRouter } from "react-router-dom";
import { useIndexDerivedData } from "./use-index-derived-data";
import { useIndexFilters } from "./use-index-filters";
import type { CachedNostrEvent } from "@/infrastructure/nostr/event-cache";
import { makeRelay } from "@/test/fixtures";
import type { Person, Relay } from "@/types";

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

const relays: Relay[] = [
  makeRelay({ id: "relay-one", name: "Relay One", url: "wss://relay.one", isActive: true }),
  makeRelay({ id: "relay-two", name: "Relay Two", url: "wss://relay.two", isActive: true }),
];

const nostrEvents: CachedNostrEvent[] = [
  {
    id: "event-one",
    pubkey: "a".repeat(64),
    created_at: 1,
    kind: 1,
    tags: [["t", "ops"]],
    content: "#ops",
    sig: "b".repeat(128),
    relayUrl: "wss://relay.one",
    relayUrls: ["wss://relay.one"],
  },
  {
    id: "event-two",
    pubkey: "c".repeat(64),
    created_at: 2,
    kind: 1,
    tags: [["t", "general"]],
    content: "#general",
    sig: "d".repeat(128),
    relayUrl: "wss://relay.two",
    relayUrls: ["wss://relay.two"],
  },
];

function Harness() {
  const [people, setPeople] = useState<Person[]>([]);
  const [postedTags, setPostedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(new Set(["relay-one"]));

  const derived = useIndexDerivedData({
    nostrEvents,
    localTasks: [],
    postedTags,
    suppressedNostrEventIds: new Set(),
    people,
    supplementalLatestActivityByAuthor: new Map(),
    cachedKind0Events: [],
    user: null,
    effectiveActiveRelayIds: activeRelayIds,
    relays,
    channelFrecencyState: {},
    isHydrating: false,
  });

  const filters = useIndexFilters({
    relays,
    setActiveRelayIds,
    channels: derived.channels,
    composeChannels: derived.composeChannels,
    postedTags,
    setPostedTags,
    people,
    setPeople,
    sidebarPeople: [],
    isMobile: false,
    setSearchQuery,
    bumpChannelFrecency: vi.fn(),
    t: ((key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key) as unknown as TFunction,
  });

  const composeIncludedChannels = filters.composeChannelsWithState
    .filter((channel) => channel.filterState === "included")
    .map((channel) => channel.name)
    .join(",");

  return (
    <>
      <button onClick={() => filters.handleChannelToggle("ops")}>ToggleOps</button>
      <button onClick={() => setActiveRelayIds(new Set(["relay-two"]))}>SwitchRelay</button>
      <output data-testid="search-query">{searchQuery}</output>
      <output data-testid="compose-channel-names">
        {filters.composeChannelsWithState.map((channel) => channel.name).join(",")}
      </output>
      <output data-testid="compose-included-channel-names">{composeIncludedChannels}</output>
    </>
  );
}

describe("useIndexDerivedData compose channels", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("drops relay-scoped compose channels when switching to a relay where they do not exist", () => {
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    );

    expect(screen.getByTestId("compose-channel-names")).toHaveTextContent("ops");

    fireEvent.click(screen.getByRole("button", { name: "ToggleOps" }));
    expect(screen.getByTestId("compose-included-channel-names")).toHaveTextContent("ops");

    fireEvent.click(screen.getByRole("button", { name: "SwitchRelay" }));

    expect(screen.getByTestId("compose-channel-names")).toHaveTextContent("general");
    expect(screen.getByTestId("compose-channel-names")).not.toHaveTextContent("ops");
    expect(screen.getByTestId("compose-included-channel-names")).toHaveTextContent("");
  });
});
