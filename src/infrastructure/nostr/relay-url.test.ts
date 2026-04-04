import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dedupeNormalizedRelayUrls,
  getRelayCommonPrefixes,
  getRelayDiscoveryPrefixes,
  normalizeRelayUrl,
  normalizeRelayUrlScope,
  relayUrlToDomainMinusTld,
  relayUrlToId,
  relayUrlToName,
  resolveRelayUrlsForIds,
} from "./relay-url";

describe("normalizeRelayUrl", () => {
  it("removes trailing slashes and trims surrounding whitespace", () => {
    expect(normalizeRelayUrl("wss://relay.example.com///")).toBe("wss://relay.example.com");
    expect(normalizeRelayUrl("  wss://relay.example.com  ")).toBe("wss://relay.example.com");
    expect(normalizeRelayUrl("  wss://relay.example.com/ ")).toBe("wss://relay.example.com");
  });
});

describe("relay-url naming", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses default common prefixes when env is unset", () => {
    vi.stubEnv("VITE_RELAY_COMMON_PREFIXES", "");
    expect(getRelayCommonPrefixes()).toEqual(["feed", "nostr", "relay"]);
  });

  it("derives domain-minus-tld relay names using default prefixes", () => {
    vi.stubEnv("VITE_RELAY_COMMON_PREFIXES", "");
    expect(relayUrlToDomainMinusTld("wss://relay.damus.io")).toBe("damus");
    expect(relayUrlToDomainMinusTld("ws://base.janetzko.us")).toBe("base.janetzko");
    expect(relayUrlToDomainMinusTld("wss://nodex.nexus")).toBe("nodex");
  });

  it("respects configured common prefixes", () => {
    vi.stubEnv("VITE_RELAY_COMMON_PREFIXES", "feed,nostr,relay,base");
    expect(relayUrlToName("ws://base.janetzko.us")).toBe("janetzko");
  });

  it("defaults discovery prefixes to common prefixes and supports override", () => {
    vi.stubEnv("VITE_RELAY_COMMON_PREFIXES", "feed,nostr,relay");
    vi.stubEnv("VITE_RELAY_DISCOVERY_PREFIXES", "");
    expect(getRelayDiscoveryPrefixes()).toEqual(["feed", "nostr", "relay"]);

    vi.stubEnv("VITE_RELAY_DISCOVERY_PREFIXES", "tasks,base");
    expect(getRelayDiscoveryPrefixes()).toEqual(["tasks", "base"]);
  });

  it("normalizes relay ids to lowercase", () => {
    expect(relayUrlToId("ws://Demo")).toBe("demo");
    expect(relayUrlToId("wss://Relay.Example")).toBe("relay-example");
  });

  it("resolves normalized relay urls from relay ids", () => {
    expect(resolveRelayUrlsForIds([
      { id: "relay-one", url: "wss://relay.one/" },
      { id: "relay-two", url: "wss://relay.two" },
      { id: "relay-two-duplicate", url: "wss://relay.two/" },
    ], ["relay-two", "relay-two-duplicate", "missing"])).toEqual(["wss://relay.two"]);
  });

  it("builds stable normalized relay scopes", () => {
    expect(normalizeRelayUrlScope([
      "wss://relay.two/",
      "wss://relay.one",
      "wss://relay.two",
    ])).toEqual(["wss://relay.one", "wss://relay.two"]);
    expect(dedupeNormalizedRelayUrls([
      "wss://relay.two/",
      "wss://relay.two",
      "wss://relay.one",
    ])).toEqual(["wss://relay.two", "wss://relay.one"]);
  });
});
