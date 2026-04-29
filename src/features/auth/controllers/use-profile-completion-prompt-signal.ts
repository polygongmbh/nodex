import { useEffect, useRef, useState } from "react";
import { hasShownProfileCompletionPrompt } from "@/lib/profile-completion-prompt-state";

interface UseProfileCompletionPromptSignalOptions {
  isSignedIn: boolean;
  shouldPromptProfileCompletion: boolean;
  pubkey?: string;
}

/**
 * Emits an incrementing signal when the user transitions from signed-out to
 * signed-in *and* their profile is incomplete. The signal does not fire when:
 *   - the same pubkey has already been prompted on this device (localStorage)
 *   - the user is simply resuming a session (initial mount with isSignedIn=true)
 */
export function useProfileCompletionPromptSignal({
  isSignedIn,
  shouldPromptProfileCompletion,
  pubkey,
}: UseProfileCompletionPromptSignalOptions): number {
  const [signal, setSignal] = useState(0);
  // Treat the user as already signed-in on first mount so resuming a session
  // does not register as a fresh sign-in transition.
  const previousSignedInRef = useRef(true);

  useEffect(() => {
    const justSignedIn = !previousSignedInRef.current && isSignedIn;
    previousSignedInRef.current = isSignedIn;
    if (!justSignedIn || !shouldPromptProfileCompletion) return;
    if (hasShownProfileCompletionPrompt(pubkey)) return;
    setSignal((previous) => previous + 1);
  }, [isSignedIn, shouldPromptProfileCompletion, pubkey]);

  return signal;
}
