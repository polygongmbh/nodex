import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRelayCommonPrefixes,
  getRelayDiscoveryPrefixes,
  relayUrlToDomainMinusTld,
  relayUrlToId,
  relayUrlToName,
} from "./relay-url";

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
});
