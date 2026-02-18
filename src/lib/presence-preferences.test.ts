import { beforeEach, describe, expect, it } from "vitest";
import { loadPresencePublishingEnabled, savePresencePublishingEnabled } from "./presence-preferences";

describe("presence-preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to enabled when nothing is stored", () => {
    expect(loadPresencePublishingEnabled()).toBe(true);
  });

  it("persists explicit opt-out", () => {
    savePresencePublishingEnabled(false);
    expect(loadPresencePublishingEnabled()).toBe(false);
  });
});
