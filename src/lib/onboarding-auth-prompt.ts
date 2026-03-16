import type { NDKRelayStatus } from "@/lib/nostr/provider/contracts";
import { shouldForceSignInForReadAccess } from "@/lib/nostr/provider/relay-verification";

export function shouldPromptSignInAfterOnboarding(params: {
  isSignedIn: boolean;
  relays: NDKRelayStatus[];
}): boolean {
  return shouldForceSignInForReadAccess({
    isSignedIn: params.isSignedIn,
    relays: params.relays,
  });
}
