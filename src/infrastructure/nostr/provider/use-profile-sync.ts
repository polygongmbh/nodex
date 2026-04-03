import { useCallback, useEffect, useMemo } from "react";
import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent, profileFromEvent } from "@nostr-dev-kit/ndk";
import type { NDKUserProfile } from "@nostr-dev-kit/ndk";
import type { MutableRefObject } from "react";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  hasRequiredProfileFields,
  buildKind0Content,
  type EditableNostrProfile,
} from "@/infrastructure/nostr/profile-metadata";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import type { NDKRelayStatus, NostrUser } from "./contracts";
import type { RelayVerificationCallbacks } from "./use-relay-verification";
import type { PublishCallbacks } from "./use-publish";

export interface ProfileSyncCallbacks {
  fetchLatestKind0Profile: (pubkey: string) => Promise<NDKUserProfile | null>;
  updateUserProfile: (profile: EditableNostrProfile) => Promise<boolean>;
  userProfileSnapshot: NDKUserProfile | null;
}

export function useProfileSync(
  ndk: NDK | null,
  user: NostrUser | null,
  relays: NDKRelayStatus[],
  publishEvent: PublishCallbacks["publishEvent"],
  profileSyncRunRef: MutableRefObject<number>,
  setUser: React.Dispatch<React.SetStateAction<NostrUser | null>>,
  setNeedsProfileSetup: React.Dispatch<React.SetStateAction<boolean>>,
  setIsProfileSyncing: React.Dispatch<React.SetStateAction<boolean>>,
  beginRelayOperation: RelayVerificationCallbacks["beginRelayOperation"],
  endRelayOperation: RelayVerificationCallbacks["endRelayOperation"],
): ProfileSyncCallbacks {

  const fetchLatestKind0Profile = useCallback(async (pubkey: string): Promise<NDKUserProfile | null> => {
    if (!ndk) return null;

    return await new Promise((resolve) => {
      const candidates: { createdAt: number; content: string }[] = [];
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallbackTimeoutId);
        endRelayOperation("read");
        subscription.stop();
        if (candidates.length === 0) {
          resolve(null);
          return;
        }
        const best = candidates.sort((a, b) => b.createdAt - a.createdAt)[0];
        const event = new NDKEvent(ndk);
        event.content = best.content;
        resolve(profileFromEvent(event));
      };

      beginRelayOperation("read");
      const subscription = ndk.subscribe(
        [{ kinds: [NostrEventKind.Metadata as number], authors: [pubkey] }],
        { closeOnEose: true }
      );

      subscription.on("event", (event: NDKEvent) => {
        if (event.content) {
          candidates.push({ createdAt: event.created_at || 0, content: event.content });
        }
      });
      subscription.on("eose", finish);

      // Fallback so the UI does not hang if eose never arrives.
      const fallbackTimeoutId = window.setTimeout(finish, 12000);
    });
  }, [ndk, beginRelayOperation, endRelayOperation]);

  const userProfileSnapshot = useMemo<NDKUserProfile | null>(() => {
    if (!user?.profile) return null;
    return { ...user.profile };
  }, [user?.profile]);

  const updateUserProfile = useCallback(async (profile: EditableNostrProfile): Promise<boolean> => {
    if (!hasRequiredProfileFields(profile)) {
      console.warn("Profile update rejected: missing required name");
      return false;
    }

    const relayUrls = relays
      .filter((relay) => relay.status === "connected")
      .map((relay) => relay.url);

    if (relayUrls.length === 0) {
      console.warn("Profile update skipped: no connected relays");
      return false;
    }

    const result = await publishEvent(
      NostrEventKind.Metadata,
      buildKind0Content(profile),
      [],
      undefined,
      relayUrls
    );

    if (!result.success) {
      return false;
    }

    setUser((prev) => prev ? ({
      ...prev,
      profile: {
        ...prev.profile,
        name: profile.name.trim(),
        displayName: profile.displayName?.trim() || undefined,
        picture: profile.picture?.trim() || undefined,
        about: profile.about?.trim() || undefined,
        nip05: profile.nip05?.trim() || undefined,
      },
    }) : prev);
    setNeedsProfileSetup(false);
    return true;
  }, [publishEvent, relays, setUser, setNeedsProfileSetup]);

  useEffect(() => {
    if (!user?.pubkey) {
      setNeedsProfileSetup(false);
      setIsProfileSyncing(false);
      return;
    }

    const syncRun = profileSyncRunRef.current + 1;
    profileSyncRunRef.current = syncRun;
    let cancelled = false;
    const isStale = () => cancelled || profileSyncRunRef.current !== syncRun;

    setIsProfileSyncing(true);

    const syncProfile = async () => {
      let signerProfile: NDKUserProfile | null = null;
      if (ndk?.signer) {
        try {
          const signerUser = await ndk.signer.user();
          if (!isStale() && signerUser.pubkey === user.pubkey) {
            await signerUser.fetchProfile();
            if (!isStale()) {
              signerProfile = signerUser.profile ?? null;
            }
          }
        } catch (error) {
          console.warn("Profile sync: signer profile fetch failed", error);
        }
      }

      const kind0Profile = await fetchLatestKind0Profile(user.pubkey);
      if (isStale()) return;

      const mergedProfile: NDKUserProfile = {
        ...(userProfileSnapshot || {}),
        ...(signerProfile || {}),
        ...(kind0Profile || {}),
      };

      setUser((prev) => {
        if (!prev || prev.pubkey !== user.pubkey) return prev;
        const p = prev.profile;
        const isUnchanged =
          p?.name === mergedProfile.name &&
          p?.displayName === mergedProfile.displayName &&
          p?.picture === mergedProfile.picture &&
          p?.about === mergedProfile.about &&
          p?.nip05 === mergedProfile.nip05;
        if (isUnchanged) return prev;
        return { ...prev, profile: mergedProfile };
      });

      const hasProfile = !!(mergedProfile.name || mergedProfile.displayName || mergedProfile.picture || mergedProfile.about || mergedProfile.nip05);
      setNeedsProfileSetup(!hasProfile);
      setIsProfileSyncing(false);
    };

    void syncProfile().catch((error) => {
      if (isStale()) return;
      console.warn("Profile sync failed", error);
      const p = userProfileSnapshot;
      const hasProfile = !!(p?.name || p?.displayName || p?.picture || p?.about || p?.nip05);
      setNeedsProfileSetup(!hasProfile);
      setIsProfileSyncing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ndk, fetchLatestKind0Profile, user?.pubkey, userProfileSnapshot, profileSyncRunRef, setIsProfileSyncing, setNeedsProfileSetup, setUser]);

  return {
    fetchLatestKind0Profile,
    updateUserProfile,
    userProfileSnapshot,
  };
}
