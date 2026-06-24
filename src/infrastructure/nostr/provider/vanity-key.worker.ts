/**
 * Web Worker that mines a vanity Nostr key off the main thread so the sign-up
 * form stays responsive while brute-forcing the npub prefix. Cancellation is
 * done by terminating the worker from the host hook.
 */
import { mineVanityKey, type VanityKeyResult } from "@/lib/nostr/vanity-key";

const ctx = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ target: string }>) => void) | null;
  postMessage: (message: VanityKeyResult | null) => void;
};

ctx.onmessage = (event) => {
  ctx.postMessage(mineVanityKey(event.data.target));
};
