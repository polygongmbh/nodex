import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMemo, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { useMentionAutocompletePeople } from "./use-mention-autocomplete-people";
import { useAllPosts } from "./use-all-posts";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { __resetPostsStoreForTests } from "@/features/feed-page/stores/posts-store";
import { ingestPostEvent } from "@/infrastructure/nostr/post-event-ingest";
import { resolveChannelRelayScopeIds } from "@/domain/relays/relay-scope";
import { NostrEventKind, type NostrEvent, type NostrEventWithRelay } from "@/lib/nostr/types";
import { makePerson, makeRelay } from "@/test/fixtures";
import type { Relay } from "@/types";

const relays: Relay[] = [
  makeRelay({ id: "relay-one", name: "Relay One", url: "wss://relay.one", isActive: true }),
  makeRelay({ id: "relay-two", name: "Relay Two", url: "wss://relay.two", isActive: true }),
];

const nostrEvents: NostrEventWithRelay[] = [
  {
    id: "event-one",
    pubkey: "a".repeat(64),
    created_at: 1,
    kind: 1,
    tags: [["t", "ops"]],
    content: "#ops",
    sig: "b".repeat(128),
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
    relayUrls: ["wss://relay.two"],
  },
];

function seedNostrEventsStore(events: NostrEventWithRelay[]): void {
  __resetPostsStoreForTests();
  for (const event of events) ingestPostEvent(event);
}

function MentionAutocompleteHarness() {
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(new Set(["relay-one"]));

  const alice = makePerson({ pubkey: "a".repeat(64), name: "alice", displayName: "Alice" });
  const bobPubkey = "b".repeat(64);
  const carol = makePerson({ pubkey: "c".repeat(64), name: "carol", displayName: "Carol" });

  const allTasks = useAllPosts({
    demoTasks: [],
    isHydrating: false,
    hasLiveHydratedScope: false,
  });
  const allRelayIds = useMemo(() => relays.map((relay) => relay.id), []);
  const scopedPosts = useMemo(() => {
    const scopeIds = resolveChannelRelayScopeIds(activeRelayIds, allRelayIds);
    return allTasks.filter(
      (task) =>
        task.relays.length === 0 ||
        task.relays.some((relayId) => scopeIds.has(relayId))
    );
  }, [allTasks, activeRelayIds, allRelayIds]);

  const mentionAutocompletePeople = useMentionAutocompletePeople({
    scopedPosts,
    cachedKind0Events: [
      {
        kind: NostrEventKind.Metadata,
        pubkey: bobPubkey,
        created_at: 5,
        content: JSON.stringify({ name: "bob", displayName: "Bob", nip05: "bob@example.com" }),
      } as NostrEvent,
    ],
    people: [alice, carol],
  });

  return (
    <>
      <button onClick={() => setActiveRelayIds(new Set(["relay-two"]))}>SwitchRelay</button>
      <output data-testid="mention-autocomplete-people-ids">
        {mentionAutocompletePeople.map((person) => person.pubkey).join(",")}
      </output>
    </>
  );
}

describe("useMentionAutocompletePeople", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTaskMutationStore.setState({
      localTasks: [],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });
    seedNostrEventsStore(nostrEvents);
  });

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
