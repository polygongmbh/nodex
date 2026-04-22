import { useEffect, useRef } from "react";
import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "@/lib/nostr/types";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { filterAutoAddRelayUrls } from "./relay-list";
import {
  extractRelayUrlsFromNip65Tags,
  selectComplementaryRelayUrls,
} from "@/infrastructure/nostr/relay-enrichment";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import type { NDKRelayStatus, NDKUser } from "./contracts";
import type { RelayVerificationCallbacks } from "./use-relay-verification";
import type { MutableRefObject } from "react";

export function useRelayEnrichment(
  ndk: NDK | null,
  user: NDKUser | null,
  relays: NDKRelayStatus[],
  removedRelaysRef: MutableRefObject<Set<string>>,
  addRelay: (url: string) => void,
  beginRelayOperation: RelayVerificationCallbacks["beginRelayOperation"],
  endRelayOperation: RelayVerificationCallbacks["endRelayOperation"],
  complementaryRelaySyncKeyRef: MutableRefObject<string | null>,
): void {
  const relaysRef = useRef(relays);
  useEffect(() => { relaysRef.current = relays; }, [relays]);
  const fetchLatestNip65RelayUrls = async (pubkey: string): Promise<string[]> => {
    if (!ndk) return [];

    return await new Promise((resolve) => {
      const candidates: { createdAt: number; tags: string[][] }[] = [];
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallbackTimeoutId);
        endRelayOperation("read");
        subscription.stop();
        if (candidates.length === 0) {
          resolve([]);
          return;
        }
        candidates.sort((a, b) => b.createdAt - a.createdAt);
        resolve(extractRelayUrlsFromNip65Tags(candidates[0].tags));
      };

      beginRelayOperation("read");
      const subscription = ndk.subscribe(
        [{ kinds: [10002], authors: [pubkey], limit: 1 }],
        { closeOnEose: true }
      );

      subscription.on("event", (event: NDKEvent) => {
        if (Array.isArray(event.tags)) {
          candidates.push({ createdAt: event.created_at || 0, tags: event.tags as string[][] });
        }
      });
      subscription.on("eose", finish);

      // Fallback so the UI does not hang if eose never arrives.
      const fallbackTimeoutId = window.setTimeout(finish, 6000);
    });
  };

  useEffect(() => {
    if (!user?.pubkey || !ndk) return;

    const normalizedNip05 = user.profile?.nip05?.trim().toLowerCase() || "";
    const syncKey = `${user.pubkey}|${normalizedNip05}`;
    if (complementaryRelaySyncKeyRef.current === syncKey) return;
    complementaryRelaySyncKeyRef.current = syncKey;

    let cancelled = false;
    void (async () => {
      const nip65RelayUrls = await fetchLatestNip65RelayUrls(user.pubkey);
      if (cancelled) return;

      let nip05RelayUrls: string[] = [];
      if (nip65RelayUrls.length === 0 && normalizedNip05) {
        const profile = await user.fetchProfile();
        nip05RelayUrls = profile?.nip05 === normalizedNip05 && Array.isArray(profile?.relayUrls) ? profile.relayUrls : [];
      }
      if (cancelled) return;

      const relaySelection = selectComplementaryRelayUrls({
        nip65RelayUrls,
        nip05RelayUrls,
      });
      if (relaySelection.relayUrls.length === 0) {
        nostrDevLog("relay", "No complementary relays discovered from profile sources", {
          pubkey: user.pubkey,
          hasNip65: nip65RelayUrls.length > 0,
          nip05Checked: nip65RelayUrls.length === 0 && Boolean(normalizedNip05),
        });
        return;
      }

      const newRelayUrls = filterAutoAddRelayUrls({
        candidateRelayUrls: relaySelection.relayUrls,
        existingRelayUrls: relaysRef.current.map((relay) => relay.url),
        removedRelayUrls: removedRelaysRef.current,
      });
      if (newRelayUrls.length === 0) {
        nostrDevLog("relay", "Complementary relay discovery found no new relays", {
          pubkey: user.pubkey,
          source: relaySelection.source,
          candidateCount: relaySelection.relayUrls.length,
        });
        return;
      }

      newRelayUrls.forEach((relayUrl) => addRelay(relayUrl));
      nostrDevLog("relay", "Added complementary relays from profile sources", {
        pubkey: user.pubkey,
        source: relaySelection.source,
        addedRelayUrls: newRelayUrls,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [addRelay, ndk, user?.profile?.nip05, user?.pubkey]);
}
