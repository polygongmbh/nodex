import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHANNEL_MATCH_MODE,
  getEffectiveActiveRelayIds,
  isPersistedChannelFilterState,
} from "@/domain/preferences/filter-state";

describe("filter-state", () => {
  it("keeps only active relay ids that are currently available", () => {
    const activeRelayIds = new Set(["demo", "relay-a", "relay-b"]);
    const availableRelayIds = ["demo", "relay-b"];

    expect(getEffectiveActiveRelayIds(activeRelayIds, availableRelayIds)).toEqual(
      new Set(["demo", "relay-b"])
    );
  });

  it("recognizes only persisted non-neutral channel states", () => {
    expect(isPersistedChannelFilterState("included")).toBe(true);
    expect(isPersistedChannelFilterState("excluded")).toBe(true);
    expect(isPersistedChannelFilterState("neutral")).toBe(false);
    expect(isPersistedChannelFilterState("invalid")).toBe(false);
  });

  it("exposes the default channel match mode", () => {
    expect(DEFAULT_CHANNEL_MATCH_MODE).toBe("and");
  });
});
