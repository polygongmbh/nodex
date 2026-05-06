import { useCallback, useRef, useState } from "react";
import NDK, {
  NDKEvent,
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  NDKUser,
  profileFromEvent,
  type NDKUserProfile,
} from "@nostr-dev-kit/ndk";
import { toast } from "sonner";
import i18n from "@/lib/i18n/config";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { loadCachedKind0Events } from "@/infrastructure/nostr/people-from-kind0";
import { waitForNostrExtensionAvailability } from "./session-restore";
import {
  clearSessionNoasState,
  clearSessionPrivateKey,
  clearStoredAuthMethod,
  hasNostrExtension,
  loadSessionNoasState,
  loadSessionPrivateKey,
  loadStoredAuthMethod,
  saveSessionAuthMethod,
  saveSessionNoasState,
  saveSessionPrivateKey,
  STORAGE_KEY_NIP46_BUNKER,
  STORAGE_KEY_NIP46_LOCAL_NSEC,
  STORAGE_KEY_NSEC,
} from "./storage";
import type { AuthMethod } from "./contracts";

function resolveNoasLoginHandle(username: string, apiBaseUrl: string): string {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return "";
  if (normalizedUsername.includes("@")) return normalizedUsername;

  try {
    const domain = new URL(apiBaseUrl).hostname;
    return domain ? `${normalizedUsername}@${domain}` : normalizedUsername;
  } catch {
    return normalizedUsername;
  }
}

export function showLoginSuccessToast(params: {
  authMethod: Exclude<AuthMethod, null>;
  noasUsername?: string;
  noasApiBaseUrl?: string;
  noasMode?: "signin" | "signup";
}) {
  switch (params.authMethod) {
    case "extension":
      toast.success(i18n.t("auth:auth.modal.success.extension"));
      return;
    case "privateKey":
      toast.success(i18n.t("auth:auth.modal.success.privateKey"));
      return;
    case "guest":
      toast.success(i18n.t("auth:auth.modal.success.guest"));
      return;
    case "nostrConnect":
      toast.success(i18n.t("auth:auth.modal.success.signer"));
      return;
    case "noas": {
      const handle = resolveNoasLoginHandle(params.noasUsername || "", params.noasApiBaseUrl || "");
      const successKey = params.noasMode === "signup" ? "auth:auth.modal.success.noasSignUp" : "auth:auth.modal.success.noas";
      toast.success(i18n.t(successKey, { handle }));
      return;
    }
  }
}

export function profileFromCachedKind0(pubkey: string): NDKUserProfile | undefined {
  const events = loadCachedKind0Events().filter(e => e.pubkey === pubkey);
  if (events.length === 0) return undefined;
  const best = events.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
  const event = new NDKEvent();
  event.content = best.content;
  return profileFromEvent(event);
}

interface UseSessionArgs {
  setUser: (user: NDKUser | null) => void;
  setAuthMethod: (method: AuthMethod) => void;
}

export function useSession({ setUser, setAuthMethod }: UseSessionArgs) {
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const [lockedNoasUsername, setLockedNoasUsername] = useState<string | null>(null);
  const lockedNoasKeyRef = useRef<string | null>(null);
  const sessionPasswordHashRef = useRef<string | null>(null);

  const applyAuthenticatedState = useCallback((
    ndkInstance: NDK,
    signer: NDKNip07Signer | NDKNip46Signer | NDKPrivateKeySigner,
    authenticatedUser: NDKUser,
    nextAuthMethod: NonNullable<AuthMethod>
  ) => {
    ndkInstance.signer = signer;
    setUser(authenticatedUser);
    setAuthMethod(nextAuthMethod);
  }, [setAuthMethod, setUser]);

  const clearTransientAuthState = useCallback(() => {
    clearSessionPrivateKey();
    clearSessionNoasState();
  }, []);

  const persistNoasSession = useCallback((params: {
    privateKey: string;
    apiBaseUrl: string;
    username: string;
    passwordHash?: string;
    relayUrls: string[];
  }) => {
    saveSessionPrivateKey(params.privateKey);
    saveSessionNoasState({
      apiBaseUrl: params.apiBaseUrl,
      username: params.username,
      passwordHash: params.passwordHash,
      relayUrls: params.relayUrls,
    });
    saveSessionAuthMethod("noas");
  }, []);

  const createRestoreSession = useCallback((
    ndkInstance: NDK,
    onConnectResolvedAuthRelayUrls: (relayUrls: string[]) => void
  ): { restore: () => Promise<void>; abort: () => void } => {
    let extensionRestoreController: AbortController | undefined;

    const restore = async (): Promise<void> => {
      const savedAuthMethod = loadStoredAuthMethod();
      if (savedAuthMethod === "guest") {
        const savedNsec = localStorage.getItem(STORAGE_KEY_NSEC);
        if (!savedNsec) return;
        try {
          const signer = new NDKPrivateKeySigner(savedNsec);
          const ndkUser = await signer.user();
          if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
          applyAuthenticatedState(ndkInstance, signer, ndkUser, "guest");
          showLoginSuccessToast({ authMethod: "guest" });
        } catch {
          clearStoredAuthMethod();
        }
        return;
      }

      if (savedAuthMethod === "extension") {
        extensionRestoreController = new AbortController();
        const availableImmediately = hasNostrExtension();
        nostrDevLog("auth", "Attempting extension session restore", {
          immediateAvailability: availableImmediately,
        });

        const isExtensionAvailable = availableImmediately
          ? true
          : await waitForNostrExtensionAvailability({ signal: extensionRestoreController.signal });

        if (!isExtensionAvailable) {
          nostrDevLog("auth", "Extension restore failed: extension unavailable after wait window");
          clearStoredAuthMethod();
          return;
        }

        const signer = new NDKNip07Signer();
        try {
          const ndkUser = await signer.user();
          if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
          applyAuthenticatedState(ndkInstance, signer, ndkUser, "extension");
          showLoginSuccessToast({ authMethod: "extension" });
          nostrDevLog("auth", "Extension session restored", { pubkey: ndkUser.pubkey });
        } catch (error) {
          nostrDevLog("auth", "Extension restore failed while resolving signer user", {
            error: error instanceof Error ? error.message : String(error),
          });
          clearStoredAuthMethod();
        }
        return;
      }

      if (savedAuthMethod === "nostrConnect") {
        const bunkerUrl = localStorage.getItem(STORAGE_KEY_NIP46_BUNKER);
        const localKey = localStorage.getItem(STORAGE_KEY_NIP46_LOCAL_NSEC) || undefined;
        if (!bunkerUrl) {
          clearStoredAuthMethod();
          return;
        }
        const signer = NDKNip46Signer.bunker(ndkInstance, bunkerUrl, localKey);
        try {
          const ndkUser: NDKUser = await signer.blockUntilReady();
          await ndkUser.fetchProfile();
          if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
          applyAuthenticatedState(ndkInstance, signer, ndkUser, "nostrConnect");
          showLoginSuccessToast({ authMethod: "nostrConnect" });
        } catch {
          clearStoredAuthMethod();
          localStorage.removeItem(STORAGE_KEY_NIP46_BUNKER);
          localStorage.removeItem(STORAGE_KEY_NIP46_LOCAL_NSEC);
        }
        return;
      }

      if (savedAuthMethod === "privateKey") {
        const sessionPrivateKey = loadSessionPrivateKey();
        if (!sessionPrivateKey) {
          clearStoredAuthMethod();
          return;
        }

        try {
          const signer = new NDKPrivateKeySigner(sessionPrivateKey);
          const ndkUser = await signer.user();
          if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
          applyAuthenticatedState(ndkInstance, signer, ndkUser, "privateKey");
          showLoginSuccessToast({ authMethod: "privateKey" });
        } catch {
          clearStoredAuthMethod();
          clearSessionPrivateKey();
        }
        return;
      }

      if (savedAuthMethod === "noas") {
        const sessionPrivateKey = loadSessionPrivateKey();
        const noasSession = loadSessionNoasState();
        if (!sessionPrivateKey || !noasSession) {
          clearStoredAuthMethod();
          clearSessionPrivateKey();
          clearSessionNoasState();
          return;
        }

        // Encrypted key (not trusted): lock session, prompt for password
        if (sessionPrivateKey.startsWith('ncryptsec')) {
          setIsSessionLocked(true);
          setLockedNoasUsername(noasSession.username);
          lockedNoasKeyRef.current = sessionPrivateKey;
          return;
        }

        try {
          const signer = new NDKPrivateKeySigner(sessionPrivateKey);
          const ndkUser = await signer.user();
          ndkUser.profile = {
            name: noasSession.username,
            displayName: noasSession.username,
            picture: `${noasSession.apiBaseUrl}/picture/${ndkUser.pubkey}`,
          };
          applyAuthenticatedState(ndkInstance, signer, ndkUser, "noas");
          onConnectResolvedAuthRelayUrls(noasSession.relayUrls || []);
          showLoginSuccessToast({
            authMethod: "noas",
            noasUsername: noasSession.username,
            noasApiBaseUrl: noasSession.apiBaseUrl,
          });
        } catch {
          clearStoredAuthMethod();
          clearSessionPrivateKey();
          clearSessionNoasState();
        }
      }
    };

    return {
      restore,
      abort: () => extensionRestoreController?.abort(),
    };
  }, [applyAuthenticatedState]);

  const clearLockedSession = useCallback(() => {
    setIsSessionLocked(false);
    setLockedNoasUsername(null);
    lockedNoasKeyRef.current = null;
    sessionPasswordHashRef.current = null;
  }, []);

  return {
    isSessionLocked,
    setIsSessionLocked,
    lockedNoasUsername,
    setLockedNoasUsername,
    lockedNoasKeyRef,
    sessionPasswordHashRef,
    applyAuthenticatedState,
    clearTransientAuthState,
    persistNoasSession,
    createRestoreSession,
    clearLockedSession,
  };
}
