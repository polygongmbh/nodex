import type { OnboardingSectionId } from "@/components/onboarding/onboarding-types";
import { isComposeGuideStep, shouldPreopenComposeOnDesktop } from "@/lib/onboarding-step-rules";

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
  if (isComposeGuideStep(activeOnboardingStepId)) return true;
  if (!isMobile && shouldPreopenComposeOnDesktop(activeOnboardingStepId)) return true;
  return false;
}

export function getOnboardingBehaviorGateId(stepId: string): string {
  return stepId;
}
