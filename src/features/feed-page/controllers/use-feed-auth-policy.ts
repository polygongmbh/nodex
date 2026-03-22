import { useMemo } from "react";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { useProfileCompletionPromptSignal } from "@/features/auth/controllers/use-profile-completion-prompt-signal";

interface UseFeedAuthPolicyOptions {
  hasCachedCurrentUserProfileMetadata: boolean;
}

export function useFeedAuthPolicy({
  hasCachedCurrentUserProfileMetadata,
}: UseFeedAuthPolicyOptions) {
  const authPolicy = useAuthActionPolicy({
    hasCachedCurrentUserProfileMetadata,
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
