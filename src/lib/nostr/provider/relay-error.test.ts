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

  it("extracts rejection reason from nested OK tuple payloads", () => {
    const reason = extractRelayRejectionReason({
      message: "Not enough relays received the event (0 published, 1 required)",
      relayErrors: {
        "wss://relay.example.com": ["OK", "68dd30...", false, "auth-required: event author pubkey not in whitelist"],
      },
    });

    expect(reason).toBe("auth-required: event author pubkey not in whitelist");
  });

  it("extracts relay URL and rejection reason from NDKPublishError-like map payloads", () => {
    const relay = { url: "wss://relay.example.com" };
    const relayError = new Error(
      '["OK","68dd30...",false,"auth-required: event author pubkey not in whitelist"]'
    );
    const publishError = new Error("Not enough relays received the event (0 published, 1 required)") as Error & {
      errors?: Map<{ url: string }, Error>;
    };
    Object.defineProperty(publishError, "errors", {
      value: new Map([[relay, relayError]]),
      enumerable: false,
      configurable: true,
      writable: true,
    });

    expect(extractRelayUrlsFromError(publishError)).toEqual(["wss://relay.example.com"]);
    expect(extractRelayRejectionReason(publishError)).toBe(
      "auth-required: event author pubkey not in whitelist"
    );
  });
});
