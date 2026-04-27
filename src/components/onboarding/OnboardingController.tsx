import type { MutableRefObject } from "react";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuthModalStore } from "@/features/auth/stores/auth-modal-store";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import { OnboardingIntroPopover } from "@/components/onboarding/OnboardingIntroPopover";
import { useStartupIntro } from "@/components/onboarding/use-startup-intro";
import type { OnboardingInitialSection, OnboardingSectionId, OnboardingSection, OnboardingStep } from "@/components/onboarding/onboarding-types";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import type { AuthModalEntryStep } from "@/features/feed-page/controllers/use-auth-modal-route";

interface OnboardingControllerProps {
  isOnboardingOpen: boolean;
  onboardingManualStart: boolean;
  onboardingInitialSection: OnboardingInitialSection;
  onboardingSections: OnboardingSection[];
  onboardingStepsBySection: Record<OnboardingSectionId, OnboardingStep[]>;
  currentView: ViewType;
  focusedTaskId: string | null;
  openedWithFocusedTaskRef: MutableRefObject<boolean>;
  openGuideAsStartup: () => void;
  handleCloseGuide: () => void;
  handleOnboardingStepChange: (payload: { id: string; stepNumber: number }) => void;
  handleOnboardingActiveSectionChange: (section: OnboardingSectionId | null) => void;
  onBeforeStartTour: () => void;
  onOpenAuthModal: (step?: AuthModalEntryStep) => void;
}

export function OnboardingController({
  isOnboardingOpen,
  onboardingManualStart,
  onboardingInitialSection,
  onboardingSections,
  onboardingStepsBySection,
  currentView,
  focusedTaskId,
  openedWithFocusedTaskRef,
  openGuideAsStartup,
  handleCloseGuide,
  handleOnboardingStepChange,
  handleOnboardingActiveSectionChange,
  onBeforeStartTour,
  onOpenAuthModal,
}: OnboardingControllerProps) {
  const isMobile = useIsMobile();
  const { user, defaultNoasHostUrl } = useNDK();
  const isAuthModalOpen = useAuthModalStore((s) => s.isOpen);

  const { isOpen: isIntroOpen, handleStartTour } = useStartupIntro({
    user,
    openedWithFocusedTaskRef,
    onStartTour: () => {
      onBeforeStartTour();
      openGuideAsStartup();
    },
  });

  return (
    <>
      <OnboardingIntroPopover
        isOpen={isIntroOpen && !isAuthModalOpen}
        showCreateAccount={Boolean(import.meta.env.VITE_NOAS_HOST_URL || defaultNoasHostUrl)}
        onStartTour={handleStartTour}
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
