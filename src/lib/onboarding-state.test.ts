import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STATE_STORAGE_KEY,
  ONBOARDING_VERSION,
  loadOnboardingState,
  markOnboardingCompleted,
  resetOnboardingState,
} from "./onboarding-state";

describe("onboarding-state", () => {
  it("defaults to incomplete state", () => {
    localStorage.removeItem(ONBOARDING_STATE_STORAGE_KEY);

    expect(loadOnboardingState()).toEqual({
      version: ONBOARDING_VERSION,
      completed: false,
      lastStep: undefined,
    });
  });

  it("marks onboarding complete and stores final step", () => {
    markOnboardingCompleted(6);

    expect(loadOnboardingState()).toEqual({
      version: ONBOARDING_VERSION,
      completed: true,
      lastStep: 6,
    });
  });

  it("resets onboarding state", () => {
    markOnboardingCompleted(2);
    resetOnboardingState();

    expect(loadOnboardingState().completed).toBe(false);
  });

  it("invalid stored payload falls back safely", () => {
    localStorage.setItem(ONBOARDING_STATE_STORAGE_KEY, "invalid-json");

    expect(loadOnboardingState().completed).toBe(false);
  });

  it("older version payload is treated as unseen", () => {
    localStorage.setItem(
      ONBOARDING_STATE_STORAGE_KEY,
      JSON.stringify({ version: ONBOARDING_VERSION - 1, completed: true })
    );

    expect(loadOnboardingState()).toEqual({
      version: ONBOARDING_VERSION,
      completed: false,
      lastStep: undefined,
    });
  });
});
