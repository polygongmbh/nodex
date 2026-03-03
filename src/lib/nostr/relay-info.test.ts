import { describe, expect, it } from "vitest";
import { relayWebsocketUrlToHttpUrl, summarizeRelayInfo } from "./relay-info";

describe("relayWebsocketUrlToHttpUrl", () => {
  it("converts websocket relay URLs to HTTP/S NIP-11 endpoint URLs", () => {
    expect(relayWebsocketUrlToHttpUrl("wss://relay.example.com")).toBe("https://relay.example.com/");
    expect(relayWebsocketUrlToHttpUrl("ws://localhost:7447")).toBe("http://localhost:7447/");
  });

  it("returns null for unsupported URL schemes", () => {
    expect(relayWebsocketUrlToHttpUrl("https://relay.example.com")).toBeNull();
    expect(relayWebsocketUrlToHttpUrl("not-a-url")).toBeNull();
  });
});

describe("summarizeRelayInfo", () => {
  it("detects auth requirement via limitations and NIP-42 support", () => {
    expect(summarizeRelayInfo({
      supported_nips: [1, 11, 42],
      limitations: { auth_required: false },
    })).toEqual({
      authRequired: false,
      supportsNip42: true,
    });

    expect(summarizeRelayInfo({
      supported_nips: [1, 11],
      limitation: { auth_required: true },
    })).toEqual({
      authRequired: true,
      supportsNip42: true,
    });
  });
});
