import { describe, expect, it } from "vitest";
import {
  appendResolvedRelayUrl,
  mergeConfiguredRelayStatuses,
  normalizeRelayUrl,
  removeResolvedRelayUrl,
} from "./relay-list";

describe("normalizeRelayUrl", () => {
  it("removes trailing slashes", () => {
    expect(normalizeRelayUrl("wss://relay.example.com///")).toBe("wss://relay.example.com");
  });
});

describe("appendResolvedRelayUrl", () => {
  it("deduplicates normalized relay urls", () => {
    expect(appendResolvedRelayUrl(["wss://relay.one"], "wss://relay.one/")).toEqual(["wss://relay.one"]);
  });
});

describe("removeResolvedRelayUrl", () => {
  it("removes the normalized relay url", () => {
    expect(removeResolvedRelayUrl(["wss://relay.one", "wss://relay.two/"], "wss://relay.two")).toEqual(["wss://relay.one"]);
  });
});

describe("mergeConfiguredRelayStatuses", () => {
  it("does not reinsert intentionally removed relays", () => {
    const merged = mergeConfiguredRelayStatuses({
      relays: [],
      configuredRelayUrls: ["wss://relay.one"],
      removedRelayUrls: new Set(["wss://relay.one"]),
    });

    expect(merged).toEqual([]);
  });
});
