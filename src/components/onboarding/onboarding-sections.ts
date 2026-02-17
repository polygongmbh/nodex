import { OnboardingSection } from "./onboarding-types";

const baseOnboardingSections: OnboardingSection[] = [
  {
    id: "navigation",
    title: "Navigation",
    description: "Use view tabs and breadcrumbs to move through task contexts.",
  },
  {
    id: "filters",
    title: "Filters",
    description: "Use include/exclude channel and people filters effectively.",
  },
  {
    id: "compose",
    title: "Compose",
    description: "Post tasks/comments with #tags and @mentions.",
  },
];

type GuideView = "tree" | "feed" | "kanban" | "calendar" | "list";

export function getOnboardingSections(isMobile: boolean, view: GuideView): OnboardingSection[] {
  if (isMobile) return baseOnboardingSections;
  if (view === "kanban") {
    return [
      baseOnboardingSections[0],
      baseOnboardingSections[1],
      {
        id: "compose",
        title: "Kanban",
        description: "Use columns, status lanes, and depth controls to organize work.",
      },
    ];
  }
  if (view === "calendar") {
    return [
      baseOnboardingSections[0],
      baseOnboardingSections[1],
      {
        id: "compose",
        title: "Calendar",
        description: "Plan tasks by date and review each day in the detail panel.",
      },
    ];
  }
  return baseOnboardingSections;
}
