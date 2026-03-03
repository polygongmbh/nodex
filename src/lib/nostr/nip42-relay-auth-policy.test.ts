import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRelayNip42AuthPolicy, type RelayVerificationEvent } from "./nip42-relay-auth-policy";
import { createNIP42Response } from "./nip42-auth";

vi.mock("./nip42-auth", () => ({
  createNIP42Response: vi.fn(),
}));

describe("createRelayNip42AuthPolicy", () => {
  const relay = { url: "wss://relay.example.com" };
  const challenge = "relay-challenge";
  const onVerificationEvent = vi.fn<(event: RelayVerificationEvent) => void>();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits required when auth challenge handling succeeds", async () => {
    const ndk = { signer: { id: "signer" } } as never;
    vi.mocked(createNIP42Response).mockResolvedValue({} as never);

    const policy = createRelayNip42AuthPolicy(ndk, onVerificationEvent);
    const result = await policy(relay, challenge);

    expect(result).toBe(true);
    expect(onVerificationEvent).toHaveBeenNthCalledWith(1, {
      relayUrl: relay.url,
      operation: "unknown",
      outcome: "required",
    });
    expect(onVerificationEvent).toHaveBeenCalledTimes(1);
  });

  it("emits required then failed when signer is missing", async () => {
    const ndk = {} as never;

    const policy = createRelayNip42AuthPolicy(ndk, onVerificationEvent);
    const result = await policy(relay, challenge);

    expect(result).toBe(false);
    expect(createNIP42Response).not.toHaveBeenCalled();
    expect(onVerificationEvent).toHaveBeenNthCalledWith(1, {
      relayUrl: relay.url,
      operation: "unknown",
      outcome: "required",
    });
    expect(onVerificationEvent).toHaveBeenNthCalledWith(2, {
      relayUrl: relay.url,
      operation: "unknown",
      outcome: "failed",
      reason: "missing-signer",
    });
  });

  it("emits failed with error message when response creation throws", async () => {
    const ndk = { signer: { id: "signer" } } as never;
    vi.mocked(createNIP42Response).mockRejectedValue(new Error("boom"));

    const policy = createRelayNip42AuthPolicy(ndk, onVerificationEvent);
    const result = await policy(relay, challenge);

    expect(result).toBe(false);
    expect(onVerificationEvent).toHaveBeenNthCalledWith(1, {
      relayUrl: relay.url,
      operation: "unknown",
      outcome: "required",
    });
    expect(onVerificationEvent).toHaveBeenNthCalledWith(2, {
      relayUrl: relay.url,
      operation: "unknown",
      outcome: "failed",
      reason: "boom",
    });
  });
});
