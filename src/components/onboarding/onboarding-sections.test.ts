import { describe, expect, it } from "vitest";
import { getOnboardingSections } from "./onboarding-sections";

const t = ((key: string) => key) as Parameters<typeof getOnboardingSections>[2];

describe("onboarding sections", () => {
  it("uses dedicated third-section labels for desktop kanban and calendar", () => {
    const kanbanSections = getOnboardingSections(false, "kanban", t);
    const calendarSections = getOnboardingSections(false, "calendar", t);

    expect(kanbanSections[2]).toMatchObject({
      id: "compose",
      title: "onboarding.sections.kanban.title",
      description: "onboarding.sections.kanban.description",
    });
    expect(calendarSections[2]).toMatchObject({
      id: "compose",
      title: "onboarding.sections.calendar.title",
      description: "onboarding.sections.calendar.description",
    });
  });
});
