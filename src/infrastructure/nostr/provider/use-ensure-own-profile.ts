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
 * After signing in, publish the user's profile metadata (kind 0) to the
 * connected relays when they don't already hold one — so a profile that lives
 * only in app state (Noas / private-key logins) reaches the relays the app
 * talks to. An existing profile is never overwritten.
 *
 * Only a confirmed outcome settles the attempt: an existing kind 0 was found,
 * or our own publish succeeded. A failed publish is deliberately not recorded,
 * so the next relay status change simply retries it. Guests are skipped.
 */
export function useEnsureOwnProfile(
  user: NDKUser | null,
  authMethod: AuthMethod,
  relays: NDKRelayStatus[],
  publishEvent: PublishEvent,
  fetchLatestKind0Profile: FetchLatestKind0Profile,
): void {
  // Pubkey whose kind 0 is confirmed on the relays (found, or just published).
  const settledPubkeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  // why: on sign-in (and the first time a relay becomes writable) make sure the
  // user's kind 0 is on the relays, publishing the local profile only when none
  // is found — so the profile editor is no longer the only path onto the relays.
  useEffect(() => {
    const pubkey = user?.pubkey ?? null;
    if (!pubkey || authMethod === null || authMethod === "guest") return;
    if (settledPubkeyRef.current === pubkey) return;
    if (inFlightRef.current) return;

    const candidate = toPublishableProfile(user?.profile);
    if (!candidate) return; // nothing publishable yet (profile not synced / nameless)

    const writableRelayUrls = resolveWritableNdkRelayUrls(relays);
    if (writableRelayUrls.length === 0) return; // wait for a writable relay connection

    inFlightRef.current = true;
    const run = async () => {
      try {
        // force: bypass the shared kind-0 cache, whose entry may be a premature
        // null written by profile sync before any relay was connected.
        const existing = await fetchLatestKind0Profile(pubkey, { force: true });
        if (existing) {
          settledPubkeyRef.current = pubkey;
          nostrDevLog("provider", "Own kind 0 already on relays — skipping publish", { pubkey });
          return;
        }

        const result = await publishEvent(
          NostrEventKind.Metadata,
          buildKind0Content(candidate),
          [],
          undefined,
          writableRelayUrls,
        );
        if (result.success) {
          settledPubkeyRef.current = pubkey;
          nostrDevLog("provider", "Published own kind 0 — relays had none", {
            pubkey,
            relayUrls: writableRelayUrls,
          });
        } else {
          // Not recorded — the next relay status change retries the publish.
          nostrDevLog("provider", "Own kind 0 publish failed — will retry", {
            pubkey,
            rejectionReason: result.rejectionReason ?? null,
          });
        }
      } catch (error) {
        console.warn("Ensure own profile: publish failed", error);
      } finally {
        inFlightRef.current = false;
      }
    };

    void run();
  }, [user, authMethod, relays, publishEvent, fetchLatestKind0Profile]);
}
