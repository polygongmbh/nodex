import { describe, expect, it } from "vitest";
import type { Channel } from "@/types";
import type { Person } from "@/types/person";
import {
  buildChannelFilterMap,
  mapPeopleSelection,
  setAllChannelFilters,
  setExclusiveChannelFilter,
  shouldToggleOffExclusiveChannel,
  shouldToggleOffExclusivePerson,
} from "./filter-state-utils";

const channels: Channel[] = [
  { id: "general", name: "general", filterState: "neutral" },
  { id: "release", name: "release", filterState: "neutral" },
];

const people: Person[] = [
  { id: "alice", name: "alice", displayName: "Alice", isOnline: true, isSelected: false },
  { id: "bob", name: "bob", displayName: "Bob", isOnline: true, isSelected: false },
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

  it("maps people selection via callback", () => {
    const result = mapPeopleSelection(people, (person) => person.id === "bob");
    expect(result.find((person) => person.id === "alice")?.isSelected).toBe(false);
    expect(result.find((person) => person.id === "bob")?.isSelected).toBe(true);
  });

  it("detects when exclusive person click should toggle off", () => {
    const selectedPeople = mapPeopleSelection(people, (person) => person.id === "alice");
    expect(shouldToggleOffExclusivePerson(selectedPeople, "alice")).toBe(true);
    expect(shouldToggleOffExclusivePerson(selectedPeople, "bob")).toBe(false);
  });
});
