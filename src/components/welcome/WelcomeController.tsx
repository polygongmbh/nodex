import type { MutableRefObject } from "react";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { useAuthModalStore } from "@/features/auth/stores/auth-modal-store";
import { WelcomeModal } from "@/components/welcome/WelcomeModal";
import { useStartupIntro } from "@/components/welcome/use-startup-intro";
import type { AuthModalEntryStep } from "@/features/feed-page/controllers/use-auth-modal-route";

interface WelcomeControllerProps {
  openedWithFocusedTaskRef: MutableRefObject<boolean>;
  showCreateAccount: boolean;
  onStartTour: () => void;
  onOpenAuthModal: (step?: AuthModalEntryStep) => void;
}

export function WelcomeController({
  openedWithFocusedTaskRef,
  showCreateAccount,
  onStartTour,
  onOpenAuthModal,
}: WelcomeControllerProps) {
  const { user } = useNDK();
  const isAuthModalOpen = useAuthModalStore((s) => s.isOpen);

  const { isOpen, handleStartTour } = useStartupIntro({
    user,
    openedWithFocusedTaskRef,
    onStartTour,
  });

  return (
    <WelcomeModal
      isOpen={isOpen && !isAuthModalOpen}
      showCreateAccount={showCreateAccount}
      onStartTour={handleStartTour}
      onCreateAccount={() => onOpenAuthModal("noasSignUp")}
      onSignIn={() => onOpenAuthModal("noas")}
    />
  );
}
