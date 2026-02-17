import { describe, expect, it } from "vitest";
import {
  isComposeGuideStep,
  isFilterResetStep,
  isNavigationBreadcrumbStep,
  isNavigationFocusStep,
  shouldPreopenComposeOnDesktop,
} from "./onboarding-step-rules";

describe("onboarding step rules", () => {
  it("identifies compose guidance steps", () => {
    expect(isComposeGuideStep("compose-kind")).toBe(true);
    expect(isComposeGuideStep("mobile-compose-combobox")).toBe(true);
    expect(isComposeGuideStep("filters-hashtag-content")).toBe(false);
  });

  it("identifies focus and breadcrumb navigation steps", () => {
    expect(isNavigationFocusStep("navigation-focus")).toBe(true);
    expect(isNavigationFocusStep("mobile-navigation-focus")).toBe(true);
    expect(isNavigationBreadcrumbStep("navigation-breadcrumb")).toBe(true);
    expect(isNavigationBreadcrumbStep("mobile-navigation-breadcrumb")).toBe(true);
  });

  it("identifies filter reset trigger steps", () => {
    expect(isFilterResetStep("filters-channels")).toBe(true);
    expect(isFilterResetStep("filters-hashtag-content")).toBe(true);
    expect(isFilterResetStep("filters-search")).toBe(false);
  });

  it("limits desktop compose pre-open to configured steps", () => {
    expect(shouldPreopenComposeOnDesktop("filters-hashtag-content")).toBe(true);
    expect(shouldPreopenComposeOnDesktop("compose-kind")).toBe(false);
  });
});
