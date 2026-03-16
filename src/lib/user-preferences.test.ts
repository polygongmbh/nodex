import { beforeEach, describe, expect, it } from "vitest";
import {
  loadAutoCaptionEnabled,
  loadCompletionSoundEnabled,
  loadPresencePublishingEnabled,
  loadPublishDelayEnabled,
  saveAutoCaptionEnabled,
  saveCompletionSoundEnabled,
  savePresencePublishingEnabled,
  savePublishDelayEnabled,
} from "./user-preferences";

describe("user-preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("presence", () => {
    it("defaults to enabled", () => {
      expect(loadPresencePublishingEnabled()).toBe(true);
    });
    it("persists false", () => {
      savePresencePublishingEnabled(false);
      expect(loadPresencePublishingEnabled()).toBe(false);
    });
    it("persists true", () => {
      savePresencePublishingEnabled(false);
      savePresencePublishingEnabled(true);
      expect(loadPresencePublishingEnabled()).toBe(true);
    });
  });

  describe("auto-caption", () => {
    it("defaults to disabled", () => {
      expect(loadAutoCaptionEnabled()).toBe(false);
    });
    it("persists true", () => {
      saveAutoCaptionEnabled(true);
      expect(loadAutoCaptionEnabled()).toBe(true);
    });
  });

  describe("publish-delay", () => {
    it("defaults to disabled", () => {
      expect(loadPublishDelayEnabled()).toBe(false);
    });
    it("persists false", () => {
      savePublishDelayEnabled(false);
      expect(loadPublishDelayEnabled()).toBe(false);
    });
  });

  describe("completion-sound", () => {
    it("defaults to enabled", () => {
      expect(loadCompletionSoundEnabled()).toBe(true);
    });
    it("persists false", () => {
      saveCompletionSoundEnabled(false);
      expect(loadCompletionSoundEnabled()).toBe(false);
    });
  });
});
