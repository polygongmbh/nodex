import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { useIndexDerivedData } from "./use-index-derived-data";
import { useIndexFilters } from "./use-index-filters";
import { useFeedTaskMutationStore } from "@/features/feed-page/stores/feed-task-mutation-store";
import type { CachedNostrEvent } from "@/infrastructure/nostr/event-cache";
import type { PersonFrecencyState } from "@/lib/person-frecency";
import { makePerson, makeRelay, makeTask } from "@/test/fixtures";
import type { Relay } from "@/types";
import type { Person } from "@/types/person";
import type { FeedInteractionHandlerMap, FeedInteractionPipelineApi } from "@/features/feed-page/interactions/feed-interaction-pipeline";
import type { FeedInteractionIntent, FeedInteractionIntentType } from "@/features/feed-page/interactions/feed-interaction-intent";
import { NostrEventKind } from "@/lib/nostr/types";
import type { NDKUser } from "@/infrastructure/nostr/ndk-context";

const mockApi: FeedInteractionPipelineApi = {
  dispatch: () => Promise.resolve({ envelope: { id: 0, dispatchedAtMs: 0, intent: { type: "ui.openGuide" } }, outcome: { status: "handled" } }),
  dispatchBatch: () => Promise.resolve([]),
};

function callHandler(handlers: FeedInteractionHandlerMap, intent: FeedInteractionIntent) {
  const handler = handlers[intent.type as FeedInteractionIntentType] as
    | ((intent: FeedInteractionIntent, api: FeedInteractionPipelineApi) => void)
    | undefined;
  handler?.(intent, mockApi);
}

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
  const [searchQuery] = useState("");
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(new Set(["relay-one"]));
  const relaysWithActiveState = relays.map((relay) => ({
    ...relay,
    isActive: activeRelayIds.has(relay.id),
  }));

  const derived = useIndexDerivedData({
    nostrEvents,
    demoTasks: [],
    people,
    latestPresenceByAuthor: new Map(),
    cachedKind0Events: [],
    user: null,
    effectiveActiveRelayIds: activeRelayIds,
    relays: relaysWithActiveState,
    channelFrecencyState: {},
    personFrecencyState: {},
    isHydrating: false,
  });

  const filters = useIndexFilters({
    relays: relaysWithActiveState,
    activeRelayIds,
    setActiveRelayIds,
    channels: derived.channels,
    composeChannels: derived.composeChannels,
    people,
    setPeople,
    sidebarPeople: [],
  });

  const composeIncludedChannels = filters.composeChannelsWithState
    .filter((channel) => channel.filterState === "included")
    .map((channel) => channel.name)
    .join(",");

  return (
    <>
      <button onClick={() => filters.toggleChannel("ops")}>ToggleOps</button>
      <button onClick={() => setActiveRelayIds(new Set(["relay-one"]))}>RelayOne</button>
      <button onClick={() => setActiveRelayIds(new Set(["relay-two"]))}>SwitchRelay</button>
      <button onClick={() => callHandler(filters.handlers, { type: "filter.applyHashtagExclusive", tag: "urgent" })}>HashtagExclusive</button>
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
    useFeedTaskMutationStore.setState({
      localTasks: [],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });
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

  it("keeps chip-added channels scoped to the relay they were added from", () => {
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "RelayOne" }));
    fireEvent.click(screen.getByRole("button", { name: "HashtagExclusive" }));

    expect(screen.getByTestId("compose-channel-names")).toHaveTextContent("ops");
    expect(screen.getByTestId("compose-channel-names")).toHaveTextContent("urgent");

    fireEvent.click(screen.getByRole("button", { name: "SwitchRelay" }));

    expect(screen.getByTestId("compose-channel-names")).toHaveTextContent("general");
    expect(screen.getByTestId("compose-channel-names")).not.toHaveTextContent("urgent");
  });
});

function SidebarPeopleHarness() {
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(new Set(["relay-one"]));
  const [personFrecencyState, setPersonFrecencyState] = useState<PersonFrecencyState>({});

  const alice = makePerson({ id: "alice", name: "alice", displayName: "Alice" });
  const bob = makePerson({ id: "bob", name: "bob", displayName: "Bob" });
  const tasks = [
    makeTask({ id: "a1", author: alice, tags: ["ops"], relays: ["relay-one"] }),
    makeTask({ id: "a2", author: alice, tags: ["ops"], relays: ["relay-one"] }),
    makeTask({ id: "a3", author: alice, tags: ["ops"], relays: ["relay-one"] }),
    makeTask({ id: "b1", author: bob, tags: ["general"], relays: ["relay-two"] }),
    makeTask({ id: "b2", author: bob, tags: ["general"], relays: ["relay-two"] }),
    makeTask({ id: "b3", author: bob, tags: ["general"], relays: ["relay-two"] }),
  ];

  const derived = useIndexDerivedData({
    nostrEvents: [],
    demoTasks: [],
    people: [alice, bob],
    latestPresenceByAuthor: new Map(),
    cachedKind0Events: [],
    user: null,
    effectiveActiveRelayIds: activeRelayIds,
    relays,
    channelFrecencyState: {},
    personFrecencyState,
    isHydrating: false,
  });

  return (
    <>
      <button onClick={() => setActiveRelayIds(new Set(["relay-two"]))}>SwitchRelay</button>
      <button
        onClick={() =>
          setPersonFrecencyState({
            alice: { score: 2, lastInteractedAt: Date.now() },
          })
        }
      >
        RefreshAlice
      </button>
      <output data-testid="sidebar-people-ids">
        {derived.sidebarPeople.map((person) => person.id).join(",")}
      </output>
    </>
  );
}

describe("useIndexDerivedData sidebar people", () => {
  beforeEach(() => {
    window.localStorage.clear();
    const alice = makePerson({ id: "alice", name: "alice", displayName: "Alice" });
    const bob = makePerson({ id: "bob", name: "bob", displayName: "Bob" });
    useFeedTaskMutationStore.setState({
      localTasks: [
        makeTask({ id: "a1", author: alice, tags: ["ops"], relays: ["relay-one"] }),
        makeTask({ id: "a2", author: alice, tags: ["ops"], relays: ["relay-one"] }),
        makeTask({ id: "a3", author: alice, tags: ["ops"], relays: ["relay-one"] }),
        makeTask({ id: "b1", author: bob, tags: ["general"], relays: ["relay-two"] }),
        makeTask({ id: "b2", author: bob, tags: ["general"], relays: ["relay-two"] }),
        makeTask({ id: "b3", author: bob, tags: ["general"], relays: ["relay-two"] }),
      ],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });
  });

  it("derives frequent people from the active relay scope", () => {
    render(
      <MemoryRouter>
        <SidebarPeopleHarness />
      </MemoryRouter>
    );

    expect(screen.getByTestId("sidebar-people-ids")).toHaveTextContent("alice");
    expect(screen.getByTestId("sidebar-people-ids")).not.toHaveTextContent("bob");

    fireEvent.click(screen.getByRole("button", { name: "SwitchRelay" }));

    expect(screen.getByTestId("sidebar-people-ids")).toHaveTextContent("bob");
    expect(screen.getByTestId("sidebar-people-ids")).not.toHaveTextContent("alice");
  });

  it("does not let person frecency keep out-of-scope people visible after switching relays", () => {
    render(
      <MemoryRouter>
        <SidebarPeopleHarness />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "SwitchRelay" }));
    expect(screen.getByTestId("sidebar-people-ids")).toHaveTextContent("bob");
    expect(screen.getByTestId("sidebar-people-ids")).not.toHaveTextContent("alice");

    fireEvent.click(screen.getByRole("button", { name: "RefreshAlice" }));

    expect(screen.getByTestId("sidebar-people-ids")).toHaveTextContent("bob");
    expect(screen.getByTestId("sidebar-people-ids")).not.toHaveTextContent("alice");
  });
});

describe("useIndexDerivedData current user profile metadata", () => {
  it("treats a signed-in guest with local name and displayName as already having profile metadata", () => {
    const guestUser: Partial<NDKUser> = {
      pubkey: "a".repeat(64),
      npub: "npub1guest",
      profile: {
        name: "guest-user",
        displayName: "Guest User",
      },
    };

    const { result } = renderHook(() =>
      useIndexDerivedData({
        nostrEvents: [],
        demoTasks: [],
        people: [],
        latestPresenceByAuthor: new Map(),
        cachedKind0Events: [],
        user: guestUser as NDKUser,
        effectiveActiveRelayIds: new Set(["relay-one"]),
        relays,
        channelFrecencyState: {},
        personFrecencyState: {},
        isHydrating: false,
      })
    );

    expect(result.current.hasCurrentUserProfileMetadata).toBe(true);
  });

  it("keeps requiring metadata when the current user lacks required local profile fields and cache", () => {
    const guestUser: Partial<NDKUser> = {
      pubkey: "b".repeat(64),
      npub: "npub1incomplete",
      profile: {
        displayName: "Only Display Name",
      },
    };

    const { result } = renderHook(() =>
      useIndexDerivedData({
        nostrEvents: [],
        demoTasks: [],
        people: [],
        latestPresenceByAuthor: new Map(),
        cachedKind0Events: [],
        user: guestUser as NDKUser,
        effectiveActiveRelayIds: new Set(["relay-one"]),
        relays,
        channelFrecencyState: {},
        personFrecencyState: {},
        isHydrating: false,
      })
    );

    expect(result.current.hasCurrentUserProfileMetadata).toBe(false);
  });

  it("still treats cached kind-0 metadata as sufficient when local profile fields are absent", () => {
    const pubkey = "c".repeat(64);
    const guestUser: Partial<NDKUser> = {
      pubkey,
      npub: "npub1cached",
      profile: {},
    };

    const { result } = renderHook(() =>
      useIndexDerivedData({
        nostrEvents: [],
        demoTasks: [],
        people: [],
        latestPresenceByAuthor: new Map(),
        cachedKind0Events: [
          {
            kind: NostrEventKind.Metadata,
            pubkey,
            created_at: 1,
            content: JSON.stringify({ name: "cached", displayName: "Cached User" }),
          },
        ],
        user: guestUser as NDKUser,
        effectiveActiveRelayIds: new Set(["relay-one"]),
        relays,
        channelFrecencyState: {},
        personFrecencyState: {},
        isHydrating: false,
      })
    );

    expect(result.current.hasCurrentUserProfileMetadata).toBe(true);
  });
});

function MentionAutocompleteHarness() {
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(new Set(["relay-one"]));

  const alice = makePerson({ id: "a".repeat(64), name: "alice", displayName: "Alice" });
  const bobPubkey = "b".repeat(64);
  const carol = makePerson({ id: "c".repeat(64), name: "carol", displayName: "Carol" });

  const derived = useIndexDerivedData({
    nostrEvents,
    demoTasks: [],
    people: [alice, carol],
    latestPresenceByAuthor: new Map(),
    cachedKind0Events: [
      {
        kind: 0,
        pubkey: bobPubkey,
        created_at: 5,
        content: JSON.stringify({ name: "bob", displayName: "Bob", nip05: "bob@example.com" }),
      },
    ],
    user: null,
    effectiveActiveRelayIds: activeRelayIds,
    relays,
    channelFrecencyState: {},
    personFrecencyState: {},
    isHydrating: false,
  });

  return (
    <>
      <button onClick={() => setActiveRelayIds(new Set(["relay-two"]))}>SwitchRelay</button>
      <output data-testid="mention-autocomplete-people-ids">
        {derived.mentionAutocompletePeople.map((person) => person.id).join(",")}
      </output>
    </>
  );
}

describe("useIndexDerivedData mention autocomplete people", () => {
  it("combines active-scope message authors with active-scope cached kind0 profiles", () => {
    render(
      <MemoryRouter>
        <MentionAutocompleteHarness />
      </MemoryRouter>
    );

    expect(screen.getByTestId("mention-autocomplete-people-ids")).toHaveTextContent("a".repeat(64));
    expect(screen.getByTestId("mention-autocomplete-people-ids")).toHaveTextContent("b".repeat(64));
    expect(screen.getByTestId("mention-autocomplete-people-ids")).not.toHaveTextContent("c".repeat(64));

    fireEvent.click(screen.getByRole("button", { name: "SwitchRelay" }));

    expect(screen.getByTestId("mention-autocomplete-people-ids")).toHaveTextContent("c".repeat(64));
    expect(screen.getByTestId("mention-autocomplete-people-ids")).not.toHaveTextContent("a".repeat(64));
    expect(screen.getByTestId("mention-autocomplete-people-ids")).toHaveTextContent("b".repeat(64));
  });
});
