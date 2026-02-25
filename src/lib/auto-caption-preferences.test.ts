import { beforeEach, describe, expect, it } from "vitest";
import { loadAutoCaptionEnabled, saveAutoCaptionEnabled } from "./auto-caption-preferences";

describe("auto-caption-preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to disabled when nothing is stored", () => {
    expect(loadAutoCaptionEnabled()).toBe(false);
  });

  it("persists explicit opt-in", () => {
    saveAutoCaptionEnabled(true);
    expect(loadAutoCaptionEnabled()).toBe(true);
  });
});
