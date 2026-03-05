import { beforeEach, describe, expect, it } from "vitest";
import { loadPublishDelayEnabled, savePublishDelayEnabled } from "./publish-delay-preferences";

describe("publish-delay-preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to disabled when nothing is stored", () => {
    expect(loadPublishDelayEnabled()).toBe(false);
  });

  it("persists explicit opt-out", () => {
    savePublishDelayEnabled(false);
    expect(loadPublishDelayEnabled()).toBe(false);
  });
});
