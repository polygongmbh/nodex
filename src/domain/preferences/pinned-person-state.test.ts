import { describe, expect, it } from "vitest";
import {
  createEmptyPinnedPeopleState,
  getPinnedPersonIdsForRelays,
  pinPersonForRelays,
  unpinPersonFromRelays,
} from "./pinned-person-state";

const RELAY_A = "relay-a";
const RELAY_B = "relay-b";

describe("pinPersonForRelays", () => {
  it("adds a person to each specified relay", () => {
    const state = pinPersonForRelays(createEmptyPinnedPeopleState(), [RELAY_A, RELAY_B], "alice");
    expect(getPinnedPersonIdsForRelays(state, [RELAY_A])).toEqual(["alice"]);
    expect(getPinnedPersonIdsForRelays(state, [RELAY_B])).toEqual(["alice"]);
  });

  it("does not duplicate a person already pinned for the same relay", () => {
    const once = pinPersonForRelays(createEmptyPinnedPeopleState(), [RELAY_A], "alice");
    const twice = pinPersonForRelays(once, [RELAY_A], "alice");
    expect(getPinnedPersonIdsForRelays(twice, [RELAY_A])).toEqual(["alice"]);
  });
});

describe("unpinPersonFromRelays", () => {
  it("removes a person from the specified relays only", () => {
    let state = pinPersonForRelays(createEmptyPinnedPeopleState(), [RELAY_A, RELAY_B], "alice");
    state = unpinPersonFromRelays(state, [RELAY_A], "alice");

    expect(getPinnedPersonIdsForRelays(state, [RELAY_A])).toEqual([]);
    expect(getPinnedPersonIdsForRelays(state, [RELAY_B])).toEqual(["alice"]);
  });
});
