import { useIsMobile } from "@/hooks/use-mobile";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { useAuthModalStore } from "@/features/auth/stores/auth-modal-store";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import { useOnboarding } from "@/components/onboarding/use-onboarding";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

interface OnboardingControllerProps {
  currentView: ViewType;
  focusedTaskId: string | null;
  /** Clears any pending focused-task filter restore before the guide resets filters. */
  onBeforeResetFocusedTaskScope: () => void;
}

export function OnboardingController({
  currentView,
  focusedTaskId,
  onBeforeResetFocusedTaskScope,
}: OnboardingControllerProps) {
  const isMobile = useIsMobile();
  const { user } = useNDK();
  const isAuthModalOpen = useAuthModalStore((s) => s.isOpen);

  const {
    isOnboardingOpen,
    onboardingManualStart,
    onboardingInitialSection,
    onboardingSections,
    onboardingStepsBySection,
    handleCloseGuide,
    handleOnboardingStepChange,
    handleOnboardingActiveSectionChange,
  } = useOnboarding({ user, isMobile, currentView, onBeforeResetFocusedTaskScope });

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
