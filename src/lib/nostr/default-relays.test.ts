import { describe, expect, it } from "vitest";
import { resolveDefaultRelayUrls, relayUrlToId } from "./default-relays";

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

  it("generates relay ids compatible with existing relay id format", () => {
    expect(relayUrlToId("wss://relay.example.com")).toBe("relay-example-com");
  });
});
