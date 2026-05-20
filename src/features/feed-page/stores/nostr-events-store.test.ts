import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NostrEventWithRelay } from "@/lib/nostr/types";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  ingestNostrEvent,
  getNostrEvents,
  getNostrEventsVersion,
  subscribeToNostrEvents,
  __resetNostrEventsStoreForTests,
} from "./nostr-events-store";

function makeEvent(overrides: Partial<NostrEventWithRelay> = {}): NostrEventWithRelay {
  return {
    id: "event-1",
    pubkey: "pub-1",
    created_at: 1000,
    kind: NostrEventKind.TextNote,
    tags: [],
    content: "",
    sig: "sig",
    relayUrl: "wss://relay-a.example",
    ...overrides,
  };
}

describe("nostr-events-store", () => {
  beforeEach(() => {
    __resetNostrEventsStoreForTests();
  });

  it("ingests and returns events sorted by created_at desc", () => {
    ingestNostrEvent(makeEvent({ id: "older", created_at: 1000 }));
    ingestNostrEvent(makeEvent({ id: "newer", created_at: 2000 }));

    const events = getNostrEvents();
    expect(events.map((e) => e.id)).toEqual(["newer", "older"]);
  });

  it("merges relay attribution when the same id arrives from a new relay", () => {
    ingestNostrEvent(makeEvent({ id: "x", relayUrl: "wss://relay-a.example" }));
    ingestNostrEvent(makeEvent({ id: "x", relayUrl: "wss://relay-b.example" }));

    const events = getNostrEvents();
    expect(events).toHaveLength(1);
    expect(events[0].relayUrls).toEqual([
      "wss://relay-a.example",
      "wss://relay-b.example",
    ]);
  });

  it("drops orphan events with no relay attribution and warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const accepted = ingestNostrEvent(
      makeEvent({ id: "orphan", relayUrl: undefined, relayUrls: undefined })
    );

    expect(accepted).toBe(false);
    expect(getNostrEvents()).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("replaces parameterized-replaceable events by (kind,pubkey,d) key", () => {
    ingestNostrEvent(
      makeEvent({
        id: "old",
        kind: NostrEventKind.UserStatus,
        tags: [["d", "general"]],
        created_at: 1000,
      })
    );
    ingestNostrEvent(
      makeEvent({
        id: "new",
        kind: NostrEventKind.UserStatus,
        tags: [["d", "general"]],
        created_at: 2000,
      })
    );

    const events = getNostrEvents();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("new");
  });

  it("rejects parameterized-replaceable events missing a d-tag", () => {
    const accepted = ingestNostrEvent(
      makeEvent({
        id: "no-d",
        kind: NostrEventKind.UserStatus,
        tags: [],
      })
    );

    expect(accepted).toBe(false);
    expect(getNostrEvents()).toHaveLength(0);
  });

  it("notifies subscribers on each successful ingest and bumps the version", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToNostrEvents(callback);

    const initialVersion = getNostrEventsVersion();
    ingestNostrEvent(makeEvent({ id: "a" }));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(getNostrEventsVersion()).toBe(initialVersion + 1);

    ingestNostrEvent(makeEvent({ id: "b" }));
    expect(callback).toHaveBeenCalledTimes(2);

    unsubscribe();
    ingestNostrEvent(makeEvent({ id: "c" }));
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("returns referentially stable arrays between mutations", () => {
    ingestNostrEvent(makeEvent({ id: "a" }));
    const first = getNostrEvents();
    const second = getNostrEvents();
    expect(first).toBe(second);

    ingestNostrEvent(makeEvent({ id: "b" }));
    const third = getNostrEvents();
    expect(third).not.toBe(first);
  });
});
