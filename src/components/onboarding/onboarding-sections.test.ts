import { describe, expect, it } from "vitest";
import { getOnboardingSections } from "./onboarding-sections";

describe("onboarding sections", () => {
  it("uses dedicated third-section labels for desktop kanban and calendar", () => {
    const kanbanSections = getOnboardingSections(false, "kanban");
    const calendarSections = getOnboardingSections(false, "calendar");

    expect(kanbanSections[2]?.title).toBe("Kanban");
    expect(kanbanSections[2]?.description).toContain("depth controls");
    expect(calendarSections[2]?.title).toBe("Calendar");
    expect(calendarSections[2]?.description).toContain("detail panel");
  });
});
