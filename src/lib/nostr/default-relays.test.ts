import { describe, expect, it, vi } from "vitest";
import {
  relayUrlToId,
  resolveDefaultRelayUrls,
  resolveDefaultRelayUrlsWithDomainFallback,
} from "./default-relays";

describe("default relay env resolution", () => {
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
    const probeRelay = vi.fn(async (relayUrl: string) => relayUrl === "wss://feed.linkenfels.de");

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({}, {
        hostname: "nodex.linkenfels.de",
        probeRelay,
      })
    ).resolves.toEqual(["wss://feed.linkenfels.de"]);
    expect(probeRelay).toHaveBeenCalledTimes(4);
    expect(probeRelay).toHaveBeenNthCalledWith(1, "wss://nostr.linkenfels.de");
    expect(probeRelay).toHaveBeenNthCalledWith(2, "wss://feed.linkenfels.de");
    expect(probeRelay).toHaveBeenNthCalledWith(3, "wss://tasks.linkenfels.de");
    expect(probeRelay).toHaveBeenNthCalledWith(4, "wss://base.linkenfels.de");
  });

  it("falls back by prefixing the current host when no subdomain exists", async () => {
    const probeRelay = vi.fn(async (relayUrl: string) => relayUrl === "wss://nostr.nodex.nexus");

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({}, {
        hostname: "nodex.nexus",
        probeRelay,
      })
    ).resolves.toEqual(["wss://nostr.nodex.nexus"]);
    expect(probeRelay).toHaveBeenCalledTimes(4);
    expect(probeRelay).toHaveBeenNthCalledWith(1, "wss://nostr.nodex.nexus");
    expect(probeRelay).toHaveBeenNthCalledWith(2, "wss://feed.nodex.nexus");
    expect(probeRelay).toHaveBeenNthCalledWith(3, "wss://tasks.nodex.nexus");
    expect(probeRelay).toHaveBeenNthCalledWith(4, "wss://base.nodex.nexus");
  });

  it("prefers explicit relay env values without probing host-derived candidates", async () => {
    const probeRelay = vi.fn(async () => true);

    await expect(
      resolveDefaultRelayUrlsWithDomainFallback({
        VITE_DEFAULT_RELAYS: "wss://relay.example.com",
      }, {
        hostname: "nodex.linkenfels.de",
        probeRelay,
      })
    ).resolves.toEqual(["wss://relay.example.com"]);
    expect(probeRelay).not.toHaveBeenCalled();
  });

  it("generates relay ids compatible with existing relay id format", () => {
    expect(relayUrlToId("wss://relay.example.com")).toBe("relay-example-com");
  });
});
