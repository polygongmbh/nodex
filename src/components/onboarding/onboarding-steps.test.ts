import { describe, expect, it } from "vitest";
import { getOnboardingStepsBySection } from "./onboarding-steps";
import i18n from "@/lib/i18n/config";

describe("onboarding steps", () => {
  it("starts desktop navigation onboarding with task focus before breadcrumb and view switching", () => {
    const desktop = getOnboardingStepsBySection(false, "tree", i18n.getFixedT("en", "common"));
    const navigationIds = desktop.navigation.map((step) => step.id);

    expect(navigationIds).toEqual([
      "navigation-focus",
      "navigation-breadcrumb",
      "navigation-switcher",
    ]);
  });

  it("folds reset guidance into channel and people filter steps", () => {
    const desktop = getOnboardingStepsBySection(false, "tree", i18n.getFixedT("en", "common"));
    const filterIds = desktop.filters.map((step) => step.id);

    expect(filterIds).toEqual([
      "filters-relays",
      "filters-channels",
      "filters-people",
      "filters-search",
      "filters-hashtag-content",
    ]);
    expect(desktop.filters.find((step) => step.id === "filters-reset")).toBeUndefined();

    const channelStep = desktop.filters.find((step) => step.id === "filters-channels");
    const peopleStep = desktop.filters.find((step) => step.id === "filters-people");
    const searchStep = desktop.filters.find((step) => step.id === "filters-search");

    expect(channelStep?.description).toContain("left of *Channels*");
    expect(peopleStep?.description).toContain("left of *People*");
    expect(channelStep?.description).toContain("show only posts with that channel");
    expect(peopleStep?.description).toContain("show only content involving that person");
    expect(channelStep?.requiredAction).toBeUndefined();
    expect(peopleStep?.requiredAction).toBeUndefined();
    expect(searchStep?.target).toBe('[data-onboarding="search-bar"]');
  });

  it("provides dedicated kanban and calendar guide steps on desktop", () => {
    const t = i18n.getFixedT("en", "common");
    const kanban = getOnboardingStepsBySection(false, "kanban", t);
    const calendar = getOnboardingStepsBySection(false, "calendar", t);

    expect(kanban.compose.map((step) => step.id)).toEqual([
      "kanban-columns-status",
      "kanban-create-in-column",
      "kanban-depth",
    ]);
    expect(kanban.compose[2]?.target).toBe('[data-onboarding="kanban-levels"]');

    expect(calendar.compose.map((step) => step.id)).toEqual([
      "calendar-months",
      "calendar-pick-day",
      "calendar-day-panel",
    ]);
    expect(calendar.compose[2]?.target).toBe('[data-onboarding="calendar-day-panel"]');
  });
});
