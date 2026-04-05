export interface AuthActionPolicyInput {
  isSignedIn: boolean;
  needsProfileSetup: boolean;
  hasCurrentUserProfileMetadata?: boolean;
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
  hasCurrentUserProfileMetadata = true,
}: AuthActionPolicyInput): AuthActionPolicy {
  const requiresProfileSetup =
    isSignedIn && (needsProfileSetup || !hasCurrentUserProfileMetadata);

  return {
    isSignedIn,
    canCreateContent: isSignedIn,
    canModifyContent: isSignedIn,
    canOpenCompose: isSignedIn,
    requiresProfileSetup,
  };
}
