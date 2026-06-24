import { useCallback, useEffect, useRef, useState } from "react";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { vanityTargetFromUsername, type VanityKeyResult } from "@/lib/nostr/vanity-key";

/** Wait for typing to settle before auto-kicking off a (relatively expensive) mine. */
const MINE_DEBOUNCE_MS = 500;

/** Only auto-mine once the user has committed to a username (longer than the prefix). */
const MIN_USERNAME_LENGTH = 4;

/** Prefix used by the Generate button when the username field is empty. */
const EMPTY_USERNAME_TARGET = "0";

/** Shorter prefix used when Generate is pressed again mid-mine, for swift feedback. */
const IMPATIENT_PREFIX_LENGTH = 2;

interface UseVanityKeyMinerArgs {
  username: string;
  hasPrivateKey: boolean;
  onMined: (secretKeyHex: string) => void;
}

/**
 * Mines a vanity key for the sign-up form. Two triggers share one Web Worker:
 *  - Auto: once the user has typed at least {@link MIN_USERNAME_LENGTH} username
 *    characters and left the private-key field empty, a key whose npub starts
 *    with their (npub-safe) initials is mined and filled in. An in-flight auto
 *    mine is cancelled when the prefix changes or the user supplies a key, so
 *    typed/pasted input is never clobbered.
 *  - Manual ({@link mineFromUsername}, wired to the Generate button): mines the
 *    username prefix, or `npub10…` when the field is empty, and always applies.
 */
export function useVanityKeyMiner({ username, hasPrivateKey, onMined }: UseVanityKeyMinerArgs) {
  const [isMining, setIsMining] = useState(false);
  const onMinedRef = useRef(onMined);
  onMinedRef.current = onMined;
  // The single active job; `manual` jobs are never cancelled by the auto effect.
  const jobRef = useRef<{ worker: Worker; manual: boolean } | null>(null);

  const startMining = useCallback((target: string, manual: boolean) => {
    if (typeof Worker === "undefined" || !target) return; // no Worker (tests/SSR) → skip
    jobRef.current?.worker.terminate();
    const worker = new Worker(new URL("./vanity-key.worker.ts", import.meta.url), { type: "module" });
    jobRef.current = { worker, manual };
    setIsMining(true);
    nostrDevLog("auth", "Mining vanity key", { target, manual });
    worker.onmessage = (event: MessageEvent<VanityKeyResult | null>) => {
      if (jobRef.current?.worker !== worker) return; // superseded by a newer job
      worker.terminate();
      jobRef.current = null;
      setIsMining(false);
      const result = event.data;
      if (!result) {
        nostrDevLog("auth", "Vanity key mining exhausted", { target });
        return;
      }
      nostrDevLog("auth", "Mined vanity key", { target, attempts: result.attempts });
      onMinedRef.current(result.secretKeyHex);
    };
    worker.postMessage({ target });
  }, []);

  const target = vanityTargetFromUsername(username);
  const typedUsernameLength = username.split("@")[0].trim().length;
  const shouldAutoMine =
    !hasPrivateKey && typedUsernameLength >= MIN_USERNAME_LENGTH && target.length > 0;

  // why: auto-mine after typing settles; the cleanup cancels an in-flight AUTO
  // mine when the prefix changes or a key appears, but leaves a manual mine running.
  useEffect(() => {
    if (!shouldAutoMine) return;
    const timer = setTimeout(() => {
      if (jobRef.current?.manual) return; // don't clobber a manual mine in progress
      startMining(target, false);
    }, MINE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      if (jobRef.current && !jobRef.current.manual) {
        jobRef.current.worker.terminate();
        jobRef.current = null;
        setIsMining(false);
      }
    };
  }, [target, shouldAutoMine, startMining]);

  // why: terminate any worker (auto or manual) when the form unmounts.
  useEffect(
    () => () => {
      jobRef.current?.worker.terminate();
      jobRef.current = null;
    },
    []
  );

  const mineFromUsername = useCallback(() => {
    const target = vanityTargetFromUsername(username) || EMPTY_USERNAME_TARGET;
    // Pressing Generate while a mine is already running shortens the prefix so the
    // impatient retry resolves quickly (~32x fewer attempts per dropped character).
    const impatient = jobRef.current !== null;
    startMining(impatient ? target.slice(0, IMPATIENT_PREFIX_LENGTH) : target, true);
  }, [startMining, username]);

  return { isMining, mineFromUsername };
}
