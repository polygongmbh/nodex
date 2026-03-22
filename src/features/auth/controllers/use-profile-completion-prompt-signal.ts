import { useEffect, useRef, useState } from "react";

interface UseProfileCompletionPromptSignalOptions {
  isSignedIn: boolean;
  shouldPromptProfileCompletion: boolean;
}

export function useProfileCompletionPromptSignal({
  isSignedIn,
  shouldPromptProfileCompletion,
}: UseProfileCompletionPromptSignalOptions): number {
  const [signal, setSignal] = useState(0);
  const previousSignedInRef = useRef(isSignedIn);

  useEffect(() => {
    const justSignedIn = !previousSignedInRef.current && isSignedIn;
    if (justSignedIn && shouldPromptProfileCompletion) {
      setSignal((previous) => previous + 1);
    }
    previousSignedInRef.current = isSignedIn;
  }, [isSignedIn, shouldPromptProfileCompletion]);

  return signal;
}
