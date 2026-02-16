import type { OnboardingSectionId } from "@/components/onboarding/onboarding-types";

interface ComposeForceParams {
  isOnboardingOpen: boolean;
  activeOnboardingSection: OnboardingSectionId | null;
  activeOnboardingStepId: string | null;
  isMobile: boolean;
}

export function shouldForceComposeForGuide({
  isOnboardingOpen,
  activeOnboardingSection,
  activeOnboardingStepId,
  isMobile,
}: ComposeForceParams): boolean {
  if (!isOnboardingOpen) return false;
  if (activeOnboardingSection === "compose") return true;
  if (activeOnboardingStepId === "compose-kind" || activeOnboardingStepId === "compose-input") {
    return true;
  }
  if (activeOnboardingStepId === "mobile-compose-combobox") return true;

  // Pre-open desktop compose one step before compose-kind so step 8 anchors correctly.
  if (!isMobile && activeOnboardingStepId === "filters-hashtag-content") return true;
  return false;
}

export function getOnboardingBehaviorGateId(stepId: string): string {
  return stepId;
}
