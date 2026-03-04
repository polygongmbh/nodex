import { beforeEach, describe, expect, it } from "vitest";
import {
  getChannelFrecencyScores,
  loadChannelFrecencyState,
  recordChannelInteraction,
  saveChannelFrecencyState,
} from "./channel-frecency";

describe("channel frecency", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records interactions and persists state", () => {
    const now = Date.now();
    const next = recordChannelInteraction({}, "Backend", 1.5, now);
    saveChannelFrecencyState(next);
    const loaded = loadChannelFrecencyState();

    expect(Object.keys(loaded)).toEqual(["backend"]);
    expect(loaded.backend.score).toBeGreaterThan(1);
  });

  it("decays old interactions when computing scores", () => {
    const now = Date.now();
    const state = recordChannelInteraction({}, "backend", 2, now - 40 * 24 * 60 * 60 * 1000);
    const scores = getChannelFrecencyScores(state, now);
    expect((scores.get("backend") || 0)).toBeLessThan(1);
  });
});
