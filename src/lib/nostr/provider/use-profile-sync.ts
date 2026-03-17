import { useCallback, useEffect, useMemo } from "react";
import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import type { MutableRefObject } from "react";
import { NostrEventKind } from "../types";
import { hasRequiredProfileFields, mergeKind0Profiles, buildKind0Content, type EditableNostrProfile } from "../profile-metadata";
import { verifyNip05 } from "../nip05-verify";
import { nostrDevLog } from "../dev-logs";
import type { NDKRelayStatus, NostrUser } from "./contracts";
import type { RelayVerificationCallbacks } from "./use-relay-verification";
import type { PublishCallbacks } from "./use-publish";

export interface ProfileSyncCallbacks {
  fetchLatestKind0Profile: (pubkey: string) => Promise<NostrUser["profile"] | null>;
  updateUserProfile: (profile: EditableNostrProfile) => Promise<boolean>;
  userProfileSnapshot: NostrUser["profile"] | null;
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

  const fetchLatestKind0Profile = useCallback(async (pubkey: string): Promise<NostrUser["profile"] | null> => {
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
        const parsed = mergeKind0Profiles(candidates);
        resolve({
          name: parsed.name,
          displayName: parsed.displayName,
          picture: parsed.picture,
          about: parsed.about,
          nip05: parsed.nip05,
        });
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

  const userProfileSnapshot = useMemo<NostrUser["profile"] | null>(() => {
    if (!user?.profile) return null;
    return {
      name: user.profile.name,
      displayName: user.profile.displayName,
      picture: user.profile.picture,
      about: user.profile.about,
      nip05: user.profile.nip05,
      nip05Verified: user.profile.nip05Verified,
    };
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

    let nip05Verified = false;
    if (profile.nip05) {
      nip05Verified = await verifyNip05(profile.nip05, user?.pubkey || "");
    }

    setUser((prev) => prev ? ({
      ...prev,
      profile: {
        name: profile.name.trim(),
        displayName: profile.displayName?.trim() || undefined,
        picture: profile.picture?.trim() || undefined,
        about: profile.about?.trim() || undefined,
        nip05: profile.nip05?.trim() || undefined,
        nip05Verified,
      },
    }) : prev);
    setNeedsProfileSetup(false);
    return true;
  }, [publishEvent, relays, user?.pubkey, setUser, setNeedsProfileSetup]);

  useEffect(() => {
    if (!user?.pubkey) {
      setNeedsProfileSetup(false);
      setIsProfileSyncing(false);
      return;
    }

    const baseProfile = userProfileSnapshot;
    const syncRun = profileSyncRunRef.current + 1;
    profileSyncRunRef.current = syncRun;
    let cancelled = false;
    const isStale = () => cancelled || profileSyncRunRef.current !== syncRun;

    setIsProfileSyncing(true);

    const syncProfile = async () => {
      let signerProfile: NostrUser["profile"] | null = null;
      if (ndk?.signer) {
        try {
          const signerUser = await ndk.signer.user();
          if (!isStale() && signerUser.pubkey === user.pubkey) {
            await signerUser.fetchProfile();
            if (!isStale()) {
              signerProfile = {
                name: signerUser.profile?.name,
                displayName: signerUser.profile?.displayName,
                picture: signerUser.profile?.image,
                about: signerUser.profile?.about,
                nip05: signerUser.profile?.nip05,
              };
            }
          }
        } catch (error) {
          console.warn("Profile sync: signer profile fetch failed", error);
        }
      }

      const kind0Profile = await fetchLatestKind0Profile(user.pubkey);
      if (isStale()) return;

      const mergedProfile = {
        ...(userProfileSnapshot || {}),
        ...(signerProfile || {}),
        ...(kind0Profile || {}),
      };

      let nip05Verified = false;
      if (mergedProfile.nip05) {
        nip05Verified = await verifyNip05(mergedProfile.nip05, user.pubkey);
      }
      if (isStale()) return;

      const nextProfile = {
        ...mergedProfile,
        nip05Verified,
      };

      setUser((prev) => {
        if (!prev || prev.pubkey !== user.pubkey) return prev;
        const previousProfile = prev.profile;
        const isUnchanged =
          previousProfile?.name === nextProfile.name &&
          previousProfile?.displayName === nextProfile.displayName &&
          previousProfile?.picture === nextProfile.picture &&
          previousProfile?.about === nextProfile.about &&
          previousProfile?.nip05 === nextProfile.nip05 &&
          previousProfile?.nip05Verified === nextProfile.nip05Verified;
        if (isUnchanged) return prev;
        return {
          ...prev,
          profile: nextProfile,
        };
      });
      setNeedsProfileSetup(!hasRequiredProfileFields(mergedProfile));
      setIsProfileSyncing(false);
    };

    void syncProfile().catch((error) => {
      if (isStale()) return;
      console.warn("Profile sync failed", error);
      setNeedsProfileSetup(!(baseProfile && hasRequiredProfileFields(baseProfile)));
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
