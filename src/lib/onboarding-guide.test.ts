import { describe, expect, it } from "vitest";
import {
  getOnboardingBehaviorGateId,
  shouldForceComposeForGuide,
} from "./onboarding-guide";

describe("shouldForceComposeForGuide", () => {
  it("pre-opens compose on desktop during filters-hashtag-content", () => {
    expect(
      shouldForceComposeForGuide({
        isOnboardingOpen: true,
        activeOnboardingStepId: "filters-hashtag-content",
        isMobile: false,
      })
    ).toBe(true);
  });

  it("forces compose at compose-kind", () => {
    expect(
      shouldForceComposeForGuide({
        isOnboardingOpen: true,
        activeOnboardingStepId: "compose-kind",
        isMobile: true,
      })
    ).toBe(true);
  });

  it("does not pre-open compose on mobile during filters-hashtag-content", () => {
    expect(
      shouldForceComposeForGuide({
        isOnboardingOpen: true,
        activeOnboardingStepId: "filters-hashtag-content",
        isMobile: true,
      })
    ).toBe(false);
  });

  it("does not force compose in dedicated desktop kanban/calendar guides", () => {
    expect(
      shouldForceComposeForGuide({
        isOnboardingOpen: true,
        activeOnboardingStepId: "kanban-columns-overview",
        isMobile: false,
        currentView: "kanban",
      })
    ).toBe(false);

    expect(
      shouldForceComposeForGuide({
        isOnboardingOpen: true,
        activeOnboardingStepId: "calendar-months",
        isMobile: false,
        currentView: "calendar",
      })
    ).toBe(false);
  });
});

describe("getOnboardingBehaviorGateId", () => {
  it("uses step id as the stable behavior gate key", () => {
    expect(getOnboardingBehaviorGateId("compose-input")).toBe("compose-input");
  });
});
