import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnoseNip05 } from "./nip05-diagnose";

const PUBKEY = "a".repeat(64);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("diagnoseNip05", () => {
  it("rejects malformed input", async () => {
    expect(await diagnoseNip05("alice")).toMatch(/name@domain/);
    expect(await diagnoseNip05("alice@")).toMatch(/name@domain/);
  });

  it("reports an unreachable domain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await diagnoseNip05("alice@example.com")).toBe(
      "Could not reach example.com (Failed to fetch)"
    );
  });

  it("reports a non-2xx HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("nope", { status: 503 })
    ));
    expect(await diagnoseNip05("alice@example.com")).toBe(
      "example.com returned HTTP 503"
    );
  });

  it("reports a missing entry when the names map omits the user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ names: { bob: PUBKEY } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));
    expect(await diagnoseNip05("alice@example.com")).toBe(
      `No entry for "alice" at example.com`
    );
  });

  it("reports a pubkey mismatch when expectedPubkey is provided", async () => {
    const otherKey = "b".repeat(64);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ names: { alice: otherKey } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));
    const message = await diagnoseNip05("alice@example.com", PUBKEY);
    expect(message).toContain("different public key");
    expect(message).toContain(otherKey.slice(0, 8));
  });
});
