import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  relayUrlToId,
  resolveDefaultRelayUrls,
  resolveDefaultRelayUrlsWithDomainFallback,
} from "./default-relays";

describe("default relay env resolution", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty list when no relay env values are provided", () => {
    expect(resolveDefaultRelayUrls({})).toEqual([]);
  });

  it("parses comma-separated relay urls and dedupes normalized values", () => {
    expect(
      resolveDefaultRelayUrls({
        VITE_DEFAULT_RELAYS: "wss://relay.example.com, relay.example.com/ ,wss://relay.example.com",
      })
    ).toEqual(["wss://relay.example.com"]);
  });

  it("builds a relay url from domain, protocol, and port", () => {
    expect(
      resolveDefaultRelayUrls({
        VITE_DEFAULT_RELAY_DOMAIN: "nostr.example.com",
        VITE_DEFAULT_RELAY_PROTOCOL: "ws",
        VITE_DEFAULT_RELAY_PORT: "7447",
      })
    ).toEqual(["ws://nostr.example.com:7447"]);
  });

  it("falls back to host-derived relay candidates and keeps only available relays", async () => {
    const probeRelay = vi.fn(async (relayUrl: string) => relayUrl === "wss://feed.example.test");

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({}, {
        hostname: "app.example.test",
        probeRelay,
      })
    ).resolves.toEqual(["wss://feed.example.test"]);
    expect(probeRelay).toHaveBeenCalledTimes(4);
    expect(probeRelay).toHaveBeenNthCalledWith(1, "wss://nostr.example.test");
    expect(probeRelay).toHaveBeenNthCalledWith(2, "wss://feed.example.test");
    expect(probeRelay).toHaveBeenNthCalledWith(3, "wss://tasks.example.test");
    expect(probeRelay).toHaveBeenNthCalledWith(4, "wss://base.example.test");
  });

  it("probes all prefixes even when the first candidate succeeds", async () => {
    const probeRelay = vi.fn(async (relayUrl: string) => relayUrl === "wss://nostr.example.test");

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({}, {
        hostname: "app.example.test",
        probeRelay,
      })
    ).resolves.toEqual(["wss://nostr.example.test"]);
    expect(probeRelay).toHaveBeenCalledTimes(4);
    expect(probeRelay).toHaveBeenNthCalledWith(1, "wss://nostr.example.test");
    expect(probeRelay).toHaveBeenNthCalledWith(2, "wss://feed.example.test");
    expect(probeRelay).toHaveBeenNthCalledWith(3, "wss://tasks.example.test");
    expect(probeRelay).toHaveBeenNthCalledWith(4, "wss://base.example.test");
  });

  it("falls back by prefixing the current host when no subdomain exists", async () => {
    const probeRelay = vi.fn(async (relayUrl: string) => relayUrl === "wss://nostr.project.test");

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({}, {
        hostname: "project.test",
        probeRelay,
      })
    ).resolves.toEqual(["wss://nostr.project.test"]);
    expect(probeRelay).toHaveBeenCalledTimes(4);
    expect(probeRelay).toHaveBeenNthCalledWith(1, "wss://nostr.project.test");
    expect(probeRelay).toHaveBeenNthCalledWith(2, "wss://feed.project.test");
    expect(probeRelay).toHaveBeenNthCalledWith(3, "wss://tasks.project.test");
    expect(probeRelay).toHaveBeenNthCalledWith(4, "wss://base.project.test");
  });

  it("reuses recent fallback probe results from cache and skips re-probing", async () => {
    const probeRelay = vi.fn(async (relayUrl: string) => relayUrl === "wss://feed.example.test");

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({}, {
        hostname: "app.example.test",
        probeRelay,
      })
    ).resolves.toEqual(["wss://feed.example.test"]);
    expect(probeRelay).toHaveBeenCalledTimes(4);

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({}, {
        hostname: "app.example.test",
        probeRelay,
      })
    ).resolves.toEqual(["wss://feed.example.test"]);
    expect(probeRelay).toHaveBeenCalledTimes(4);
  });

  it("ignores stale cached relays when none match current host candidates", async () => {
    window.localStorage.setItem(
      "nodex.default-relay-fallback.v1:wss:app.example.test",
      JSON.stringify({
        checkedAt: Date.now(),
        relayUrls: ["wss://feed.other.test"],
      })
    );
    const probeRelay = vi.fn(async (relayUrl: string) => relayUrl === "wss://feed.example.test");

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({}, {
        hostname: "app.example.test",
        probeRelay,
      })
    ).resolves.toEqual(["wss://feed.example.test"]);
    expect(probeRelay).toHaveBeenCalledTimes(4);
  });

  it("does not cache empty fallback probe results", async () => {
    const probeRelay = vi.fn(async () => false);

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({}, {
        hostname: "app.example.test",
        probeRelay,
      })
    ).resolves.toEqual([]);
    expect(probeRelay).toHaveBeenCalledTimes(4);

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({}, {
        hostname: "app.example.test",
        probeRelay,
      })
    ).resolves.toEqual([]);
    expect(probeRelay).toHaveBeenCalledTimes(8);
  });

  it("prefers explicit relay env values without probing host-derived candidates", async () => {
    const probeRelay = vi.fn(async () => true);

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({
        VITE_DEFAULT_RELAYS: "wss://relay.example.com",
      }, {
        hostname: "app.example.test",
        probeRelay,
      })
    ).resolves.toEqual(["wss://relay.example.com"]);
    expect(probeRelay).not.toHaveBeenCalled();
  });

  it("generates relay ids compatible with existing relay id format", () => {
    expect(relayUrlToId("wss://relay.example.com")).toBe("relay-example-com");
  });
});
