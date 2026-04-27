import { isComposeGuideStep, shouldPreopenComposeOnDesktop } from "@/lib/onboarding-step-rules";

interface ComposeForceParams {
  isOnboardingOpen: boolean;
  activeOnboardingStepId: string | null;
  isMobile: boolean;
  currentView?: "tree" | "feed" | "kanban" | "calendar" | "list";
}

export function shouldForceComposeForGuide({
  isOnboardingOpen,
  activeOnboardingStepId,
  isMobile,
  currentView = "tree",
}: ComposeForceParams): boolean {
  if (!isOnboardingOpen) return false;
  if (!isMobile && (currentView === "kanban" || currentView === "calendar")) {
    return false;
  }
  if (isComposeGuideStep(activeOnboardingStepId)) return true;
  if (!isMobile && shouldPreopenComposeOnDesktop(activeOnboardingStepId)) return true;
  return false;
}

