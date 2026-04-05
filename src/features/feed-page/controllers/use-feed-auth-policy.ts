import { useMemo } from "react";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { useProfileCompletionPromptSignal } from "@/features/auth/controllers/use-profile-completion-prompt-signal";

interface UseFeedAuthPolicyOptions {
  hasCurrentUserProfileMetadata: boolean;
}

export function useFeedAuthPolicy({
  hasCurrentUserProfileMetadata,
}: UseFeedAuthPolicyOptions) {
  const authPolicy = useAuthActionPolicy({
    hasCurrentUserProfileMetadata,
  });
  const profileCompletionPromptSignal = useProfileCompletionPromptSignal({
    isSignedIn: authPolicy.isSignedIn,
    shouldPromptProfileCompletion: authPolicy.requiresProfileSetup,
  });

  return useMemo(
    () => ({
      authPolicy,
      profileCompletionPromptSignal,
    }),
    [authPolicy, profileCompletionPromptSignal]
  );
}
