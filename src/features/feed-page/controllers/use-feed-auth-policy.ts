import { useMemo } from "react";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { useProfileCompletionPromptSignal } from "@/features/auth/controllers/use-profile-completion-prompt-signal";
import { useNDK } from "@/infrastructure/nostr/ndk-context";

interface UseFeedAuthPolicyOptions {
  hasCurrentUserProfileMetadata: boolean;
}

export function useFeedAuthPolicy({
  hasCurrentUserProfileMetadata,
}: UseFeedAuthPolicyOptions) {
  const { user } = useNDK();
  const authPolicy = useAuthActionPolicy({
    hasCurrentUserProfileMetadata,
  });
  const profileCompletionPromptSignal = useProfileCompletionPromptSignal({
    isSignedIn: authPolicy.isSignedIn,
    shouldPromptProfileCompletion: authPolicy.requiresProfileSetup,
    pubkey: user?.pubkey,
  });

  return useMemo(
    () => ({
      authPolicy,
      profileCompletionPromptSignal,
    }),
    [authPolicy, profileCompletionPromptSignal]
  );
}
