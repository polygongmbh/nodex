import { describe, expect, it } from "vitest";
import { getOnboardingStepsBySection } from "./onboarding-steps";

describe("onboarding steps", () => {
  it("folds reset guidance into channel and people filter steps", () => {
    const desktop = getOnboardingStepsBySection(false);
    const filterIds = desktop.filters.map((step) => step.id);

    expect(filterIds).toEqual([
      "filters-relays",
      "filters-channels",
      "filters-people",
      "filters-hashtag-content",
    ]);
    expect(desktop.filters.find((step) => step.id === "filters-reset")).toBeUndefined();

    const channelStep = desktop.filters.find((step) => step.id === "filters-channels");
    const peopleStep = desktop.filters.find((step) => step.id === "filters-people");

    expect(channelStep?.description).toContain("left of Channels");
    expect(peopleStep?.description).toContain("left of People");
    expect(channelStep?.description).toContain("show only that channel");
    expect(peopleStep?.description).toContain("show only that person");
    expect(channelStep?.requiredAction).toBeUndefined();
    expect(peopleStep?.requiredAction).toBeUndefined();
  });
});
