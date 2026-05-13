import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import NDK, {
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  NDKUser,
} from "@nostr-dev-kit/ndk";
import { NoasClient, hashNoasPassword, type NoasAuthResult } from "@/lib/nostr/noas-client";

export type NoasPictureUploadResult = { url: string } | { error: string };
import { isValidNoasBaseUrl, normalizeNoasBaseUrl, resolveNoasApiBaseUrl } from "@/lib/nostr/noas-discovery";
import { privateKeyHexToNsec } from "@/lib/nostr/nip49-utils";
import { buildNoasSignupOptions, resolveNoasAuthRelayUrls } from "@/infrastructure/nostr/noas-auth-helpers";
import { loadSessionNoasState } from "./storage";
import { showLoginSuccessToast } from "./use-session";
import type { AuthMethod, NDKRelayStatus } from "./contracts";

interface UseNoasArgs {
  ndk: NDK | null;
  authMethod: AuthMethod;
  user: NDKUser | null;
  relays: NDKRelayStatus[];
  configuredDefaultNoasHostUrl: string;
  applyAuthenticatedState: (
    ndkInstance: NDK,
    signer: NDKNip07Signer | NDKNip46Signer | NDKPrivateKeySigner,
    user: NDKUser,
    nextAuthMethod: NonNullable<AuthMethod>
  ) => void;
  clearTransientAuthState: () => void;
  persistNoasSession: (params: {
    privateKey: string;
    apiBaseUrl: string;
    username: string;
    passwordHash?: string;
    relayUrls: string[];
  }) => void;
  connectResolvedAuthRelayUrls: (relayUrls: string[]) => void;
  retryNip42RelaysAfterSignIn: () => void;
  setIsAuthenticating: Dispatch<SetStateAction<boolean>>;
  setIsSessionLocked: Dispatch<SetStateAction<boolean>>;
  setLockedNoasUsername: Dispatch<SetStateAction<string | null>>;
  lockedNoasKeyRef: MutableRefObject<string | null>;
  sessionPasswordHashRef: MutableRefObject<string | null>;
}

export function useNoas(args: UseNoasArgs) {
  const {
    ndk,
    authMethod,
    user,
    relays,
    configuredDefaultNoasHostUrl,
    applyAuthenticatedState,
    clearTransientAuthState,
    persistNoasSession,
    connectResolvedAuthRelayUrls,
    retryNip42RelaysAfterSignIn,
    setIsAuthenticating,
    setIsSessionLocked,
    setLockedNoasUsername,
    lockedNoasKeyRef,
    sessionPasswordHashRef,
  } = args;

  const loginWithNoas = useCallback(async (
    username: string,
    password: string,
    config?: { baseUrl?: string; trustBrowser?: boolean }
  ): Promise<NoasAuthResult> => {
    if (!ndk) return { success: false, errorCode: "server_error" };

    const submittedNoasBaseUrl = normalizeNoasBaseUrl(config?.baseUrl || configuredDefaultNoasHostUrl || "");

    if (!submittedNoasBaseUrl) {
      console.error("Noas configuration missing");
      return { success: false, errorCode: "missing_config" };
    }

    if (!isValidNoasBaseUrl(submittedNoasBaseUrl)) {
      console.error("Invalid Noas base URL");
      return { success: false, errorCode: "invalid_url" };
    }

    setIsAuthenticating(true);
    try {
      const noasApiUrl = await resolveNoasApiBaseUrl(submittedNoasBaseUrl);

      if (!isValidNoasBaseUrl(noasApiUrl)) {
        console.error("Resolved Noas API base URL is invalid");
        return { success: false, errorCode: "invalid_url" };
      }

      const noasClient = new NoasClient(noasApiUrl);
      const signInResponse = await noasClient.signIn(username, password);

      if (!signInResponse.success || !signInResponse.encryptedPrivateKey || !signInResponse.publicKey) {
        console.error("Noas sign-in failed:", signInResponse.error);
        return {
          success: false,
          errorCode: signInResponse.errorCode || "server_error",
          errorMessage: signInResponse.error,
          httpStatus: signInResponse.httpStatus,
        };
      }

      let decryptedPrivateKey: string;
      let signer: NDKPrivateKeySigner | null = null;
      try {
        decryptedPrivateKey = await noasClient.decryptPrivateKey(signInResponse.encryptedPrivateKey, password);
        const nsecKey = privateKeyHexToNsec(decryptedPrivateKey);
        signer = new NDKPrivateKeySigner(nsecKey);
      } catch (decryptionError) {
        console.error('Failed to decrypt private key:', decryptionError);
        setIsAuthenticating(false);
        return { success: false, errorCode: "decryption_failed" };
      }

      if (!signer) {
        console.error('Signer was not created during decryption');
        setIsAuthenticating(false);
        return { success: false, errorCode: "decryption_failed" };
      }

      const ndkUser = await signer.user();
      if (ndkUser.pubkey.toLowerCase() !== signInResponse.publicKey.toLowerCase()) {
        console.error("Noas sign-in key mismatch: decrypted signer pubkey does not match server response", {
          username,
          signerPubkey: ndkUser.pubkey,
          responsePubkey: signInResponse.publicKey,
        });
        return { success: false, errorCode: "key_mismatch" };
      }
      const trustBrowser = config?.trustBrowser ?? false;
      const passwordHash = hashNoasPassword(password);
      sessionPasswordHashRef.current = passwordHash;
      const noasRelayUrls = resolveNoasAuthRelayUrls(signInResponse);
      ndkUser.profile = {
        name: username,
        displayName: username,
        picture: `${noasApiUrl}/picture/${ndkUser.pubkey}`,
      };
      applyAuthenticatedState(ndk, signer, ndkUser, "noas");
      clearTransientAuthState();
      persistNoasSession({
        privateKey: trustBrowser
          ? (signer.privateKey || privateKeyHexToNsec(decryptedPrivateKey))
          : signInResponse.encryptedPrivateKey,
        apiBaseUrl: noasApiUrl,
        username,
        passwordHash: trustBrowser ? passwordHash : undefined,
        relayUrls: noasRelayUrls,
      });
      connectResolvedAuthRelayUrls(noasRelayUrls);
      retryNip42RelaysAfterSignIn();
      showLoginSuccessToast({
        authMethod: "noas",
        noasUsername: username,
        noasApiBaseUrl: noasApiUrl,
        noasMode: "signin",
      });
      return { success: true };
    } catch (error) {
      console.error("Noas login failed:", error);
      return { success: false, errorCode: "connection_failed" };
    } finally {
      setIsAuthenticating(false);
    }
  }, [applyAuthenticatedState, clearTransientAuthState, configuredDefaultNoasHostUrl, connectResolvedAuthRelayUrls, ndk, persistNoasSession, retryNip42RelaysAfterSignIn, sessionPasswordHashRef, setIsAuthenticating]);

  const signupWithNoas = useCallback(async (
    username: string,
    password: string,
    privateKey: string,
    pubkey: string,
    config?: { baseUrl?: string; email?: string }
  ): Promise<NoasAuthResult> => {
    if (!ndk) return { success: false, errorCode: "server_error" };

    const submittedNoasBaseUrl = normalizeNoasBaseUrl(config?.baseUrl || configuredDefaultNoasHostUrl || "");

    if (!submittedNoasBaseUrl) {
      console.error("Noas configuration missing");
      return { success: false, errorCode: "missing_config" };
    }

    if (!isValidNoasBaseUrl(submittedNoasBaseUrl)) {
      console.error("Invalid Noas base URL");
      return { success: false, errorCode: "invalid_url" };
    }

    setIsAuthenticating(true);
    try {
      const noasApiUrl = await resolveNoasApiBaseUrl(submittedNoasBaseUrl);

      if (!isValidNoasBaseUrl(noasApiUrl)) {
        console.error("Resolved Noas API base URL is invalid");
        return { success: false, errorCode: "invalid_url" };
      }

      const noasClient = new NoasClient(noasApiUrl);

      let nsecKey: string;
      try {
        if (privateKey.startsWith('nsec1')) {
          nsecKey = privateKey;
        } else if (/^[a-f0-9]{64}$/i.test(privateKey)) {
          nsecKey = privateKeyHexToNsec(privateKey);
        } else {
          setIsAuthenticating(false);
          console.error("Invalid private key format");
          return { success: false, errorCode: "server_error" };
        }
      } catch (error) {
        console.error("Failed to normalize private key:", error);
        setIsAuthenticating(false);
        return { success: false, errorCode: "server_error" };
      }

      const signUpResponse = await noasClient.register(
        username,
        password,
        nsecKey,
        pubkey,
        {
          ...buildNoasSignupOptions(
            relays
              .filter((relay) => relay.status === "connected" || relay.status === "read-only")
              .map((relay) => relay.url),
            typeof window !== "undefined" ? window.location.origin : undefined
          ),
          email: config?.email,
        }
      );

      if (!signUpResponse.success || !signUpResponse.user) {
        console.error("Noas sign-up failed:", signUpResponse.error);
        setIsAuthenticating(false);
        return {
          success: false,
          errorCode: signUpResponse.errorCode || "server_error",
          errorMessage: signUpResponse.error,
          httpStatus: signUpResponse.httpStatus,
        };
      }

      if (signUpResponse.status !== "active") {
        return {
          success: false,
          registrationSucceeded: true,
          status: signUpResponse.status,
          message: signUpResponse.message,
        };
      }

      let signer: NDKPrivateKeySigner | null = null;
      try {
        signer = new NDKPrivateKeySigner(nsecKey);
      } catch (error) {
        console.error('Failed to create signer:', error);
        setIsAuthenticating(false);
        return { success: false, errorCode: "server_error" };
      }

      if (!signer) {
        console.error('Signer was not created');
        setIsAuthenticating(false);
        return { success: false, errorCode: "server_error" };
      }

      const noasUser = new NDKUser({ pubkey });
      const noasRelayUrls = resolveNoasAuthRelayUrls(signUpResponse);
      noasUser.profile = {
        name: username,
        displayName: username,
        picture: `${noasApiUrl}/picture/${pubkey}`,
      };
      applyAuthenticatedState(ndk, signer, noasUser, "noas");
      clearTransientAuthState();
      persistNoasSession({
        privateKey: nsecKey,
        apiBaseUrl: noasApiUrl,
        username,
        passwordHash: hashNoasPassword(password),
        relayUrls: noasRelayUrls,
      });
      connectResolvedAuthRelayUrls(noasRelayUrls);
      retryNip42RelaysAfterSignIn();
      showLoginSuccessToast({
        authMethod: "noas",
        noasUsername: username,
        noasApiBaseUrl: noasApiUrl,
        noasMode: "signup",
      });
      return {
        success: true,
        registrationSucceeded: true,
        status: signUpResponse.status,
        message: signUpResponse.message,
        relays: signUpResponse.relays,
      };
    } catch (error) {
      console.error("Noas sign-up failed:", error);
      return { success: false, errorCode: "connection_failed" };
    } finally {
      setIsAuthenticating(false);
    }
  }, [applyAuthenticatedState, clearTransientAuthState, configuredDefaultNoasHostUrl, connectResolvedAuthRelayUrls, ndk, persistNoasSession, relays, retryNip42RelaysAfterSignIn, setIsAuthenticating]);

  const updateNoasProfilePicture = useCallback(async (file: File): Promise<NoasPictureUploadResult> => {
    if (authMethod !== "noas" || !user) {
      return { error: "Not signed in with Noas" };
    }

    const noasSession = loadSessionNoasState();
    const passwordHash = sessionPasswordHashRef.current || noasSession?.passwordHash;
    if (!passwordHash || !noasSession) {
      return { error: "Session is locked. Sign in again to upload a picture." };
    }

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          if (!base64Data) { reject(new Error('Failed to read file as base64')); return; }
          resolve(base64Data);
        };
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsDataURL(file);
      });

      const noasClient = new NoasClient(noasSession.apiBaseUrl);
      const result = await noasClient.updateProfilePicture(
        noasSession.username,
        passwordHash,
        base64,
        file.type || 'image/png'
      );

      if (!result.success) {
        console.warn("Failed to update Noas profile picture:", result.error);
        const detail = result.error || "Server rejected the upload";
        if (result.httpStatus) {
          return { error: `HTTP ${result.httpStatus}: ${detail}` };
        }
        if (result.networkError) {
          let host = noasSession.apiBaseUrl;
          try { host = new URL(noasSession.apiBaseUrl).host; } catch { /* keep raw */ }
          return { error: `Could not reach ${host} (${detail})` };
        }
        return { error: detail };
      }

      return { url: `${noasSession.apiBaseUrl}/picture/${user.pubkey}?t=${Date.now()}` };
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      const message = error instanceof Error ? error.message : "Network error uploading profile picture";
      let host = noasSession.apiBaseUrl;
      try { host = new URL(noasSession.apiBaseUrl).host; } catch { /* keep raw */ }
      return { error: `Could not reach ${host} (${message})` };
    }
  }, [authMethod, sessionPasswordHashRef, user]);

  const unlockNoasSession = useCallback(async (password: string): Promise<boolean> => {
    const encryptedKey = lockedNoasKeyRef.current;
    if (!encryptedKey || !ndk) return false;

    const noasSession = loadSessionNoasState();
    if (!noasSession) return false;

    try {
      const noasClient = new NoasClient(noasSession.apiBaseUrl);
      const decryptedKey = await noasClient.decryptPrivateKey(encryptedKey, password);
      const nsecKey = privateKeyHexToNsec(decryptedKey);
      const signer = new NDKPrivateKeySigner(nsecKey);
      const ndkUser = await signer.user();

      ndkUser.profile = {
        name: noasSession.username,
        displayName: noasSession.username,
        picture: `${noasSession.apiBaseUrl}/picture/${ndkUser.pubkey}`,
      };

      applyAuthenticatedState(ndk, signer, ndkUser, "noas");
      sessionPasswordHashRef.current = hashNoasPassword(password);
      setIsSessionLocked(false);
      setLockedNoasUsername(null);
      lockedNoasKeyRef.current = null;

      connectResolvedAuthRelayUrls(noasSession.relayUrls || []);
      retryNip42RelaysAfterSignIn();

      return true;
    } catch (error) {
      console.error("Failed to unlock Noas session:", error);
      return false;
    }
  }, [applyAuthenticatedState, connectResolvedAuthRelayUrls, lockedNoasKeyRef, ndk, retryNip42RelaysAfterSignIn, sessionPasswordHashRef, setIsSessionLocked, setLockedNoasUsername]);

  return {
    loginWithNoas,
    signupWithNoas,
    updateNoasProfilePicture,
    unlockNoasSession,
  };
}
