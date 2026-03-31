import { hasNostrExtension } from "./storage";

const DEFAULT_EXTENSION_RESTORE_TIMEOUT_MS = 1500;
const DEFAULT_EXTENSION_RESTORE_POLL_INTERVAL_MS = 200;

interface WaitForNostrExtensionOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

export function waitForNostrExtensionAvailability(
  options: WaitForNostrExtensionOptions = {}
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (hasNostrExtension()) return Promise.resolve(true);

  const timeoutMs = options.timeoutMs ?? DEFAULT_EXTENSION_RESTORE_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_EXTENSION_RESTORE_POLL_INTERVAL_MS;

  return new Promise((resolve) => {
    let settled = false;

    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      if (typeof timeoutId === "number") {
        window.clearTimeout(timeoutId);
      }
      if (typeof intervalId === "number") {
        window.clearInterval(intervalId);
      }
      window.removeEventListener("nostr#initialized", handleInitialized as EventListener);
      options.signal?.removeEventListener("abort", handleAbort);
      resolve(available);
    };

    const checkExtension = () => {
      if (hasNostrExtension()) {
        finish(true);
      }
    };

    const handleInitialized = () => {
      checkExtension();
    };

    const handleAbort = () => {
      finish(false);
    };

    window.addEventListener("nostr#initialized", handleInitialized as EventListener);
    const intervalId = window.setInterval(checkExtension, pollIntervalMs);
    const timeoutId = window.setTimeout(() => finish(hasNostrExtension()), timeoutMs);
    options.signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
