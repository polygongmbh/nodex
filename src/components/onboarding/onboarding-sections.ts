import type { TFunction } from "i18next";
import { OnboardingSection } from "./onboarding-types";

type GuideView = "tree" | "feed" | "kanban" | "calendar" | "list";

export function getOnboardingSections(isMobile: boolean, view: GuideView, t: TFunction): OnboardingSection[] {
  const baseOnboardingSections: OnboardingSection[] = [
    {
      id: "navigation",
      title: t("onboarding.sections.navigation.title"),
      description: t("onboarding.sections.navigation.description"),
    },
    {
      id: "filters",
      title: t("onboarding.sections.filters.title"),
      description: t("onboarding.sections.filters.description"),
    },
    {
      id: "compose",
      title: t("onboarding.sections.compose.title"),
      description: t("onboarding.sections.compose.description"),
    },
  ];

  if (isMobile) return baseOnboardingSections;
  if (view === "kanban") {
    return [
      baseOnboardingSections[0],
      baseOnboardingSections[1],
      {
        id: "compose",
        title: t("onboarding.sections.kanban.title"),
        description: t("onboarding.sections.kanban.description"),
      },
    ];
  }
  if (view === "calendar") {
    return [
      baseOnboardingSections[0],
      baseOnboardingSections[1],
      {
        id: "compose",
        title: t("onboarding.sections.calendar.title"),
        description: t("onboarding.sections.calendar.description"),
      },
    ];
  }
  return baseOnboardingSections;
}
