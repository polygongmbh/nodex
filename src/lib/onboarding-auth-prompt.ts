import type { NDKRelayStatus } from "@/infrastructure/nostr/provider/contracts";
import { shouldForceSignInForReadAccess } from "@/infrastructure/nostr/provider/relay-verification";

export function shouldPromptSignInAfterOnboarding(params: {
  isSignedIn: boolean;
  relays: NDKRelayStatus[];
}): boolean {
  return shouldForceSignInForReadAccess({
    isSignedIn: params.isSignedIn,
    relays: params.relays,
  });
}
