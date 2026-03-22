import { describe, expect, it } from "vitest";
import {
  createEmptyPinnedPeopleState,
  getPinnedPersonIdsForView,
  pinPersonForRelays,
  unpinPersonFromRelays,
} from "./pinned-person-state";

const RELAY_A = "relay-a";
const RELAY_B = "relay-b";

describe("pinPersonForRelays", () => {
  it("adds a person to each specified relay", () => {
    const state = pinPersonForRelays(createEmptyPinnedPeopleState(), "feed", [RELAY_A, RELAY_B], "alice");
    expect(getPinnedPersonIdsForView(state, "feed", [RELAY_A])).toEqual(["alice"]);
    expect(getPinnedPersonIdsForView(state, "feed", [RELAY_B])).toEqual(["alice"]);
  });

  it("does not duplicate a person already pinned for the same relay", () => {
    const once = pinPersonForRelays(createEmptyPinnedPeopleState(), "feed", [RELAY_A], "alice");
    const twice = pinPersonForRelays(once, "feed", [RELAY_A], "alice");
    expect(getPinnedPersonIdsForView(twice, "feed", [RELAY_A])).toEqual(["alice"]);
  });
});

describe("unpinPersonFromRelays", () => {
  it("removes a person from the specified relays only", () => {
    let state = pinPersonForRelays(createEmptyPinnedPeopleState(), "feed", [RELAY_A, RELAY_B], "alice");
    state = unpinPersonFromRelays(state, "feed", [RELAY_A], "alice");

    expect(getPinnedPersonIdsForView(state, "feed", [RELAY_A])).toEqual([]);
    expect(getPinnedPersonIdsForView(state, "feed", [RELAY_B])).toEqual(["alice"]);
  });
});
