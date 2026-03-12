import type { TFunction } from "i18next";
import { OnboardingSectionId, OnboardingStep } from "./onboarding-types";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";

type StepMap = Record<OnboardingSectionId, OnboardingStep[]>;
type GuideView = "tree" | "feed" | "kanban" | "calendar" | "list";

export function getOnboardingStepsBySection(
  isMobile: boolean,
  view: GuideView = "tree",
  t: TFunction
): StepMap {
  const alternateModifier = getAlternateModifierLabel();

  const desktopStepsBySection: StepMap = {
    navigation: [
      {
        id: "navigation-focus",
        title: t("onboarding.steps.navigationFocus.title"),
        description: t("onboarding.steps.navigationFocus.description"),
        target: '[data-onboarding="task-list"]',
        requiredAction: "click-target",
        actionPrompt: t("onboarding.steps.navigationFocus.action"),
      },
      {
        id: "navigation-breadcrumb",
        title: t("onboarding.steps.navigationBreadcrumb.title"),
        description: t("onboarding.steps.navigationBreadcrumb.description"),
        target: '[data-onboarding="focused-breadcrumb"]',
        requiredAction: "click-target",
        actionPrompt: t("onboarding.steps.navigationBreadcrumb.action"),
      },
      {
        id: "navigation-switcher",
        title: t("onboarding.steps.navigationSwitcher.title"),
        description: t("onboarding.steps.navigationSwitcher.description"),
        target: '[data-onboarding="view-switcher"]',
        requiredAction: "click-target",
        actionPrompt: t("onboarding.steps.navigationSwitcher.action"),
      },
    ],
    filters: [
      {
        id: "filters-relays",
        title: t("onboarding.steps.filtersRelays.title"),
        description: t("onboarding.steps.filtersRelays.description"),
        target: '[data-onboarding="relays-section"]',
        requiredAction: "click-target",
        actionPrompt: t("onboarding.steps.filtersRelays.action"),
      },
      {
        id: "filters-channels",
        title: t("onboarding.steps.filtersChannels.title"),
        description: t("onboarding.steps.filtersChannels.description"),
        target: '[data-onboarding="channels-section"]',
      },
      {
        id: "filters-people",
        title: t("onboarding.steps.filtersPeople.title"),
        description: t("onboarding.steps.filtersPeople.description"),
        target: '[data-onboarding="people-section"]',
      },
      {
        id: "filters-search",
        title: t("onboarding.steps.filtersSearch.title"),
        description: t("onboarding.steps.filtersSearch.description"),
        target: '[data-onboarding="search-bar"]',
      },
      {
        id: "filters-hashtag-content",
        title: t("onboarding.steps.filtersHashtagContent.title"),
        description: t("onboarding.steps.filtersHashtagContent.description"),
        target: '[data-onboarding="content-hashtag"]',
        requiredAction: "click-target",
        actionPrompt: t("onboarding.steps.filtersHashtagContent.action"),
      },
    ],
    compose: [
      {
        id: "compose-kind",
        title: t("onboarding.steps.composeKind.title"),
        description: t("onboarding.steps.composeKind.description"),
        target: '[data-onboarding="compose-kind"]',
        requiredAction: "focus-target",
        actionPrompt: t("onboarding.steps.composeKind.action"),
      },
      {
        id: "compose-input",
        title: t("onboarding.steps.composeInput.title"),
        description: t("onboarding.steps.composeInput.description"),
        target: '[data-onboarding="compose-input"]',
        actionPrompt: t("onboarding.steps.composeInput.action", { alternateModifier }),
      },
    ],
  };

  const mobileStepsBySection: StepMap = {
    navigation: [
      {
        id: "mobile-navigation-nav",
        title: t("onboarding.steps.mobileNavigationNav.title"),
        description: t("onboarding.steps.mobileNavigationNav.description"),
        target: '[data-onboarding="mobile-nav"]',
        requiredAction: "click-target",
        actionPrompt: t("onboarding.steps.mobileNavigationNav.action"),
      },
      {
        id: "mobile-navigation-focus",
        title: t("onboarding.steps.mobileNavigationFocus.title"),
        description: t("onboarding.steps.mobileNavigationFocus.description"),
        target: '[data-onboarding="task-list"]',
        requiredAction: "click-target",
        actionPrompt: t("onboarding.steps.mobileNavigationFocus.action"),
      },
      {
        id: "mobile-navigation-breadcrumb",
        title: t("onboarding.steps.mobileNavigationBreadcrumb.title"),
        description: t("onboarding.steps.mobileNavigationBreadcrumb.description"),
        target: '[data-onboarding="focused-breadcrumb"]',
        requiredAction: "click-target",
        actionPrompt: t("onboarding.steps.mobileNavigationBreadcrumb.action"),
      },
    ],
    filters: [
      {
        id: "mobile-filters-open",
        title: t("onboarding.steps.mobileFiltersOpen.title"),
        description: t("onboarding.steps.mobileFiltersOpen.description"),
        target: '[data-onboarding="mobile-nav-manage"]',
        requiredAction: "click-target",
        actionPrompt: t("onboarding.steps.mobileFiltersOpen.action"),
      },
      {
        id: "mobile-filters-properties",
        title: t("onboarding.steps.mobileFiltersProperties.title"),
        description: t("onboarding.steps.mobileFiltersProperties.description"),
        target: '[data-onboarding="mobile-filters-profile"]',
      },
      {
        id: "mobile-filters-use",
        title: t("onboarding.steps.mobileFiltersUse.title"),
        description: t("onboarding.steps.mobileFiltersUse.description"),
        target: '[data-onboarding="mobile-filters-channels"]',
      },
    ],
    compose: [
      {
        id: "mobile-compose-combobox",
        title: t("onboarding.steps.mobileComposeCombobox.title"),
        description: t("onboarding.steps.mobileComposeCombobox.description"),
        target: '[data-onboarding="mobile-combined-box"]',
        requiredAction: "click-target",
        actionPrompt: t("onboarding.steps.mobileComposeCombobox.action"),
      },
    ],
  };

  if (isMobile) return mobileStepsBySection;

  if (view === "kanban") {
    return {
      ...desktopStepsBySection,
      compose: [
        {
          id: "kanban-columns-status",
          title: t("onboarding.steps.kanbanColumnsStatus.title"),
          description: t("onboarding.steps.kanbanColumnsStatus.description"),
          target: '[data-onboarding="kanban-columns"]',
          requiredAction: "click-target",
          actionPrompt: t("onboarding.steps.kanbanColumnsStatus.action"),
        },
        {
          id: "kanban-create-in-column",
          title: t("onboarding.steps.kanbanCreateInColumn.title"),
          description: t("onboarding.steps.kanbanCreateInColumn.description"),
          target: '[data-onboarding="kanban-add-task"]',
          requiredAction: "click-target",
          actionPrompt: t("onboarding.steps.kanbanCreateInColumn.action"),
        },
        {
          id: "kanban-depth",
          title: t("onboarding.steps.kanbanDepth.title"),
          description: t("onboarding.steps.kanbanDepth.description"),
          target: '[data-onboarding="kanban-levels"]',
          requiredAction: "click-target",
          actionPrompt: t("onboarding.steps.kanbanDepth.action"),
        },
      ],
    };
  }

  if (view === "calendar") {
    return {
      ...desktopStepsBySection,
      compose: [
        {
          id: "calendar-months",
          title: t("onboarding.steps.calendarMonths.title"),
          description: t("onboarding.steps.calendarMonths.description"),
          target: '[data-onboarding="calendar-month-stack"]',
        },
        {
          id: "calendar-pick-day",
          title: t("onboarding.steps.calendarPickDay.title"),
          description: t("onboarding.steps.calendarPickDay.description"),
          target: '[data-onboarding="calendar-month-stack"]',
          requiredAction: "click-target",
          actionPrompt: t("onboarding.steps.calendarPickDay.action"),
        },
        {
          id: "calendar-day-panel",
          title: t("onboarding.steps.calendarDayPanel.title"),
          description: t("onboarding.steps.calendarDayPanel.description"),
          target: '[data-onboarding="calendar-day-panel"]',
        },
      ],
    };
  }

  return desktopStepsBySection;
}

export function getOnboardingAllSteps(stepsBySection: StepMap): OnboardingStep[] {
  return [
    ...(stepsBySection.navigation ?? []),
    ...(stepsBySection.filters ?? []),
    ...(stepsBySection.compose ?? []),
  ];
}
