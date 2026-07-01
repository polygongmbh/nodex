import NDK, { NDKEvent, profileFromEvent, type NDKUserProfile, type NDKRelay } from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "@/lib/nostr/types";
import { isAuthRequiredCloseReason } from "./relay-verification";

export interface CurrentUserKind0FetchHelpers {
  beginRelayOperation: (op: "read" | "write") => void;
  endRelayOperation: (op: "read" | "write") => void;
  scheduleRelayTimeout: (callback: () => void, delayMs: number) => number;
  clearTrackedRelayTimeout: (timeoutId: number | undefined) => void;
}

const KIND0_FETCH_FALLBACK_TIMEOUT_MS = 12000;

/**
 * Read the SIGNED-IN USER'S OWN latest kind-0 profile from the relays.
 *
 * This is a one-shot, EOSE-confirmed relay read used for own-profile decisions
 * (sync on login, the auto-publish check). It is intentionally stateless — no
 * caching or dedup — because it only runs at login (once, or briefly twice) and
 * resolves in milliseconds; the caller decides what to do with the result.
 *
 * Every OTHER user's profile comes exclusively from the live in-memory store
 * (`defaultKind0Cache` in people-from-kind0.ts, via use-nostr-profiles /
 * use-kind0-people) and must never route through here.
 *
 * Participates in relay read/write accounting via the injected helpers so the
 * relay-verification layer attributes a NIP-42 auth challenge during this read
 * to a "read" op, and uses the tracked timeout so the fallback is cancelled on
 * provider teardown.
 */
export async function fetchCurrentUserKind0Profile(
  ndk: NDK | null,
  pubkey: string,
  helpers: CurrentUserKind0FetchHelpers,
): Promise<NDKUserProfile | null> {
  if (!ndk) return null;
  const normalizedPubkey = pubkey.trim().toLowerCase();
  if (!normalizedPubkey) return null;

  const { beginRelayOperation, endRelayOperation, scheduleRelayTimeout, clearTrackedRelayTimeout } = helpers;

  return new Promise<NDKUserProfile | null>((resolve) => {
    const candidates: { createdAt: number; content: string }[] = [];
    let settled = false;
    const fallbackTimeout = { id: undefined as number | undefined };

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTrackedRelayTimeout(fallbackTimeout.id);
      endRelayOperation("read");
      subscription.stop();
      let profile: NDKUserProfile | null = null;
      if (candidates.length > 0) {
        const best = candidates.sort((a, b) => b.createdAt - a.createdAt)[0];
        const event = new NDKEvent(ndk);
        event.content = best.content;
        profile = profileFromEvent(event);
      }
      resolve(profile);
    };

    beginRelayOperation("read");
    const subscription = ndk.subscribe(
      [{ kinds: [NostrEventKind.Metadata as number], authors: [normalizedPubkey] }],
      { closeOnEose: true }
    );

    subscription.on("event", (event: NDKEvent) => {
      if (event.content) {
        candidates.push({ createdAt: event.created_at || 0, content: event.content });
      }
    });
    // An auth-required CLOSED means this relay won't answer the read — finish now
    // (resolving null if nothing arrived) instead of hanging until the fallback.
    subscription.on("closed", (_relay: NDKRelay, reason: string) => {
      if (isAuthRequiredCloseReason(reason || "")) finish();
    });
    subscription.on("eose", finish);
    subscription.on("close", finish);

    // Fallback so the UI does not hang if eose never arrives.
    fallbackTimeout.id = scheduleRelayTimeout(finish, KIND0_FETCH_FALLBACK_TIMEOUT_MS);
  });
}
