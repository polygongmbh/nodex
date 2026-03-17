import { describe, expect, it } from "vitest";
import {
  extractRelayUrlsFromNip65Tags,
  selectComplementaryRelayUrls,
} from "./relay-enrichment";

describe("relay enrichment precedence", () => {
  it("extracts relay urls from NIP-65 r tags", () => {
    expect(
      extractRelayUrlsFromNip65Tags([
        ["r", "wss://relay.one"],
        ["p", "abc"],
        ["r", "relay.two"],
      ])
    ).toEqual(["wss://relay.one", "wss://relay.two"]);
  });

  it("prefers NIP-65 relays and ignores NIP-05 when NIP-65 exists", () => {
    expect(
      selectComplementaryRelayUrls({
        nip65RelayUrls: ["wss://relay.one"],
        nip05RelayUrls: ["wss://relay.two"],
      })
    ).toEqual({
      source: "nip65",
      relayUrls: ["wss://relay.one"],
    });
  });

  it("falls back to NIP-05 relays only when NIP-65 relays are absent", () => {
    expect(
      selectComplementaryRelayUrls({
        nip65RelayUrls: [],
        nip05RelayUrls: ["wss://relay.two", "relay.two/"],
      })
    ).toEqual({
      source: "nip05",
      relayUrls: ["wss://relay.two"],
    });
  });

  it("returns no relay candidates when neither source yields relays", () => {
    expect(
      selectComplementaryRelayUrls({
        nip65RelayUrls: [],
        nip05RelayUrls: [],
      })
    ).toEqual({
      source: null,
      relayUrls: [],
    });
  });
});
