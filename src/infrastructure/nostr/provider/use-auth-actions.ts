import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import NDK, {
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  NDKUser,
  type NDKUserProfile,
} from "@nostr-dev-kit/ndk";
import { buildDeterministicGuestName } from "@/lib/guest-name";
import {
  clearSessionNoasState,
  clearSessionPrivateKey,
  clearStoredAuthMethod,
  hasNostrExtension,
  savePersistentAuthMethod,
  saveSessionAuthMethod,
  saveSessionPrivateKey,
  STORAGE_KEY_NIP46_BUNKER,
  STORAGE_KEY_NIP46_LOCAL_NSEC,
  STORAGE_KEY_NSEC,
} from "./storage";
import { showLoginSuccessToast, profileFromCachedKind0 } from "./use-session";
import type { AuthMethod } from "./contracts";

interface UseAuthActionsArgs {
  ndk: NDK | null;
  applyAuthenticatedState: (
    ndkInstance: NDK,
    signer: NDKNip07Signer | NDKNip46Signer | NDKPrivateKeySigner,
    user: NDKUser,
    nextAuthMethod: NonNullable<AuthMethod>
  ) => void;
  clearTransientAuthState: () => void;
  fetchLatestKind0Profile: (pubkey: string, options?: { force?: boolean }) => Promise<NDKUserProfile | null>;
  retryNip42RelaysAfterSignIn: () => void;
  setUser: Dispatch<SetStateAction<NDKUser | null>>;
  setAuthMethod: Dispatch<SetStateAction<AuthMethod>>;
  setIsAuthenticating: Dispatch<SetStateAction<boolean>>;
  setIsProfileSyncing: Dispatch<SetStateAction<boolean>>;
  publishPresenceOffline: (relayUrlsOverride?: string[]) => Promise<void>;
  profileSyncRunRef: MutableRefObject<number>;
  resetAuthSessionRefs: () => void;
  clearVerificationStateOnLogout: () => void;
  resetRejectedRelayStatuses: () => void;
  clearKind0Caches: () => void;
  clearLockedSession: () => void;
}

export function useAuthActions(args: UseAuthActionsArgs) {
  const {
    ndk,
    applyAuthenticatedState,
    clearTransientAuthState,
    fetchLatestKind0Profile,
    retryNip42RelaysAfterSignIn,
    setUser,
    setAuthMethod,
    setIsAuthenticating,
    setIsProfileSyncing,
    publishPresenceOffline,
    profileSyncRunRef,
    resetAuthSessionRefs,
    clearVerificationStateOnLogout,
    resetRejectedRelayStatuses,
    clearKind0Caches,
    clearLockedSession,
  } = args;

  const loginWithExtension = useCallback(async (): Promise<boolean> => {
    if (!ndk) return false;
    if (!hasNostrExtension()) {
      console.error("No Nostr extension found");
      return false;
    }

    setIsAuthenticating(true);
    try {
      const signer = new NDKNip07Signer();
      const ndkUser = await signer.user();
      if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
      applyAuthenticatedState(ndk, signer, ndkUser, "extension");
      showLoginSuccessToast({ authMethod: "extension" });
      clearTransientAuthState();
      savePersistentAuthMethod("extension");
      retryNip42RelaysAfterSignIn();
      return true;
    } catch (error) {
      console.error("Extension login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [applyAuthenticatedState, clearTransientAuthState, ndk, retryNip42RelaysAfterSignIn, setIsAuthenticating]);

  const loginWithPrivateKey = useCallback(async (nsecOrHex: string): Promise<boolean> => {
    if (!ndk) return false;

    setIsAuthenticating(true);
    try {
      const signer = new NDKPrivateKeySigner(nsecOrHex);
      const ndkUser = await signer.user();
      if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
      applyAuthenticatedState(ndk, signer, ndkUser, "privateKey");
      showLoginSuccessToast({ authMethod: "privateKey" });
      clearTransientAuthState();
      saveSessionPrivateKey(nsecOrHex);
      saveSessionAuthMethod("privateKey");
      retryNip42RelaysAfterSignIn();
      return true;
    } catch (error) {
      console.error("Private key login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [applyAuthenticatedState, clearTransientAuthState, ndk, retryNip42RelaysAfterSignIn, setIsAuthenticating]);

  const loginAsGuest = useCallback(async (): Promise<boolean> => {
    if (!ndk) return false;

    setIsAuthenticating(true);
    try {
      const nsec = localStorage.getItem(STORAGE_KEY_NSEC);
      let signer: NDKPrivateKeySigner;

      if (nsec) {
        signer = new NDKPrivateKeySigner(nsec);
      } else {
        signer = NDKPrivateKeySigner.generate();
        const privateKey = signer.privateKey;
        if (privateKey) {
          localStorage.setItem(STORAGE_KEY_NSEC, privateKey);
        }
      }

      const ndkUser = await signer.user();
      ndkUser.profile = { name: buildDeterministicGuestName(ndkUser.pubkey) };
      applyAuthenticatedState(ndk, signer, ndkUser, "guest");
      showLoginSuccessToast({ authMethod: "guest" });
      clearTransientAuthState();
      savePersistentAuthMethod("guest");
      retryNip42RelaysAfterSignIn();
      return true;
    } catch (error) {
      console.error("Guest login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [applyAuthenticatedState, clearTransientAuthState, ndk, retryNip42RelaysAfterSignIn, setIsAuthenticating]);

  const loginWithNostrConnect = useCallback(async (bunkerUrl: string): Promise<boolean> => {
    if (!ndk) return false;
    if (!bunkerUrl.trim().startsWith("bunker://")) {
      console.error("Invalid NIP-46 bunker URL");
      return false;
    }

    setIsAuthenticating(true);
    try {
      const localKey = localStorage.getItem(STORAGE_KEY_NIP46_LOCAL_NSEC) || undefined;
      const signer = NDKNip46Signer.bunker(ndk, bunkerUrl.trim(), localKey);
      const ndkUser = await signer.blockUntilReady();
      const profile = await fetchLatestKind0Profile(ndkUser.pubkey, { force: true });
      if (profile) ndkUser.profile = profile;
      else if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
      applyAuthenticatedState(ndk, signer, ndkUser, "nostrConnect");
      showLoginSuccessToast({ authMethod: "nostrConnect" });
      clearTransientAuthState();
      savePersistentAuthMethod("nostrConnect");
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
  }, [applyAuthenticatedState, clearTransientAuthState, fetchLatestKind0Profile, ndk, retryNip42RelaysAfterSignIn, setIsAuthenticating]);

  const logout = useCallback(() => {
    void publishPresenceOffline();
    profileSyncRunRef.current += 1;
    setIsProfileSyncing(false);
    if (ndk) {
      ndk.signer = undefined;
    }
    setUser(null);
    setAuthMethod(null);
    resetAuthSessionRefs();
    clearVerificationStateOnLogout();
    resetRejectedRelayStatuses();
    clearKind0Caches();
    clearStoredAuthMethod();
    clearSessionPrivateKey();
    clearSessionNoasState();
    clearLockedSession();
    localStorage.removeItem(STORAGE_KEY_NIP46_BUNKER);
    localStorage.removeItem(STORAGE_KEY_NIP46_LOCAL_NSEC);
    // Keep guest key for potential re-login
  }, [
    clearKind0Caches,
    clearLockedSession,
    clearVerificationStateOnLogout,
    ndk,
    profileSyncRunRef,
    publishPresenceOffline,
    resetAuthSessionRefs,
    resetRejectedRelayStatuses,
    setAuthMethod,
    setIsProfileSyncing,
    setUser,
  ]);

  return {
    loginWithExtension,
    loginWithPrivateKey,
    loginAsGuest,
    loginWithNostrConnect,
    logout,
  };
}
