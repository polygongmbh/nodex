import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNip05ResolutionCache, resolveNip05Identifier } from "./nip05-resolver";

const originalFetch = global.fetch;

describe("resolveNip05Identifier", () => {
  beforeEach(() => {
    clearNip05ResolutionCache();
    vi.restoreAllMocks();
  });

  it("returns pubkey when well-known response contains matching name", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ names: { alice: "a".repeat(64) } }),
    })) as unknown as typeof fetch;

    const result = await resolveNip05Identifier("alice@example.com");
    expect(result).toBe("a".repeat(64));
  });

  it("caches lookup results to avoid repeated network calls", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ names: { alice: "a".repeat(64) } }),
    }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const first = await resolveNip05Identifier("alice@example.com");
    const second = await resolveNip05Identifier("alice@example.com");

    expect(first).toBe("a".repeat(64));
    expect(second).toBe("a".repeat(64));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null for invalid or missing mappings", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ names: { alice: "not-a-pubkey" } }),
    })) as unknown as typeof fetch;

    await expect(resolveNip05Identifier("alice@example.com")).resolves.toBeNull();
    await expect(resolveNip05Identifier("invalid")).resolves.toBeNull();
  });
});

afterAll(() => {
  global.fetch = originalFetch;
});
