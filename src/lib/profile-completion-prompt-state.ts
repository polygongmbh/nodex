import { safeLocalStorageGetItem, safeLocalStorageSetItem } from "@/lib/safe-local-storage";
import { PROFILE_COMPLETION_PROMPTED_STORAGE_KEY_PREFIX } from "@/infrastructure/preferences/storage-registry";

const CONTEXT = "profile-completion-prompt-state";

function buildKey(pubkey: string): string {
  return `${PROFILE_COMPLETION_PROMPTED_STORAGE_KEY_PREFIX}.${pubkey.trim().toLowerCase()}`;
}

export function hasShownProfileCompletionPrompt(pubkey: string | undefined | null): boolean {
  if (!pubkey) return false;
  const value = safeLocalStorageGetItem(buildKey(pubkey), { context: CONTEXT });
  return value === "1";
}

export function markProfileCompletionPromptShown(pubkey: string): void {
  if (!pubkey) return;
  safeLocalStorageSetItem(buildKey(pubkey), "1", { context: CONTEXT });
}
