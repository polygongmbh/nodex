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
      requiredAction: "click-target",
      actionPrompt: "Click a breadcrumb item to continue.",
    },
  ],
  filters: [
    {
      id: "filters-relays",
      title: "Relay selection",
      description: "Use *Feeds* to select which relays are visible. Click a relay name to toggle it, or click its icon for exclusive relay focus.",
      target: '[data-onboarding="relays-section"]',
      requiredAction: "click-target",
      actionPrompt: "Click a relay control to continue.",
    },
    {
      id: "filters-channels",
      title: "Channel filters",
      description: "In *Channels*, click a channel name to show only posts with that channel. Click the # icon to cycle neutral → include → exclude for that channel. Click the hashtag icon to the left of *Channels* to reset channel filters.",
      target: '[data-onboarding="channels-section"]',
    },
    {
      id: "filters-people",
      title: "People filters",
      description: "In *People*, click a person name to show only posts from that person. Click the avatar/icon to toggle that person. Click the icon to the left of *People* to reset people filters.",
      target: '[data-onboarding="people-section"]',
    },
    {
      id: "filters-search",
      title: "Search bar",
      description: "Use the bottom search bar to narrow visible tasks by text across all views.",
      target: '[data-onboarding="search-bar"]',
    },
    {
      id: "filters-hashtag-content",
      title: "Hashtags in content",
      description:
        "Click a hashtag in a task to focus on that tag. Clear the tag filter to return to the full list.",
      target: '[data-onboarding="content-hashtag"]',
      requiredAction: "click-target",
      actionPrompt: "Click a hashtag chip in a task item.",
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
      description:
        "Use #tags to organize items and @mentions to reference people in the compose box. Alt+Enter submits as the other kind when no autocomplete is open; with autocomplete open, modifier+Enter can add the selected tag/mention as metadata without inserting token text.",
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
    {
      id: "mobile-navigation-breadcrumb",
      title: "Use breadcrumbs",
      description: "Use the breadcrumb row to move up the hierarchy or jump between parent tasks.",
      target: '[data-onboarding="focused-breadcrumb"]',
      requiredAction: "click-target",
      actionPrompt: "Tap a breadcrumb item to continue.",
    },
  ],
  filters: [
    {
      id: "mobile-filters-open",
      title: "Open Manage",
      description: "Tap *Manage* in the top navigation to open relay, channel, and people filters.",
      target: '[aria-label="Switch to Manage view"]',
      requiredAction: "click-target",
      actionPrompt: "Tap *Manage* to continue.",
    },
    {
      id: "mobile-filters-use",
      title: "Use filters",
      description: "In *Manage*, tap feed chips to select relays, channel chips to cycle neutral → include → exclude, and people chips to toggle people filters.",
      target: '[data-onboarding="mobile-filters"]',
    },
  ],
  compose: [
    {
      id: "mobile-compose-combobox",
      title: "Search/Compose combobox",
      description: "Use the combined bottom bar to search as you type and create tasks/comments from the same text using the submit button.",
      target: '[data-onboarding="mobile-combined-box"]',
      requiredAction: "click-target",
      actionPrompt: "Tap into the combined bar to continue.",
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
