import { describe, expect, it } from "vitest";
import {
  extractRelayRejectionReason,
  extractRelayUrlsFromError,
  extractRelayUrlsFromErrorMessage,
} from "./relay-error";

describe("extractRelayUrlsFromErrorMessage", () => {
  it("extracts and normalizes relay URLs from mixed error text", () => {
    const urls = extractRelayUrlsFromErrorMessage(
      "publish failed on wss://relay.example.com/ and ws://localhost:7777 (auth-required)"
    );

    expect(urls).toEqual(["wss://relay.example.com", "ws://localhost:7777"]);
  });

  it("deduplicates relay URLs", () => {
    const urls = extractRelayUrlsFromErrorMessage(
      "wss://relay.example.com auth-required wss://relay.example.com/"
    );

    expect(urls).toEqual(["wss://relay.example.com"]);
  });

  it("returns empty array when no relay URL is present", () => {
    const urls = extractRelayUrlsFromErrorMessage("auth-required without relay context");
    expect(urls).toEqual([]);
  });

  it("extracts relay URLs from error objects", () => {
    const urls = extractRelayUrlsFromError({
      message: 'publish rejected by {"relay":"wss://relay.example.com/"}',
    });

    expect(urls).toEqual(["wss://relay.example.com"]);
  });

  it("extracts NIP-01 style rejection reason from OK envelope text", () => {
    const reason = extractRelayRejectionReason(
      '["OK","68dd30...",false,"auth-required: event author pubkey not in whitelist"]'
    );

    expect(reason).toBe("auth-required: event author pubkey not in whitelist");
  });
});
