import { useCallback } from "react";
import type { MutableRefObject } from "react";
import NDK, {
  NDKEvent,
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  NDKRelaySet,
  NDKUser,
} from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import { buildDeterministicGuestName } from "@/lib/guest-name";
import { hasNostrExtension, STORAGE_KEY_AUTH, STORAGE_KEY_NIP46_BUNKER, STORAGE_KEY_NIP46_LOCAL_NSEC, STORAGE_KEY_NSEC } from "./storage";
import type { AuthMethod, NDKRelayStatus, NostrUser } from "./contracts";
import type { RelayVerificationCallbacks } from "./use-relay-verification";
import type { PublishCallbacks } from "./use-publish";

export interface AuthActionsCallbacks {
  loginWithExtension: () => Promise<boolean>;
  loginWithPrivateKey: (nsecOrHex: string) => Promise<boolean>;
  loginAsGuest: () => Promise<boolean>;
  loginWithNostrConnect: (bunkerUrl: string) => Promise<boolean>;
  getGuestPrivateKey: () => string | null;
  publishPresenceOffline: () => Promise<void>;
  logout: () => void;
}

export function useAuthActions(
  ndkRef: MutableRefObject<NDK | null>,
  relays: NDKRelayStatus[],
  resolvedDefaultRelays: string[],
  retryNip42RelaysAfterSignIn: RelayVerificationCallbacks["retryNip42RelaysAfterSignIn"],
  publishEvent: PublishCallbacks["publishEvent"],
  profileSyncRunRef: MutableRefObject<number>,
  setUser: React.Dispatch<React.SetStateAction<NostrUser | null>>,
  setAuthMethod: React.Dispatch<React.SetStateAction<AuthMethod>>,
  setIsAuthenticating: React.Dispatch<React.SetStateAction<boolean>>,
  setIsProfileSyncing: React.Dispatch<React.SetStateAction<boolean>>,
  authMethod: AuthMethod,
): AuthActionsCallbacks {

  const loginWithExtension = useCallback(async (): Promise<boolean> => {
    const ndk = ndkRef.current;
    if (!ndk) return false;

    if (!hasNostrExtension()) {
      console.error("No Nostr extension found");
      return false;
    }

    setIsAuthenticating(true);
    try {
      const signer = new NDKNip07Signer();
      ndk.signer = signer;

      const ndkUser = await signer.user();
      setUser({ pubkey: ndkUser.pubkey, npub: ndkUser.npub, profile: ndkUser.profile ?? undefined });
      setAuthMethod("extension");
      localStorage.setItem(STORAGE_KEY_AUTH, "extension");
      retryNip42RelaysAfterSignIn();
      return true;
    } catch (error) {
      console.error("Extension login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndkRef, retryNip42RelaysAfterSignIn, setAuthMethod, setIsAuthenticating, setUser]);

  const loginWithPrivateKey = useCallback(async (nsecOrHex: string): Promise<boolean> => {
    const ndk = ndkRef.current;
    if (!ndk) return false;

    setIsAuthenticating(true);
    try {
      const signer = new NDKPrivateKeySigner(nsecOrHex);
      ndk.signer = signer;

      const ndkUser = await signer.user();

      setUser({
        pubkey: ndkUser.pubkey,
        npub: ndkUser.npub,
      });
      setAuthMethod("privateKey");
      localStorage.setItem(STORAGE_KEY_AUTH, "privateKey");
      // Don't store private key for security
      retryNip42RelaysAfterSignIn();
      return true;
    } catch (error) {
      console.error("Private key login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndkRef, retryNip42RelaysAfterSignIn, setAuthMethod, setIsAuthenticating, setUser]);

  const loginAsGuest = useCallback(async (): Promise<boolean> => {
    const ndk = ndkRef.current;
    if (!ndk) return false;

    setIsAuthenticating(true);
    try {
      // Check for existing guest key
      const nsec = localStorage.getItem(STORAGE_KEY_NSEC);
      let signer: NDKPrivateKeySigner;

      if (nsec) {
        signer = new NDKPrivateKeySigner(nsec);
      } else {
        signer = NDKPrivateKeySigner.generate();
        // Store for session persistence
        const privateKey = signer.privateKey;
        if (privateKey) {
          localStorage.setItem(STORAGE_KEY_NSEC, privateKey);
        }
      }

      ndk.signer = signer;
      const ndkUser = await signer.user();

      setUser({
        pubkey: ndkUser.pubkey,
        npub: ndkUser.npub,
        profile: {
          name: buildDeterministicGuestName(ndkUser.pubkey),
        },
      });
      setAuthMethod("guest");
      localStorage.setItem(STORAGE_KEY_AUTH, "guest");
      retryNip42RelaysAfterSignIn();
      return true;
    } catch (error) {
      console.error("Guest login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndkRef, retryNip42RelaysAfterSignIn, setAuthMethod, setIsAuthenticating, setUser]);

  const loginWithNostrConnect = useCallback(async (bunkerUrl: string): Promise<boolean> => {
    const ndk = ndkRef.current;
    if (!ndk) return false;
    if (!bunkerUrl.trim().startsWith("bunker://")) {
      console.error("Invalid NIP-46 bunker URL");
      return false;
    }

    setIsAuthenticating(true);
    try {
      const localKey = localStorage.getItem(STORAGE_KEY_NIP46_LOCAL_NSEC) || undefined;
      const signer = NDKNip46Signer.bunker(ndk, bunkerUrl.trim(), localKey);
      ndk.signer = signer;

      const ndkUser: NDKUser = await signer.blockUntilReady();
      await ndkUser.fetchProfile();

      setUser({ pubkey: ndkUser.pubkey, npub: ndkUser.npub, profile: ndkUser.profile ?? undefined });
      setAuthMethod("nostrConnect");
      localStorage.setItem(STORAGE_KEY_AUTH, "nostrConnect");
      localStorage.setItem(STORAGE_KEY_NIP46_BUNKER, bunkerUrl.trim());
      if (signer.localSigner?.privateKey) {
        localStorage.setItem(STORAGE_KEY_NIP46_LOCAL_NSEC, signer.localSigner.privateKey);
      }
      retryNip42RelaysAfterSignIn();
      return true;
    } catch (error) {
      console.error("Nostr Connect login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndkRef, retryNip42RelaysAfterSignIn, setAuthMethod, setIsAuthenticating, setUser]);

  const getGuestPrivateKey = useCallback((): string | null => {
    if (authMethod !== "guest") return null;
    return localStorage.getItem(STORAGE_KEY_NSEC);
  }, [authMethod]);

  const publishPresenceOffline = useCallback(async () => {
    const ndk = ndkRef.current;
    if (!ndk || !ndk.signer) return;

    try {
      const event = new NDKEvent(ndk);
      event.kind = NostrEventKind.UserStatus;
      event.content = buildOfflinePresenceContent();
      event.tags = buildPresenceTags(
        Math.floor(Date.now() / 1000) + NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS
      );
      await event.sign();

      const relayUrls = relays.map((relay) => relay.url);
      const relaySet = NDKRelaySet.fromRelayUrls(
        relayUrls.length > 0 ? relayUrls : resolvedDefaultRelays,
        ndk,
        true
      );
      await event.publish(relaySet);
    } catch (error) {
      console.warn("Failed to publish offline presence event during logout", error);
    }
  }, [ndkRef, relays, resolvedDefaultRelays]);

  const logout = useCallback(() => {
    void publishPresenceOffline();
    profileSyncRunRef.current += 1;
    setIsProfileSyncing(false);
    const ndk = ndkRef.current;
    if (ndk) {
      ndk.signer = undefined;
    }
    setUser(null);
    setAuthMethod(null);
    localStorage.removeItem(STORAGE_KEY_AUTH);
    localStorage.removeItem(STORAGE_KEY_NIP46_BUNKER);
    localStorage.removeItem(STORAGE_KEY_NIP46_LOCAL_NSEC);
    // Keep guest key for potential re-login
  }, [ndkRef, profileSyncRunRef, publishPresenceOffline, setAuthMethod, setIsProfileSyncing, setUser]);

  return {
    loginWithExtension,
    loginWithPrivateKey,
    loginAsGuest,
    loginWithNostrConnect,
    getGuestPrivateKey,
    publishPresenceOffline,
    logout,
  };
}
