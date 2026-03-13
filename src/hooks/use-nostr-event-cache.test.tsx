import { describe, expect, it } from "vitest";
import {
  buildFeedScopeKey,
  drainPendingCachedEvents,
  getNostrEventsQueryKey,
  NOSTR_EVENTS_QUERY_KEY,
} from "./use-nostr-event-cache";

describe("nostr event cache feed scope helpers", () => {
  it("builds a stable normalized scope key from relay ids", () => {
    const scopeKey = buildFeedScopeKey(new Set(["Relay-B", "demo", "relay-a", "relay-b"]));
    expect(scopeKey).toBe("relay-a,relay-b");
  });

  it("uses all scope when only demo relay is active", () => {
    const scopeKey = buildFeedScopeKey(new Set(["demo"]));
    expect(scopeKey).toBe("all");
  });

  it("builds scoped query keys from the base key", () => {
    const queryKey = getNostrEventsQueryKey("relay-a");
    expect(queryKey).toEqual([...NOSTR_EVENTS_QUERY_KEY, "relay-a"]);
  });

  it("drains cached events in bounded hydration batches", () => {
    const previous = [{
      id: "existing",
      pubkey: "pubkey-existing",
      created_at: 10,
      kind: 1,
      tags: [],
      content: "existing",
    }];
    const pending = [
      {
        id: "event-3",
        pubkey: "pubkey-3",
        created_at: 30,
        kind: 1,
        tags: [],
        content: "third",
      },
      {
        id: "event-2",
        pubkey: "pubkey-2",
        created_at: 20,
        kind: 1,
        tags: [],
        content: "second",
      },
    ];

    const drained = drainPendingCachedEvents(previous, pending, 1);

    expect(drained.flushedCount).toBe(1);
    expect(drained.remaining).toEqual([pending[1]]);
    expect(drained.nextEvents.map((event) => event.id)).toEqual(["event-3", "existing"]);
  });
});
