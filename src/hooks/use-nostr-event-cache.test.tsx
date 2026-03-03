import { describe, expect, it } from "vitest";
import { buildFeedScopeKey, getNostrEventsQueryKey, NOSTR_EVENTS_QUERY_KEY } from "./use-nostr-event-cache";

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
});
