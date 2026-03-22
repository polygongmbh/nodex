import { beforeEach, describe, expect, it } from "vitest";
import {
  getPersonFrecencyScores,
  loadPersonFrecencyState,
  recordPersonInteraction,
  savePersonFrecencyState,
} from "./person-frecency";

describe("person frecency", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records interactions and persists state", () => {
    const now = Date.now();
    const next = recordPersonInteraction({}, "ALICE", 1.5, now);
    savePersonFrecencyState(next);
    const loaded = loadPersonFrecencyState();

    expect(Object.keys(loaded)).toEqual(["alice"]);
    expect(loaded.alice.score).toBeGreaterThan(1);
  });

  it("decays old interactions when computing scores", () => {
    const now = Date.now();
    const state = recordPersonInteraction({}, "alice", 2, now - 40 * 24 * 60 * 60 * 1000);
    const scores = getPersonFrecencyScores(state, now);
    expect((scores.get("alice") || 0)).toBeLessThan(1);
  });
});
