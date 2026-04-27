import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuthModalStore } from "@/features/auth/stores/auth-modal-store";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import { OnboardingIntroPopover } from "@/components/onboarding/OnboardingIntroPopover";
import type { OnboardingInitialSection, OnboardingSectionId, OnboardingSection, OnboardingStep } from "@/components/onboarding/onboarding-types";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import type { AuthModalEntryStep } from "@/features/feed-page/controllers/use-auth-modal-route";

interface OnboardingControllerProps {
  isOnboardingOpen: boolean;
  isOnboardingIntroOpen: boolean;
  onboardingManualStart: boolean;
  onboardingInitialSection: OnboardingInitialSection;
  onboardingSections: OnboardingSection[];
  onboardingStepsBySection: Record<OnboardingSectionId, OnboardingStep[]>;
  currentView: ViewType;
  focusedTaskId: string | null;
  handleStartOnboardingTour: () => void;
  handleCloseGuide: () => void;
  handleOnboardingStepChange: (payload: { id: string; stepNumber: number }) => void;
  handleOnboardingActiveSectionChange: (section: OnboardingSectionId | null) => void;
  onBeforeStartTour: () => void;
  onOpenAuthModal: (step?: AuthModalEntryStep) => void;
}

export function OnboardingController({
  isOnboardingOpen,
  isOnboardingIntroOpen,
  onboardingManualStart,
  onboardingInitialSection,
  onboardingSections,
  onboardingStepsBySection,
  currentView,
  focusedTaskId,
  handleStartOnboardingTour,
  handleCloseGuide,
  handleOnboardingStepChange,
  handleOnboardingActiveSectionChange,
  onBeforeStartTour,
  onOpenAuthModal,
}: OnboardingControllerProps) {
  const isMobile = useIsMobile();
  const { defaultNoasHostUrl } = useNDK();
  const isAuthModalOpen = useAuthModalStore((s) => s.isOpen);

  return (
    <>
      <OnboardingIntroPopover
        isOpen={isOnboardingIntroOpen && !isAuthModalOpen}
        showCreateAccount={Boolean(import.meta.env.VITE_NOAS_HOST_URL || defaultNoasHostUrl)}
        onStartTour={() => {
          onBeforeStartTour();
          handleStartOnboardingTour();
        }}
        onCreateAccount={() => onOpenAuthModal("noasSignUp")}
        onSignIn={() => onOpenAuthModal("noas")}
      />
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
    </>
  );
}
