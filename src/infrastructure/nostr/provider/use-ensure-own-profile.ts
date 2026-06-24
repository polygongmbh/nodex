import { useEffect, useRef } from "react";
import type { NDKUser, NDKUserProfile } from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "@/lib/nostr/types";
import { buildKind0Content, type EditableNostrProfile } from "@/infrastructure/nostr/profile-metadata";
import { resolveWritableNdkRelayUrls } from "@/lib/nostr/relay-write-targets";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import type { AuthMethod, NDKContextValue, NDKRelayStatus } from "./contracts";

type PublishEvent = NDKContextValue["publishEvent"];
type FetchLatestKind0Profile = (
  pubkey: string,
  options?: { force?: boolean }
) => Promise<NDKUserProfile | null>;

// Per-pubkey lifecycle of the ensure check:
// - "unknown":   haven't determined yet whether the relays hold our kind 0
// - "exists":    relays already have an own kind 0 — never auto-publish (terminal)
// - "published": relays had none, we published ours — re-broadcast to new relays
type EnsureStatus = "unknown" | "exists" | "published";

interface EnsureState {
  pubkey: string | null;
  status: EnsureStatus;
  // Writable relays our kind 0 has been broadcast to, so a freshly connected
  // relay is detected as "new" and gets the profile too.
  coveredRelays: Set<string>;
}

function toPublishableProfile(profile: NDKUserProfile | null | undefined): EditableNostrProfile | null {
  const name = profile?.name?.trim();
  if (!name) return null;
  return {
    name,
    displayName: profile?.displayName?.trim() || undefined,
    about: profile?.about?.trim() || undefined,
    picture: profile?.picture?.trim() || undefined,
    nip05: profile?.nip05?.trim() || undefined,
  };
}

/**
 * After signing in — and again whenever a new relay connects — make sure the
 * user's profile metadata (kind 0) is present on the connected relays.
 *
 * We only publish the locally known profile when the relays have no own kind 0
 * yet, so an established profile is never clobbered. The common case this serves
 * is a Noas / private-key login whose profile lives only in app state: it gets
 * propagated to the relays the app actually talks to.
 *
 * Guests are skipped — their deterministic throwaway identity has no business
 * being broadcast to relays.
 */
export function useEnsureOwnProfile(
  user: NDKUser | null,
  authMethod: AuthMethod,
  relays: NDKRelayStatus[],
  publishEvent: PublishEvent,
  fetchLatestKind0Profile: FetchLatestKind0Profile,
): void {
  const stateRef = useRef<EnsureState>({ pubkey: null, status: "unknown", coveredRelays: new Set() });
  const runRef = useRef(0);

  // why: trigger on sign-in and on every relay-set change so a profile that
  // exists only in app state reaches the relays once a writable connection is
  // available — publishing solely when no own kind 0 is found on the relays.
  useEffect(() => {
    const pubkey = user?.pubkey ?? null;

    if (stateRef.current.pubkey !== pubkey) {
      stateRef.current = { pubkey, status: "unknown", coveredRelays: new Set() };
    }
    if (!pubkey || authMethod === null || authMethod === "guest") return;
    if (stateRef.current.status === "exists") return;

    const candidate = toPublishableProfile(user?.profile);
    if (!candidate) return; // nothing publishable yet (profile not synced / nameless)

    const writableRelayUrls = resolveWritableNdkRelayUrls(relays);
    if (writableRelayUrls.length === 0) return; // wait for a writable relay connection

    if (stateRef.current.status === "published") {
      const hasNewRelay = writableRelayUrls.some((url) => !stateRef.current.coveredRelays.has(url));
      if (!hasNewRelay) return; // every connected relay already has our kind 0
    }

    // Later runs supersede earlier ones: a re-run caused by a growing relay set
    // invalidates an in-flight check so the publish targets the latest relays.
    const runId = ++runRef.current;
    const isStale = () => runRef.current !== runId;

    const run = async () => {
      try {
        if (stateRef.current.status === "unknown") {
          const existing = await fetchLatestKind0Profile(pubkey);
          if (isStale()) return;
          if (existing) {
            stateRef.current = { pubkey, status: "exists", coveredRelays: new Set() };
            nostrDevLog("provider", "Own kind 0 already on relays — skipping publish", { pubkey });
            return;
          }
        }

        const result = await publishEvent(
          NostrEventKind.Metadata,
          buildKind0Content(candidate),
          [],
          undefined,
          writableRelayUrls,
        );
        if (isStale()) return;

        stateRef.current = { pubkey, status: "published", coveredRelays: new Set(writableRelayUrls) };
        nostrDevLog(
          "provider",
          result.success ? "Published own kind 0 — relays had none" : "Failed to publish own kind 0",
          { pubkey, relayUrls: writableRelayUrls, success: result.success },
        );
      } catch (error) {
        if (!isStale()) console.warn("Ensure own profile: publish failed", error);
      }
    };

    void run();
  }, [user, authMethod, relays, publishEvent, fetchLatestKind0Profile]);
}
