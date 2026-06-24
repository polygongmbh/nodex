import type { MutableRefObject } from "react";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { useAuthModalStore } from "@/features/auth/stores/auth-modal-store";
import { WelcomeModal } from "@/components/welcome/WelcomeModal";
import { useStartupIntro } from "@/components/welcome/use-startup-intro";
import type { AuthModalEntryStep } from "@/features/feed-page/controllers/use-auth-modal-route";

interface WelcomeControllerProps {
  openedWithFocusedTaskRef: MutableRefObject<boolean>;
  showCreateAccount: boolean;
  onOpenAuthModal: (step?: AuthModalEntryStep) => void;
}

export function WelcomeController({
  openedWithFocusedTaskRef,
  showCreateAccount,
  onOpenAuthModal,
}: WelcomeControllerProps) {
  const { user } = useNDK();
  const isAuthModalOpen = useAuthModalStore((s) => s.isOpen);

  const { isOpen, closeIntro } = useStartupIntro({
    user,
    openedWithFocusedTaskRef,
  });

  return (
    <WelcomeModal
      isOpen={isOpen && !isAuthModalOpen}
      showCreateAccount={showCreateAccount}
      onDismiss={closeIntro}
      onCreateAccount={() => onOpenAuthModal("noasSignUp")}
      onSignIn={() => onOpenAuthModal(showCreateAccount ? "noas" : undefined)}
    />
  );
}
