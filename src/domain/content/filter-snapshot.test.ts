import { describe, expect, it } from "vitest";
import type { Person } from "@/types/person";
import { areFilterSnapshotsEqual, buildFilterSnapshot, type FilterSnapshot } from "./filter-snapshot";

const createPerson = (pubkey: string, isSelected: boolean): Person => ({
  pubkey,
  name: pubkey,
  displayName: pubkey,
  isSelected,
});

describe("filter snapshot", () => {
  it("builds a normalized snapshot from runtime filter state", () => {
    const snapshot = buildFilterSnapshot({
      activeRelayIds: new Set(["relay-b", "relay-a"]),
      channelFilterStates: new Map([
        ["project", "included"],
        ["spam", "excluded"],
        ["neutral", "neutral"],
      ]),
      people: [createPerson("b", true), createPerson("a", true), createPerson("c", false)],
      channelMatchMode: "or",
    });

    expect(snapshot).toEqual({
      relayIds: ["relay-a", "relay-b"],
      channelStates: {
        project: "included",
        spam: "excluded",
      },
      selectedPeopleIds: ["a", "b"],
      channelMatchMode: "or",
      quickFilters: {
        recentEnabled: false,
        recentDays: 7,
        priorityEnabled: false,
        minPriority: 50,
      },
    } satisfies FilterSnapshot);
  });

  it("matches equivalent snapshots regardless of channel object key order", () => {
    const left: FilterSnapshot = {
      relayIds: ["a", "b"],
      channelStates: { x: "included", y: "excluded" },
      selectedPeopleIds: ["p1", "p2"],
      channelMatchMode: "and",
    };

    const right: FilterSnapshot = {
      relayIds: ["a", "b"],
      channelStates: { y: "excluded", x: "included" },
      selectedPeopleIds: ["p1", "p2"],
      channelMatchMode: "and",
    };

    expect(areFilterSnapshotsEqual(left, right)).toBe(true);
  });

  it("detects different channel match modes", () => {
    const base: FilterSnapshot = {
      relayIds: ["a"],
      channelStates: { x: "included" },
      selectedPeopleIds: ["p1"],
      channelMatchMode: "and",
    };

    expect(
      areFilterSnapshotsEqual(base, {
        ...base,
        channelMatchMode: "or",
      })
    ).toBe(false);
  });
});
