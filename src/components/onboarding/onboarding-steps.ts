import { OnboardingSectionId, OnboardingStep } from "./onboarding-types";

type StepMap = Record<OnboardingSectionId, OnboardingStep[]>;

const desktopStepsBySection: StepMap = {
  navigation: [
    {
      id: "navigation-switcher",
      title: "Switch views",
      description: "Use the view switcher to move between Tree, Feed, Kanban, Calendar, and Table.",
      target: '[data-onboarding="view-switcher"]',
      requiredAction: "click-target",
      actionPrompt: "Click any view tab to continue.",
    },
    {
      id: "navigation-focus",
      title: "Open task context",
      description: "Click a task to navigate into its context and reveal the breadcrumb path.",
      target: '[data-onboarding="task-list"]',
      requiredAction: "click-target",
      actionPrompt: "Click a task item to continue.",
    },
    {
      id: "navigation-breadcrumb",
      title: "Use breadcrumbs",
      description: "Use the breadcrumb row to move up the hierarchy or jump between parent tasks.",
      target: '[data-onboarding="focused-breadcrumb"]',
    },
  ],
  filters: [
    {
      id: "filters-relays",
      title: "Relay selection",
      description: "Use Feeds to select which relays are visible. Click a relay name to toggle it, or click its icon for exclusive relay focus.",
      target: '[data-onboarding="relays-section"]',
      requiredAction: "click-target",
      actionPrompt: "Click a relay control to continue.",
    },
    {
      id: "filters-channels",
      title: "Channel filters",
      description: "In Channels, click a channel name to cycle neutral → include → exclude. Click the # icon to show only that channel.",
      target: '[data-onboarding="channels-section"]',
      requiredAction: "click-target",
      actionPrompt: "Click a channel control to continue.",
    },
    {
      id: "filters-people",
      title: "People filters",
      description: "In People, click a person name to toggle that person. Click the avatar/icon to show only that person.",
      target: '[data-onboarding="people-section"]',
      requiredAction: "click-target",
      actionPrompt: "Click a person control to continue.",
    },
    {
      id: "filters-hashtag-content",
      title: "Hashtags in content",
      description: "Click a hashtag in content to focus to only that tag.",
      target: '[data-onboarding="content-hashtag"]',
      requiredAction: "click-target",
      actionPrompt: "Click a hashtag chip in a task item.",
    },
    {
      id: "filters-reset",
      title: "Reset channel focus",
      description: "Reset channels by cycling tags back to neutral, or use the Channels header icon (in the section title row) to toggle all included/reset.",
      target: '[data-onboarding="channels-section"]',
    },
  ],
  compose: [
    {
      id: "compose-kind",
      title: "Task vs comment",
      description: "Use the Kind selector to choose whether to post a task or a comment.",
      target: '[data-onboarding="compose-kind"]',
      requiredAction: "focus-target",
      actionPrompt: "Focus the kind selector to continue.",
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
  navigation: [
    {
      id: "mobile-navigation-nav",
      title: "Mobile views",
      description: "Use the top navigation to switch between Tree, Feed, List, and Calendar.",
      target: '[data-onboarding="mobile-nav"]',
      requiredAction: "click-target",
      actionPrompt: "Tap a navigation tab to continue.",
    },
    {
      id: "mobile-navigation-focus",
      title: "Navigate into a task",
      description: "Tap a task item to open its focused context and navigation path.",
      target: '[data-onboarding="task-list"]',
      requiredAction: "click-target",
      actionPrompt: "Tap a task item to continue.",
    },
  ],
  filters: [
    {
      id: "mobile-filters-open",
      title: "Open Manage",
      description: "Tap Manage in the top navigation to open relay, channel, and people filters.",
      target: '[aria-label="Switch to Manage view"]',
      requiredAction: "click-target",
      actionPrompt: "Tap Manage to continue.",
    },
    {
      id: "mobile-filters-use",
      title: "Use filters",
      description: "In Manage, tap feed chips to select relays, channel chips to cycle neutral → include → exclude, and people chips to toggle people filters.",
      target: '[data-onboarding="mobile-filters"]',
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
    ...(stepsBySection.navigation ?? []),
    ...(stepsBySection.filters ?? []),
    ...(stepsBySection.compose ?? []),
  ];
}
