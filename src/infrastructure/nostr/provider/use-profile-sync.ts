import { useCallback, useEffect, useMemo } from "react";
import type NDK from "@nostr-dev-kit/ndk";
import { NDKUser } from "@nostr-dev-kit/ndk";
import type { NDKUserProfile } from "@nostr-dev-kit/ndk";
import type { MutableRefObject } from "react";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  hasRequiredProfileFields,
  buildKind0Content,
  type EditableNostrProfile,
} from "@/infrastructure/nostr/profile-metadata";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { saveCachedKind0Events, loadCachedKind0Events } from "@/infrastructure/nostr/people-from-kind0";
import type { NDKRelayStatus } from "./contracts";
import type { PublishCallbacks } from "./use-publish";

export interface ProfileSyncCallbacks {
  updateUserProfile: (profile: EditableNostrProfile) => Promise<boolean>;
  userProfileSnapshot: NDKUserProfile | null;
}

export function useProfileSync(
  ndk: NDK | null,
  user: NDKUser | null,
  relays: NDKRelayStatus[],
  publishEvent: PublishCallbacks["publishEvent"],
  fetchLatestKind0Profile: (pubkey: string) => Promise<NDKUserProfile | null>,
  profileSyncRunRef: MutableRefObject<number>,
  setUser: React.Dispatch<React.SetStateAction<NDKUser | null>>,
  setNeedsProfileSetup: React.Dispatch<React.SetStateAction<boolean>>,
  setIsProfileSyncing: React.Dispatch<React.SetStateAction<boolean>>,
): ProfileSyncCallbacks {

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
      .filter((relay) => relay.status !== "verification-failed")
      .map((relay) => relay.url);

    if (relayUrls.length === 0) {
      console.warn("Profile update skipped: no managed relays");
      return false;
    }

    const content = buildKind0Content(profile);
    const result = await publishEvent(
      NostrEventKind.Metadata,
      content,
      [],
      undefined,
      relayUrls
    );

    if (!result.success) {
      return false;
    }

    const normalizedProfile: NDKUserProfile = {
      name: profile.name.trim(),
      displayName: profile.displayName?.trim() || undefined,
      picture: profile.picture?.trim() || undefined,
      about: profile.about?.trim() || undefined,
      nip05: profile.nip05?.trim() || undefined,
    };

    setUser((prev) => {
      if (!prev) return prev;
      const updated = new NDKUser({ pubkey: prev.pubkey });
      updated.profile = normalizedProfile;
      return updated;
    });
    setNeedsProfileSetup(false);

    if (user?.pubkey) {
      const existing = loadCachedKind0Events();
      const without = existing.filter((e) => e.pubkey !== user.pubkey);
      saveCachedKind0Events([
        ...without,
        {
          kind: NostrEventKind.Metadata,
          pubkey: user.pubkey,
          created_at: Math.floor(Date.now() / 1000),
          content,
        },
      ]);
    }

    nostrDevLog("provider", "Profile updated", { profile });
    return true;
  }, [publishEvent, relays, setUser, setNeedsProfileSetup, user?.pubkey]);

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
        const updated = new NDKUser({ pubkey: prev.pubkey });
        updated.profile = mergedProfile;
        return updated;
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
    updateUserProfile,
    userProfileSnapshot,
  };
}
