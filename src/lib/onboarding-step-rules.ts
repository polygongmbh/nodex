const COMPOSE_GUIDE_STEP_IDS = new Set([
  "compose-kind",
  "compose-input",
  "mobile-compose-combobox",
]);

const NAVIGATION_FOCUS_STEP_IDS = new Set([
  "navigation-focus",
  "mobile-navigation-focus",
]);

const NAVIGATION_BREADCRUMB_STEP_IDS = new Set([
  "navigation-breadcrumb",
  "mobile-navigation-breadcrumb",
]);

const MOBILE_FORCE_FEED_AND_RESET_STEP_IDS = new Set([
  "mobile-navigation-focus",
]);

const FILTER_RESET_STEP_IDS = new Set([
  "filters-channels",
  "filters-hashtag-content",
]);

const DESKTOP_PREOPEN_COMPOSE_STEP_IDS = new Set([
  "filters-hashtag-content",
]);

export function isComposeGuideStep(stepId: string | null | undefined): boolean {
  return Boolean(stepId && COMPOSE_GUIDE_STEP_IDS.has(stepId));
}

export function isNavigationFocusStep(stepId: string | null | undefined): boolean {
  return Boolean(stepId && NAVIGATION_FOCUS_STEP_IDS.has(stepId));
}

export function isNavigationBreadcrumbStep(stepId: string | null | undefined): boolean {
  return Boolean(stepId && NAVIGATION_BREADCRUMB_STEP_IDS.has(stepId));
}

export function shouldForceFeedAndResetFiltersOnStep(
  stepId: string | null | undefined,
  isMobile: boolean
): boolean {
  return Boolean(isMobile && stepId && MOBILE_FORCE_FEED_AND_RESET_STEP_IDS.has(stepId));
}

export function isFilterResetStep(stepId: string | null | undefined): boolean {
  return Boolean(stepId && FILTER_RESET_STEP_IDS.has(stepId));
}

export function shouldPreopenComposeOnDesktop(stepId: string | null | undefined): boolean {
  return Boolean(stepId && DESKTOP_PREOPEN_COMPOSE_STEP_IDS.has(stepId));
}
