import { useEffect, useRef, useState } from "react";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { vanityTargetFromUsername, type VanityKeyResult } from "@/lib/nostr/vanity-key";

/** Wait for typing to settle before kicking off a (relatively expensive) mine. */
const MINE_DEBOUNCE_MS = 500;

/** Only start mining once the user has committed to a username (longer than the prefix). */
const MIN_USERNAME_LENGTH = 4;

interface UseVanityKeyMinerArgs {
  username: string;
  hasPrivateKey: boolean;
  onMined: (secretKeyHex: string) => void;
}

/**
 * Auto-mines a vanity key while the user fills in the sign-up form: once they
 * have typed at least {@link MIN_USERNAME_LENGTH} username characters and left
 * the private-key field empty, a Web Worker brute-forces a key whose npub starts
 * with their (npub-safe) initials and fills it in when found.
 */
export function useVanityKeyMiner({ username, hasPrivateKey, onMined }: UseVanityKeyMinerArgs) {
  const [isMining, setIsMining] = useState(false);
  const onMinedRef = useRef(onMined);
  onMinedRef.current = onMined;

  const target = vanityTargetFromUsername(username);
  const typedUsernameLength = username.split("@")[0].trim().length;
  const shouldMine =
    !hasPrivateKey && typedUsernameLength >= MIN_USERNAME_LENGTH && target.length > 0;

  // why: trigger = enough username typed + key field empty; mine off-thread and
  // fill the key when found. Re-runs (cancelling any in-flight mine) only when
  // the target prefix changes or a key appears, so user input is never clobbered.
  useEffect(() => {
    if (typeof Worker === "undefined") return; // no Worker (tests/SSR) → skip
    if (!shouldMine) return;

    let cancelled = false;
    let worker: Worker | null = null;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setIsMining(true);
      nostrDevLog("auth", "Mining vanity key", { target });
      worker = new Worker(new URL("./vanity-key.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<VanityKeyResult | null>) => {
        const result = event.data;
        setIsMining(false);
        if (cancelled) return;
        if (!result) {
          nostrDevLog("auth", "Vanity key mining exhausted", { target });
          return;
        }
        nostrDevLog("auth", "Mined vanity key", { target, attempts: result.attempts });
        onMinedRef.current(result.secretKeyHex);
      };
      worker.postMessage({ target });
    }, MINE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      worker?.terminate();
      setIsMining(false);
    };
  }, [target, shouldMine]);

  return { isMining };
}
