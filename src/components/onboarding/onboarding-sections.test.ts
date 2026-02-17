import { describe, expect, it } from "vitest";
import { getOnboardingSections } from "./onboarding-sections";
import i18n from "@/lib/i18n/config";

describe("onboarding sections", () => {
  it("uses dedicated third-section labels for desktop kanban and calendar", () => {
    const t = i18n.getFixedT("en", "common");
    const kanbanSections = getOnboardingSections(false, "kanban", t);
    const calendarSections = getOnboardingSections(false, "calendar", t);

    expect(kanbanSections[2]?.title).toBe("Kanban");
    expect(kanbanSections[2]?.description).toContain("depth controls");
    expect(calendarSections[2]?.title).toBe("Calendar");
    expect(calendarSections[2]?.description).toContain("detail panel");
  });
});
