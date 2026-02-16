import { describe, expect, it } from "vitest";
import { getOnboardingBehaviorGateId, shouldForceComposeForGuide } from "./onboarding-guide";

describe("shouldForceComposeForGuide", () => {
  it("does not force-open compose during filters-hashtag-content", () => {
    expect(
      shouldForceComposeForGuide({
        isOnboardingOpen: true,
        activeOnboardingSection: null,
        activeOnboardingStepId: "filters-hashtag-content",
        isMobile: false,
      })
    ).toBe(false);
  });

  it("forces compose at compose-kind", () => {
    expect(
      shouldForceComposeForGuide({
        isOnboardingOpen: true,
        activeOnboardingSection: null,
        activeOnboardingStepId: "compose-kind",
        isMobile: true,
      })
    ).toBe(true);
  });
});

describe("getOnboardingBehaviorGateId", () => {
  it("uses step id as the stable behavior gate key", () => {
    expect(getOnboardingBehaviorGateId("compose-input")).toBe("compose-input");
  });
});
