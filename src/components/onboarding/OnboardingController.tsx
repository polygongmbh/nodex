import { useIsMobile } from "@/hooks/use-mobile";
import { useAuthModalStore } from "@/features/auth/stores/auth-modal-store";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import type { OnboardingInitialSection, OnboardingSectionId, OnboardingSection, OnboardingStep } from "@/components/onboarding/onboarding-types";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

interface OnboardingControllerProps {
  isOnboardingOpen: boolean;
  onboardingManualStart: boolean;
  onboardingInitialSection: OnboardingInitialSection;
  onboardingSections: OnboardingSection[];
  onboardingStepsBySection: Record<OnboardingSectionId, OnboardingStep[]>;
  currentView: ViewType;
  focusedTaskId: string | null;
  handleCloseGuide: () => void;
  handleOnboardingStepChange: (payload: { id: string; stepNumber: number }) => void;
  handleOnboardingActiveSectionChange: (section: OnboardingSectionId | null) => void;
}

export function OnboardingController({
  isOnboardingOpen,
  onboardingManualStart,
  onboardingInitialSection,
  onboardingSections,
  onboardingStepsBySection,
  currentView,
  focusedTaskId,
  handleCloseGuide,
  handleOnboardingStepChange,
  handleOnboardingActiveSectionChange,
}: OnboardingControllerProps) {
  const isMobile = useIsMobile();
  const isAuthModalOpen = useAuthModalStore((s) => s.isOpen);

  return (
    <OnboardingGuide
      isOpen={isOnboardingOpen && !isAuthModalOpen}
      isMobile={isMobile}
      manualStart={onboardingManualStart}
      currentView={currentView}
      uiContextKey={`${currentView}:${focusedTaskId || ""}`}
      initialSection={onboardingInitialSection}
      sections={onboardingSections}
      stepsBySection={onboardingStepsBySection}
      onClose={handleCloseGuide}
      onActiveSectionChange={handleOnboardingActiveSectionChange}
      onStepChange={handleOnboardingStepChange}
    />
  );
}
