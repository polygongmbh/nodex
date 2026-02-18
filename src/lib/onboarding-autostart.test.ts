import { describe, expect, it } from "vitest";
import { shouldAutoStartOnboarding } from "./onboarding-autostart";

describe("shouldAutoStartOnboarding", () => {
  it("returns false when onboarding is already completed", () => {
    expect(
      shouldAutoStartOnboarding({
        onboardingCompleted: true,
        openedWithFocusedTask: false,
      })
    ).toBe(false);
  });

  it("returns false when page opened with a focused task", () => {
    expect(
      shouldAutoStartOnboarding({
        onboardingCompleted: false,
        openedWithFocusedTask: true,
      })
    ).toBe(false);
  });

  it("returns true only when onboarding is incomplete and no focused task exists", () => {
    expect(
      shouldAutoStartOnboarding({
        onboardingCompleted: false,
        openedWithFocusedTask: false,
      })
    ).toBe(true);
  });
});

