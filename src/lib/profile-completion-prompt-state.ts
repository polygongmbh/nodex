import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";
import { PROFILE_COMPLETION_PROMPTED_STORAGE_KEY_PREFIX } from "@/infrastructure/preferences/storage-registry";

const CONTEXT = "profile-completion-prompt-state";

function buildKey(pubkey: string): string {
  return `${PROFILE_COMPLETION_PROMPTED_STORAGE_KEY_PREFIX}.${pubkey.trim().toLowerCase()}`;
}

export function hasShownProfileCompletionPrompt(pubkey: string | undefined | null): boolean {
  if (!pubkey) return false;
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(buildKey(pubkey)) === "1";
  } catch {
    return false;
  }
}

export function markProfileCompletionPromptShown(pubkey: string): void {
  if (!pubkey) return;
  safeLocalStorageSetItem(buildKey(pubkey), "1", { context: CONTEXT });
}
