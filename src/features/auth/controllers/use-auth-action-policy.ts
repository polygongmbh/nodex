import { useMemo } from "react";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { computeAuthActionPolicy, type AuthActionPolicy } from "@/domain/auth/action-policy";

interface UseAuthActionPolicyOptions {
  hasCurrentUserProfileMetadata?: boolean;
}

export function useAuthActionPolicy(
  options: UseAuthActionPolicyOptions = {}
): AuthActionPolicy {
  const { user, needsProfileSetup } = useNDK();
  const { hasCurrentUserProfileMetadata = true } = options;

  return useMemo(
    () =>
      computeAuthActionPolicy({
        isSignedIn: Boolean(user),
        needsProfileSetup,
        hasCurrentUserProfileMetadata,
      }),
    [hasCurrentUserProfileMetadata, needsProfileSetup, user]
  );
}
