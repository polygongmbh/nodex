import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { describe, expect, it } from "vitest";
import {
  applyPerformanceAwareSubscriptionLimits,
  classifySystemPerformance,
  getPerformanceBasedSubscriptionCap,
} from "./subscription-limits";

describe("subscription performance limits", () => {
  it("classifies low-end devices conservatively", () => {
    expect(classifySystemPerformance({ hardwareConcurrency: 2, deviceMemory: 8 })).toBe("low");
    expect(classifySystemPerformance({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe("low");
  });

  it("returns a stable default cap when browser performance hints are unavailable", () => {
    expect(classifySystemPerformance()).toBe("high");
    expect(getPerformanceBasedSubscriptionCap()).toBe(500);
  });

  it("adds a cap to broad backfill subscriptions", () => {
    const filters: NDKFilter[] = [{ kinds: [1, 30023] }];

    const result = applyPerformanceAwareSubscriptionLimits(filters, {
      hardwareConcurrency: 4,
      deviceMemory: 4,
    });

    expect(result.changed).toBe(true);
    expect(result.cap).toBe(250);
    expect(result.filters).toEqual([{ kinds: [1, 30023], limit: 250 }]);
  });

  it("does not inject limits into targeted author lookups", () => {
    const filters: NDKFilter[] = [{ kinds: [0], authors: ["pubkey-a", "pubkey-b"] }];

    const result = applyPerformanceAwareSubscriptionLimits(filters, {
      hardwareConcurrency: 2,
      deviceMemory: 2,
    });

    expect(result.changed).toBe(false);
    expect(result.filters).toEqual(filters);
  });

  it("clamps oversized explicit limits even on targeted subscriptions", () => {
    const filters: NDKFilter[] = [{ kinds: [0], authors: ["pubkey-a"], limit: 5000 }];

    const result = applyPerformanceAwareSubscriptionLimits(filters, {
      hardwareConcurrency: 2,
      deviceMemory: 2,
    });

    expect(result.changed).toBe(true);
    expect(result.filters).toEqual([{ kinds: [0], authors: ["pubkey-a"], limit: 100 }]);
  });

  it("preserves explicit limits that are already under the device cap", () => {
    const filters: NDKFilter[] = [{ kinds: [10002], authors: ["pubkey-a"], limit: 1 }];

    const result = applyPerformanceAwareSubscriptionLimits(filters, {
      hardwareConcurrency: 16,
      deviceMemory: 32,
    });

    expect(result.changed).toBe(false);
    expect(result.filters).toEqual(filters);
  });
});
