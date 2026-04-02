import { beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyPinnedPeopleState,
  getPinnedPersonIdsForRelays,
  pinPersonForRelays,
  type PinnedPeopleState,
} from "@/domain/preferences/pinned-person-state";
import {
  loadPinnedPeopleState,
  savePinnedPeopleState,
} from "./pinned-people-storage";

const RELAY_A = "relay-a";

beforeEach(() => {
  localStorage.clear();
});

describe("loadPinnedPeopleState", () => {
  it("returns empty state when localStorage is empty", () => {
    expect(loadPinnedPeopleState()).toEqual(createEmptyPinnedPeopleState());
  });

  it("returns empty state for a nonconforming payload", () => {
    localStorage.setItem(
      "nodex.pinned-people.guest",
      JSON.stringify({
        byRelay: {
          [RELAY_A]: "alice",
        },
      })
    );

    expect(loadPinnedPeopleState()).toEqual(createEmptyPinnedPeopleState());
  });

  it("strips entries with empty person ids", () => {
    const raw: PinnedPeopleState = {
      byRelay: {
        [RELAY_A]: [
          { personId: "alice", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 },
          { personId: "", pinnedAt: "2026-01-01T00:00:00.000Z", order: 1 },
        ],
      },
    };
    localStorage.setItem("nodex.pinned-people.guest", JSON.stringify(raw));
    const state = loadPinnedPeopleState();
    expect(getPinnedPersonIdsForRelays(state, [RELAY_A])).toEqual(["alice"]);
  });
});

describe("savePinnedPeopleState", () => {
  it("round-trips persisted state", () => {
    const state = pinPersonForRelays(createEmptyPinnedPeopleState(), [RELAY_A], "alice");
    savePinnedPeopleState(state);
    expect(getPinnedPersonIdsForRelays(loadPinnedPeopleState(), [RELAY_A])).toEqual(["alice"]);
  });
});
