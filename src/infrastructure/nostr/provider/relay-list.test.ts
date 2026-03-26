import { describe, expect, it } from "vitest";
import {
  appendResolvedRelayUrl,
  filterAutoAddRelayUrls,
  mergeConfiguredRelayStatuses,
  normalizeRelayUrl,
  reorderResolvedRelayStatuses,
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

  it("filters intentionally removed relays from previous relay state", () => {
    const merged = mergeConfiguredRelayStatuses({
      relays: [
        { url: "wss://relay.one", status: "connected" },
        { url: "wss://relay.two", status: "connected" },
      ],
      configuredRelayUrls: ["wss://relay.two"],
      removedRelayUrls: new Set(["wss://relay.one"]),
    });

    expect(merged).toEqual([
      { url: "wss://relay.two", status: "connected" },
    ]);
  });
});

describe("filterAutoAddRelayUrls", () => {
  it("skips existing and intentionally removed relays", () => {
    expect(filterAutoAddRelayUrls({
      candidateRelayUrls: ["wss://relay.one/", "wss://relay.two", "wss://relay.three"],
      existingRelayUrls: ["wss://relay.one"],
      removedRelayUrls: ["wss://relay.two/"],
    })).toEqual(["wss://relay.three"]);
  });
});

describe("reorderResolvedRelayStatuses", () => {
  it("reorders relays by normalized requested urls while preserving remaining relays", () => {
    expect(reorderResolvedRelayStatuses({
      relays: [
        { url: "wss://relay.one", status: "connected" },
        { url: "wss://relay.two", status: "disconnected" },
        { url: "wss://relay.three", status: "connecting" },
      ],
      orderedRelayUrls: ["wss://relay.three/", "wss://relay.one"],
    })).toEqual([
      { url: "wss://relay.three", status: "connecting" },
      { url: "wss://relay.one", status: "connected" },
      { url: "wss://relay.two", status: "disconnected" },
    ]);
  });

  it("ignores duplicate and unknown requested urls", () => {
    expect(reorderResolvedRelayStatuses({
      relays: [
        { url: "wss://relay.one", status: "connected" },
        { url: "wss://relay.two", status: "disconnected" },
      ],
      orderedRelayUrls: ["wss://relay.two", "wss://relay.two/", "wss://relay.missing"],
    })).toEqual([
      { url: "wss://relay.two", status: "disconnected" },
      { url: "wss://relay.one", status: "connected" },
    ]);
  });
});
