import { describe, expect, it } from "vitest";
import {
  isComposeGuideStep,
  isFilterResetStep,
  isNavigationBreadcrumbStep,
  isNavigationFocusStep,
  shouldPreopenComposeOnDesktop,
  shouldForceFeedAndResetFiltersOnStep,
} from "./onboarding-step-rules";

describe("onboarding step rules", () => {
  it("identifies compose guidance steps", () => {
    expect(isComposeGuideStep("compose-kind")).toBe(true);
    expect(isComposeGuideStep("mobile-compose-combobox")).toBe(true);
    expect(isComposeGuideStep("filters-hashtag-content")).toBe(false);
  });

  it("keeps existing navigation focus step matching", () => {
    expect(isNavigationFocusStep("navigation-focus")).toBe(true);
    expect(isNavigationFocusStep("mobile-navigation-focus")).toBe(true);
    expect(isNavigationFocusStep("filters-channels")).toBe(false);
  });

  it("keeps existing breadcrumb navigation step matching", () => {
    expect(isNavigationBreadcrumbStep("navigation-breadcrumb")).toBe(true);
    expect(isNavigationBreadcrumbStep("mobile-navigation-breadcrumb")).toBe(true);
    expect(isNavigationBreadcrumbStep("navigation-focus")).toBe(false);
  });

  it("keeps existing filter reset step matching", () => {
    expect(isFilterResetStep("filters-channels")).toBe(true);
    expect(isFilterResetStep("filters-hashtag-content")).toBe(true);
    expect(isFilterResetStep("mobile-navigation-focus")).toBe(false);
  });

  it("keeps desktop compose pre-open mapping", () => {
    expect(shouldPreopenComposeOnDesktop("filters-hashtag-content")).toBe(true);
    expect(shouldPreopenComposeOnDesktop("compose-kind")).toBe(false);
  });

  it("forces feed + filter reset only for mobile guide step two", () => {
    expect(shouldForceFeedAndResetFiltersOnStep("mobile-navigation-focus", true)).toBe(true);
    expect(shouldForceFeedAndResetFiltersOnStep("mobile-navigation-focus", false)).toBe(false);
    expect(shouldForceFeedAndResetFiltersOnStep("navigation-focus", true)).toBe(false);
  });
});
