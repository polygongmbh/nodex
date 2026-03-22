export interface AuthActionPolicyInput {
  isSignedIn: boolean;
  needsProfileSetup: boolean;
  hasCachedCurrentUserProfileMetadata?: boolean;
}

export interface AuthActionPolicy {
  isSignedIn: boolean;
  canCreateContent: boolean;
  canModifyContent: boolean;
  canOpenCompose: boolean;
  requiresProfileSetup: boolean;
}

export function computeAuthActionPolicy({
  isSignedIn,
  needsProfileSetup,
  hasCachedCurrentUserProfileMetadata = true,
}: AuthActionPolicyInput): AuthActionPolicy {
  const requiresProfileSetup =
    isSignedIn && (needsProfileSetup || !hasCachedCurrentUserProfileMetadata);

  return {
    isSignedIn,
    canCreateContent: isSignedIn,
    canModifyContent: isSignedIn,
    canOpenCompose: isSignedIn,
    requiresProfileSetup,
  };
}
