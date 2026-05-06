import { useCallback, useRef } from "react";
import NDK, { NDKEvent, profileFromEvent, type NDKUserProfile, type NDKRelay } from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "@/lib/nostr/types";
import { isAuthRequiredCloseReason, isPermanentAuthDenialReason } from "./relay-verification";

const KIND0_PROFILE_CACHE_TTL_MS = 120000;
const KIND0_PROFILE_FAILURE_COOLDOWN_MS = 15000;

interface UseProfileArgs {
  ndk: NDK | null;
  beginRelayOperation: (op: "read" | "write") => void;
  endRelayOperation: (op: "read" | "write") => void;
  scheduleRelayTimeout: (callback: () => void, delayMs: number) => number;
  clearTrackedRelayTimeout: (timeoutId: number | undefined) => void;
}

export function useProfile({
  ndk,
  beginRelayOperation,
  endRelayOperation,
  scheduleRelayTimeout,
  clearTrackedRelayTimeout,
}: UseProfileArgs) {
  const kind0ProfileCacheRef = useRef<Map<string, { profile: NDKUserProfile | null; fetchedAt: number }>>(new Map());
  const kind0ProfileInFlightRef = useRef<Map<string, Promise<NDKUserProfile | null>>>(new Map());
  const kind0ProfileFailureUntilRef = useRef<Map<string, number>>(new Map());

  const fetchLatestKind0Profile = useCallback(async (
    pubkey: string,
    options?: { force?: boolean }
  ): Promise<NDKUserProfile | null> => {
    if (!ndk) return null;

    const normalizedPubkey = pubkey.trim().toLowerCase();
    if (!normalizedPubkey) return null;
    const force = options?.force ?? false;
    const now = Date.now();

    if (!force) {
      const cached = kind0ProfileCacheRef.current.get(normalizedPubkey);
      if (cached && (now - cached.fetchedAt) < KIND0_PROFILE_CACHE_TTL_MS) {
        return cached.profile;
      }
      const failureUntil = kind0ProfileFailureUntilRef.current.get(normalizedPubkey) ?? 0;
      if (now < failureUntil) {
        return null;
      }
      const inFlight = kind0ProfileInFlightRef.current.get(normalizedPubkey);
      if (inFlight) {
        return inFlight;
      }
    }

    const request = new Promise<NDKUserProfile | null>((resolve) => {
      const candidates: { createdAt: number; content: string }[] = [];
      let settled = false;
      const fallbackTimeout = { id: undefined as number | undefined };
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTrackedRelayTimeout(fallbackTimeout.id);
        endRelayOperation("read");
        subscription.stop();
        let profile = null;
        if (candidates.length > 0) {
          const best = candidates.sort((a, b) => b.createdAt - a.createdAt)[0];
          const event = new NDKEvent(ndk);
          event.content = best.content;
          profile = profileFromEvent(event);
        }
        kind0ProfileCacheRef.current.set(normalizedPubkey, {
          profile,
          fetchedAt: Date.now(),
        });
        kind0ProfileFailureUntilRef.current.delete(normalizedPubkey);
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
      subscription.on("closed", (_relay: NDKRelay, reason: string) => {
        if (!isAuthRequiredCloseReason(reason || "")) return;
        const nowTs = Date.now();
        const cooldown = isPermanentAuthDenialReason(reason || "")
          ? KIND0_PROFILE_CACHE_TTL_MS
          : KIND0_PROFILE_FAILURE_COOLDOWN_MS;
        kind0ProfileFailureUntilRef.current.set(normalizedPubkey, nowTs + cooldown);
        finish();
      });
      subscription.on("eose", finish);
      subscription.on("close", finish);

      // Fallback so the UI does not hang if eose never arrives.
      fallbackTimeout.id = scheduleRelayTimeout(finish, 12000);
    }).finally(() => {
      kind0ProfileInFlightRef.current.delete(normalizedPubkey);
    });

    kind0ProfileInFlightRef.current.set(normalizedPubkey, request);
    return await request;
  }, [beginRelayOperation, clearTrackedRelayTimeout, endRelayOperation, ndk, scheduleRelayTimeout]);

  return {
    kind0ProfileCacheRef,
    kind0ProfileInFlightRef,
    kind0ProfileFailureUntilRef,
    fetchLatestKind0Profile,
  };
}
