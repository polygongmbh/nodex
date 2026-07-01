import { describe, expect, it } from "vitest";
import type { Channel } from "@/types";
import {
  buildChannelFilterMap,
  setAllChannelFilters,
  setExclusiveChannelFilter,
  shouldToggleOffExclusiveChannel,
  shouldToggleOffExclusivePerson,
} from "./filter-state-utils";

const channels: Channel[] = [
  { id: "general", name: "general", filterState: "neutral" },
  { id: "release", name: "release", filterState: "neutral" },
];

describe("filter-state-utils", () => {
  it("builds channel maps from resolver logic", () => {
    const map = buildChannelFilterMap(channels, (channel) =>
      channel.id === "general" ? "included" : "excluded"
    );
    expect(map.get("general")).toBe("included");
    expect(map.get("release")).toBe("excluded");
  });

  it("sets all channel filters to one state", () => {
    const map = setAllChannelFilters(channels, "neutral");
    expect(Array.from(map.values())).toEqual(["neutral", "neutral"]);
  });

  it("creates exclusive included channel maps", () => {
    const map = setExclusiveChannelFilter(channels, "release");
    expect(map.get("general")).toBe("neutral");
    expect(map.get("release")).toBe("included");
  });

  it("detects when exclusive channel click should toggle off", () => {
    const states = new Map<string, Channel["filterState"]>([
      ["general", "included"],
      ["release", "neutral"],
    ]);
    expect(shouldToggleOffExclusiveChannel(channels, states, "general")).toBe(true);
    expect(shouldToggleOffExclusiveChannel(channels, states, "release")).toBe(false);
  });

  it("detects when exclusive person click should toggle off", () => {
    const selectedPubkeys = new Set(["alice"]);
    expect(shouldToggleOffExclusivePerson(selectedPubkeys, "alice")).toBe(true);
    expect(shouldToggleOffExclusivePerson(selectedPubkeys, "bob")).toBe(false);
    expect(shouldToggleOffExclusivePerson(new Set(["alice", "bob"]), "alice")).toBe(false);
  });
});
