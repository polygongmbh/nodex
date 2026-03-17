import { describe, expect, it } from "vitest";
import { ALL_RELAYS_SCOPE_KEY, EMPTY_RELAY_SCOPE_KEY } from "@/infrastructure/nostr/event-cache";
import { buildFeedScopeKey } from "./use-nostr-event-cache";

describe("buildFeedScopeKey", () => {
  it("returns the empty relay scope when no non-demo relays are configured", () => {
    expect(buildFeedScopeKey(new Set(), [])).toBe(EMPTY_RELAY_SCOPE_KEY);
    expect(buildFeedScopeKey(new Set(["demo"]), ["demo"])).toBe(EMPTY_RELAY_SCOPE_KEY);
  });

  it("treats an empty active selection as all configured relays", () => {
    expect(buildFeedScopeKey(new Set(), ["relay-a", "relay-b"])).toBe(ALL_RELAYS_SCOPE_KEY);
  });

  it("builds a sorted explicit scope for selected relays", () => {
    expect(buildFeedScopeKey(new Set(["relay-b", "relay-a"]), ["relay-a", "relay-b"])).toBe("relay-a,relay-b");
  });
});
