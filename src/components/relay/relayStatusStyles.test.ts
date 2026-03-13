import { describe, expect, it } from "vitest";
import { getRelayStatusDotClass, getRelayStatusTextClass } from "./relayStatusStyles";

describe("relayStatusStyles", () => {
  it("keeps read-only visually distinct from connecting", () => {
    // This protects the product contract that restricted relays read as degraded, not in-progress.
    expect(getRelayStatusDotClass("read-only")).toBe("bg-sky-500");
    expect(getRelayStatusDotClass("connecting")).toBe("bg-warning animate-pulse");
    expect(getRelayStatusTextClass("read-only")).toBe("text-sky-500");
    expect(getRelayStatusTextClass("connecting")).toBe("text-warning");
  });
});
