import { useCallback, useRef } from "react";
import NDK, { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "@/lib/nostr/types";
import { buildOfflinePresenceTags } from "@/lib/presence-status";
import { dedupeNormalizedRelayUrls, normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import {
  filterRelayUrlsToWritableSet,
  resolveWritableNdkRelayUrls,
} from "@/lib/nostr/relay-write-targets";
import { extractRelayUrlsFromError, extractRelayRejectionReason } from "./relay-error";
import { shouldMarkRelayReadOnlyAfterPublishReject } from "./relay-verification";
import type { NDKRelayStatus } from "./contracts";

function resolveOfflinePresenceRelayUrls(params: {
  relayUrlsOverride?: string[];
  registeredRelayUrls?: string[];
  writableRelayUrls?: string[];
}): string[] {
  return filterRelayUrlsToWritableSet([
    ...(params.relayUrlsOverride || []),
    ...(params.registeredRelayUrls || []),
  ], new Set(dedupeNormalizedRelayUrls(params.writableRelayUrls || [])));
}

interface UsePresenceArgs {
  ndk: NDK | null;
  relays: NDKRelayStatus[];
  markRelayVerificationFailure: (
    relayUrl: string,
    operation: "read" | "write",
    options: { setStatus: boolean; showToast: boolean }
  ) => void;
}

export function usePresence({ ndk, relays, markRelayVerificationFailure }: UsePresenceArgs) {
  const presenceRelayUrlsRef = useRef<string[]>([]);

  const setPresenceRelayUrls = useCallback((relayUrls: string[]) => {
    presenceRelayUrlsRef.current = dedupeNormalizedRelayUrls(relayUrls);
  }, []);

  const publishPresenceOffline = useCallback(async (relayUrlsOverride?: string[]) => {
    if (!ndk || !ndk.signer) return;

    try {
      const event = new NDKEvent(ndk);
      event.kind = NostrEventKind.UserStatus;
      event.content = "";
      event.tags = buildOfflinePresenceTags();
      await event.sign();

      const relayUrls = resolveOfflinePresenceRelayUrls({
        relayUrlsOverride,
        registeredRelayUrls: presenceRelayUrlsRef.current,
        writableRelayUrls: resolveWritableNdkRelayUrls(relays),
      });
      if (relayUrls.length === 0) return;
      const relaySet = NDKRelaySet.fromRelayUrls(
        relayUrls,
        ndk,
        true
      );
      await event.publish(relaySet);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error || "");
      const rejectionReason = extractRelayRejectionReason(error);
      if (shouldMarkRelayReadOnlyAfterPublishReject({ errorMessage, rejectionReason })) {
        const failedRelayUrls = extractRelayUrlsFromError(error);
        const relayUrlsToMark = failedRelayUrls.length > 0
          ? failedRelayUrls
          : relays.map((relay) => normalizeRelayUrl(relay.url));
        relayUrlsToMark.forEach((relayUrl) => {
          markRelayVerificationFailure(relayUrl, "write", {
            setStatus: true,
            showToast: false,
          });
        });
      }
      console.warn("Failed to publish offline presence event during logout", error);
    }
  }, [markRelayVerificationFailure, ndk, relays]);

  return { setPresenceRelayUrls, publishPresenceOffline };
}
