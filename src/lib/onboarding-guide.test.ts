import { describe, expect, it } from "vitest";
import { shouldForceComposeForGuide } from "./onboarding-guide";

describe("shouldForceComposeForGuide", () => {
  it("pre-opens compose on desktop at filters-hashtag-content for step 8 anchoring", () => {
    expect(
      shouldForceComposeForGuide({
        isOnboardingOpen: true,
        activeOnboardingSection: null,
        activeOnboardingStepId: "filters-hashtag-content",
        isMobile: false,
      })
    ).toBe(true);
  });

  it("does not pre-open compose on mobile at filters-hashtag-content", () => {
    expect(
      shouldForceComposeForGuide({
        isOnboardingOpen: true,
        activeOnboardingSection: null,
        activeOnboardingStepId: "filters-hashtag-content",
        isMobile: true,
      })
    ).toBe(false);
  });
});
