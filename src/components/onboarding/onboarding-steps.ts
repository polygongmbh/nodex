import { OnboardingSectionId, OnboardingStep } from "./onboarding-types";

type StepMap = Record<OnboardingSectionId, OnboardingStep[]>;

const desktopStepsBySection: StepMap = {
  views: [
    {
      id: "views-switcher",
      title: "Switch views",
      description: "Use the view switcher to move between Tree, Feed, Kanban, Calendar, and Table.",
      target: '[data-onboarding="view-switcher"]',
    },
  ],
  filters: [
    {
      id: "filters-channels",
      title: "Channel filters",
      description: "Use include/exclude for channel tags in the Channels section.",
      target: '[data-onboarding="channels-section"]',
    },
    {
      id: "filters-hashtag-content",
      title: "Hashtags in content",
      description: "Click a hashtag in content to focus to only that tag.",
      target: '[data-onboarding="content-hashtag"]',
    },
    {
      id: "filters-reset",
      title: "Reset channel focus",
      description: "Click a hashtag in Channels to return to all channels again.",
      target: '[data-onboarding="channels-section"]',
    },
  ],
  focus: [
    {
      id: "focus-item",
      title: "Focus tasks",
      description: "Click an item to focus and inspect only its context.",
      target: '[data-onboarding="task-list"]',
    },
    {
      id: "focus-actions",
      title: "Create subtasks and comments",
      description: "In focused mode, compose new subtasks/comments in context.",
      target: '[data-onboarding="focused-compose"]',
    },
  ],
  compose: [
    {
      id: "compose-kind",
      title: "Task vs comment",
      description: "Use the Kind selector to choose whether to post a task or a comment.",
      target: '[data-onboarding="compose-kind"]',
    },
    {
      id: "compose-input",
      title: "Tags and mentions",
      description: "Use #release style tags and @mentions in the compose box.",
      target: '[data-onboarding="compose-input"]',
    },
  ],
};

const mobileStepsBySection: StepMap = {
  views: [
    {
      id: "mobile-views-nav",
      title: "Mobile views",
      description: "Use the bottom navigation to switch between Tree, Feed, List, and Calendar.",
      target: '[data-onboarding="mobile-nav"]',
    },
  ],
  filters: [
    {
      id: "mobile-filters",
      title: "Mobile filters",
      description: "Open Filters to include/exclude channels and filter people.",
      target: '[data-onboarding="mobile-filters"]',
    },
  ],
  focus: [
    {
      id: "mobile-focus",
      title: "Focus tasks",
      description: "Tap an item to focus it and then add subtasks/comments in context.",
      target: '[data-onboarding="task-list"]',
    },
  ],
  compose: [
    {
      id: "mobile-compose",
      title: "Compose",
      description: "Compose tasks/comments with #tags and @mentions from the bottom composer.",
      target: '[data-onboarding="compose-input"]',
    },
  ],
};

export function getOnboardingStepsBySection(isMobile: boolean): StepMap {
  return isMobile ? mobileStepsBySection : desktopStepsBySection;
}

export function getOnboardingAllSteps(stepsBySection: StepMap): OnboardingStep[] {
  return [
    ...(stepsBySection.views ?? []),
    ...(stepsBySection.filters ?? []),
    ...(stepsBySection.focus ?? []),
    ...(stepsBySection.compose ?? []),
  ];
}
