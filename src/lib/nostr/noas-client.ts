/**
 * Noas API Client
 * Handles communication with the Noas authentication server
 */

import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { nip19 } from 'nostr-tools';
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import * as nip49 from 'nostr-tools/nip49';
import { decryptNip49PrivateKey, isNip49EncryptedKey } from './nip49-utils';

export type NoasAuthErrorCode =
  | "invalid_credentials"
  | "connection_failed"
  | "invalid_url"
  | "server_error"
  | "missing_config"
  | "decryption_failed"
  | "key_mismatch";

export interface NoasAuthResult {
  success: boolean;
  registrationSucceeded?: boolean;
  status?: string;
  message?: string;
  errorCode?: NoasAuthErrorCode;
  errorMessage?: string;
  httpStatus?: number;
}

const NOAS_API_BASE_CACHE_PREFIX = "nostr_noas_api_base_cache";
const NOAS_API_BASE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface NoasDiscoveryDocument {
  noas?: {
    api_base?: unknown;
  };
}

interface NoasApiBaseCacheEntry {
  apiBaseUrl: string;
  cachedAt: number;
}

interface NoasDiscoveryResult {
  discoveryOrigin: string;
  discoveredApiBaseUrl: string;
}

function resolveDiscoveredNoasApiBaseUrl(discoveryOrigin: string, rawApiBase: unknown): string {
  if (typeof rawApiBase !== "string") return "";

  const trimmed = rawApiBase.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("/")) {
    return normalizeNoasBaseUrl(`${discoveryOrigin}${trimmed}`);
  }

  return normalizeNoasBaseUrl(trimmed);
}

function resolveFallbackNoasApiBaseUrl(rawValue: string): string {
  const normalized = normalizeNoasBaseUrl(rawValue);
  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    const rawPath = parsed.pathname.replace(/\/+$/, "");
    const lowerPath = rawPath.toLowerCase();
    const looksLikeEndpointPath = [
      "/signin",
      "/register",
      "/auth/signin",
      "/auth/register",
      "/picture",
      "/health",
    ].some((candidate) => lowerPath.endsWith(candidate));

    let apiPath = rawPath;
    if (!apiPath || apiPath === "/") {
      apiPath = "/api/v1";
    } else if (lowerPath.endsWith("/api/v1")) {
      apiPath = rawPath;
    } else if (looksLikeEndpointPath) {
      apiPath = "/api/v1";
    } else {
      apiPath = `${rawPath}/api/v1`;
    }

    parsed.pathname = apiPath.replace(/\/{2,}/g, "/");
    parsed.search = "";
    parsed.hash = "";
    return normalizeNoasBaseUrl(parsed.toString());
  } catch {
    return normalized;
  }
}

export function normalizeNoasBaseUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  return withProtocol.replace(/\/+$/, "");
}

export function isValidNoasBaseUrl(rawValue: string): boolean {
  const normalized = normalizeNoasBaseUrl(rawValue);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function resolveNoasDiscoveryOrigin(rawValue: string): string {
  const normalized = normalizeNoasBaseUrl(rawValue);
  if (!normalized) return "";

  try {
    return new URL(normalized).origin;
  } catch {
    return "";
  }
}

function getNoasApiBaseCacheKey(rawValue: string): string {
  return `${NOAS_API_BASE_CACHE_PREFIX}:${resolveNoasDiscoveryOrigin(rawValue)}`;
}

function loadCachedNoasApiBaseUrl(rawValue: string): string {
  if (typeof window === "undefined" || !window.localStorage) return "";

  const cacheKey = getNoasApiBaseCacheKey(rawValue);
  if (!cacheKey.endsWith(":")) {
    try {
      const rawEntry = window.localStorage.getItem(cacheKey);
      if (!rawEntry) return "";

      const parsed = JSON.parse(rawEntry) as Partial<NoasApiBaseCacheEntry>;
      if (typeof parsed.apiBaseUrl !== "string" || typeof parsed.cachedAt !== "number") return "";
      if (Date.now() - parsed.cachedAt > NOAS_API_BASE_CACHE_TTL_MS) return "";

      const normalizedApiBaseUrl = normalizeNoasBaseUrl(parsed.apiBaseUrl);
      return isValidNoasBaseUrl(normalizedApiBaseUrl) ? normalizedApiBaseUrl : "";
    } catch {
      return "";
    }
  }

  return "";
}

function cacheNoasApiBaseUrl(rawValue: string, apiBaseUrl: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  const cacheKey = getNoasApiBaseCacheKey(rawValue);
  if (!cacheKey.endsWith(":")) {
    safeLocalStorageSetItem(
      cacheKey,
      JSON.stringify({
        apiBaseUrl,
        cachedAt: Date.now(),
      } satisfies NoasApiBaseCacheEntry),
      {
        context: "noas-api-base-discovery",
      }
    );
  }
}

export async function discoverNoasApiBaseUrl(rawValue: string): Promise<NoasDiscoveryResult | null> {
  const normalizedBaseUrl = normalizeNoasBaseUrl(rawValue);
  if (!normalizedBaseUrl || !isValidNoasBaseUrl(normalizedBaseUrl)) return null;

  const cachedApiBaseUrl = loadCachedNoasApiBaseUrl(normalizedBaseUrl);
  const discoveryOrigin = resolveNoasDiscoveryOrigin(normalizedBaseUrl);
  if (!discoveryOrigin) return null;

  if (cachedApiBaseUrl) {
    nostrDevLog("noas", "Using cached NoaS API base URL", {
      submittedBaseUrl: normalizedBaseUrl,
      apiBaseUrl: cachedApiBaseUrl,
    });
    return {
      discoveryOrigin,
      discoveredApiBaseUrl: cachedApiBaseUrl,
    };
  }

  const response = await fetch(`${discoveryOrigin}/.well-known/nostr.json`, {
    headers: {
      Accept: "application/nostr+json, application/json",
    },
  });

  if (!response.ok) {
    nostrDevLog("noas", "NoaS API base discovery returned a non-OK response", {
      submittedBaseUrl: normalizedBaseUrl,
      discoveryOrigin,
      status: response.status,
    });
    return null;
  }

  const discoveryDocument = await response.json() as NoasDiscoveryDocument;
  const discoveredApiBaseUrl = resolveDiscoveredNoasApiBaseUrl(
    discoveryOrigin,
    discoveryDocument.noas?.api_base
  );

  if (!isValidNoasBaseUrl(discoveredApiBaseUrl)) {
    nostrDevLog("noas", "NoaS API base discovery missing a valid api_base entry", {
      submittedBaseUrl: normalizedBaseUrl,
      discoveryOrigin,
      discoveredApiBase: discoveryDocument.noas?.api_base,
    });
    return null;
  }

  cacheNoasApiBaseUrl(normalizedBaseUrl, discoveredApiBaseUrl);
  nostrDevLog("noas", "Discovered NoaS API base URL", {
    submittedBaseUrl: normalizedBaseUrl,
    discoveryOrigin,
    apiBaseUrl: discoveredApiBaseUrl,
  });
  return {
    discoveryOrigin,
    discoveredApiBaseUrl,
  };
}

export async function resolveNoasApiBaseUrl(rawValue: string): Promise<string> {
  const normalizedBaseUrl = normalizeNoasBaseUrl(rawValue);
  if (!normalizedBaseUrl || !isValidNoasBaseUrl(normalizedBaseUrl)) return normalizedBaseUrl;
  const fallbackApiBaseUrl = resolveFallbackNoasApiBaseUrl(normalizedBaseUrl);

  try {
    const discovery = await discoverNoasApiBaseUrl(normalizedBaseUrl);
    if (discovery) {
      return discovery.discoveredApiBaseUrl;
    }
    return fallbackApiBaseUrl;
  } catch (error) {
    const discoveryOrigin = resolveNoasDiscoveryOrigin(normalizedBaseUrl);
    nostrDevLog("noas", "NoaS API base discovery failed, falling back to submitted host", {
      submittedBaseUrl: normalizedBaseUrl,
      fallbackApiBaseUrl,
      discoveryOrigin,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackApiBaseUrl;
  }
}

interface NoasSignInResponse {
  success: boolean;
  encryptedPrivateKey?: string;
  publicKey?: string;
  relays?: string[];
  error?: string;
  errorCode?: NoasAuthErrorCode;
  httpStatus?: number;
}

interface NoasRegisterResponse {
  success: boolean;
  user?: {
    username: string;
    publicKey: string;
  };
  status?: string;
  nip05?: string;
  message?: string;
  public_key?: string;
  public_npub?: string;
  error?: string;
  errorCode?: NoasAuthErrorCode;
  httpStatus?: number;
}

interface NoasUserProfile {
  username: string;
  publicKey: string;
  encryptedPrivateKey?: string;
  relays?: string[];
  profilePicture?: string;
  profilePictureType?: string;
}

function hexToBytes(hexValue: string): Uint8Array {
  const normalized = hexValue.trim();
  if (!/^[a-f0-9]{64}$/i.test(normalized)) {
    throw new Error("Private key must be a 64-character hex string or nsec");
  }

  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function decodePrivateKeyToBytes(privateKey: string): Uint8Array {
  const normalized = String(privateKey || "").trim();
  if (!normalized) {
    throw new Error("Private key is required");
  }

  if (/^[a-f0-9]{64}$/i.test(normalized)) {
    return hexToBytes(normalized);
  }

  const decoded = nip19.decode(normalized);
  if (decoded.type === "nsec" && decoded.data instanceof Uint8Array) {
    return decoded.data;
  }

  throw new Error("Private key must be a valid nsec or 64-character hex key");
}

function hashNoasPassword(password: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(password)));
}

function resolveRegisterRedirect(redirect?: string): string | undefined {
  const providedRedirect = String(redirect || "").trim();
  if (providedRedirect) {
    return providedRedirect;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return undefined;
}

function normalizeResponsePublicKey(publicKeyRaw: unknown): string | undefined {
  if (typeof publicKeyRaw !== "string") return undefined;
  const normalized = publicKeyRaw.trim();
  if (!normalized) return undefined;

  if (/^[a-f0-9]{64}$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  if (normalized.startsWith("npub1")) {
    try {
      const decoded = nip19.decode(normalized);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return decoded.data.toLowerCase();
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function normalizeEncryptedPrivateKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeRelayList(relaysRaw: unknown): string[] | undefined {
  if (!Array.isArray(relaysRaw)) return undefined;
  const relays = relaysRaw
    .filter((relay): relay is string => typeof relay === "string")
    .map((relay) => relay.trim())
    .filter(Boolean);
  return relays.length ? relays : undefined;
}

export class NoasClient {
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = normalizeNoasBaseUrl(apiBaseUrl);
  }

  private buildApiUrl(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.apiBaseUrl}${normalizedPath}`;
  }

  /**
   * Sign in with username and password
   */
  async signIn(username: string, password: string): Promise<NoasSignInResponse> {
    try {
      const response = await fetch(this.buildApiUrl("/auth/signin"), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: typeof errorData.error === "string" ? errorData.error : undefined,
          errorCode: response.status === 401 || response.status === 403 ? "invalid_credentials" : "server_error",
          httpStatus: response.status,
        };
      }

      const responseData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const userFromResponse = responseData.user as Record<string, unknown> | undefined;
      const publicKey = normalizeResponsePublicKey(responseData.publicKey)
        || normalizeResponsePublicKey(responseData.public_key)
        || normalizeResponsePublicKey(responseData.public_npub)
        || normalizeResponsePublicKey(userFromResponse?.publicKey)
        || normalizeResponsePublicKey(userFromResponse?.public_key)
        || normalizeResponsePublicKey(userFromResponse?.public_npub);
      const encryptedPrivateKey = normalizeEncryptedPrivateKey(responseData.encryptedPrivateKey)
        || normalizeEncryptedPrivateKey(responseData.encrypted_private_key)
        || normalizeEncryptedPrivateKey(userFromResponse?.encryptedPrivateKey)
        || normalizeEncryptedPrivateKey(userFromResponse?.encrypted_private_key);
      const relays = normalizeRelayList(responseData.relays) || normalizeRelayList(userFromResponse?.relays);
      const errorMessage = typeof responseData.error === "string"
        ? responseData.error
        : typeof responseData.message === "string"
          ? responseData.message
          : undefined;

      return {
        success: responseData.success === false ? false : true,
        publicKey,
        encryptedPrivateKey,
        relays,
        error: errorMessage,
      };
    } catch (error) {
      console.error('Noas sign-in error:', error);
      return {
        success: false,
        errorCode: "connection_failed",
      };
    }
  }

  /**
   * Register a new user
   */
  async register(
    username: string,
    password: string,
    privateKey: string,
    pubkey: string,
    options?: { redirect?: string }
  ): Promise<NoasRegisterResponse> {
    try {
      const privateKeyBytes = decodePrivateKeyToBytes(privateKey);
      const payload: Record<string, string> = {
        username,
        password_hash: hashNoasPassword(password),
        public_key: pubkey,
        private_key_encrypted: await nip49.encrypt(privateKeyBytes, password),
      };
      const redirect = resolveRegisterRedirect(options?.redirect);
      if (redirect) {
        payload.redirect = redirect;
      }

      const response = await fetch(this.buildApiUrl("/auth/register"), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: typeof errorData.error === "string" ? errorData.error : undefined,
          errorCode: response.status === 400 ? "invalid_credentials" : "server_error",
          httpStatus: response.status,
        };
      }

      const responseData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const responsePublicKey = normalizeResponsePublicKey(responseData.public_key)
        || normalizeResponsePublicKey(responseData.public_npub)
        || normalizeResponsePublicKey(pubkey)
        || pubkey;
      const userFromResponse = responseData.user as { username?: unknown; publicKey?: unknown } | undefined;
      const responseUsername = typeof userFromResponse?.username === "string" && userFromResponse.username.trim()
        ? userFromResponse.username
        : username;
      const userPublicKey = normalizeResponsePublicKey(userFromResponse?.publicKey) || responsePublicKey;

      return {
        success: responseData.success === false ? false : true,
        user: {
          username: responseUsername,
          publicKey: userPublicKey,
        },
        status: typeof responseData.status === "string" ? responseData.status : undefined,
        nip05: typeof responseData.nip05 === "string" ? responseData.nip05 : undefined,
        message: typeof responseData.message === "string" ? responseData.message : undefined,
        public_key: typeof responseData.public_key === "string" ? responseData.public_key : undefined,
        public_npub: typeof responseData.public_npub === "string" ? responseData.public_npub : undefined,
      };
    } catch (error) {
      console.error('Noas registration error:', error);
      return {
        success: false,
        errorCode: "connection_failed",
      };
    }
  }

  /**
   * Get user profile picture
   */
  async getProfilePicture(publicKey: string): Promise<{ 
    profilePicture?: Uint8Array; 
    profilePictureType?: string; 
    error?: string; 
  }> {
    try {
      const response = await fetch(this.buildApiUrl(`/picture/${publicKey}`), {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return {}; // No profile picture
        }
        const errorData = await response.json().catch(() => ({}));
        return {
          error: errorData.error || 'Failed to fetch profile picture',
        };
      }

      const contentType = response.headers.get('Content-Type') || 'image/png';
      const imageData = await response.arrayBuffer();

      return {
        profilePicture: new Uint8Array(imageData),
        profilePictureType: contentType,
      };
    } catch (error) {
      console.error('Profile picture fetch error:', error);
      return {
        error: 'Network error fetching profile picture',
      };
    }
  }

  /**
   * Check if Noas server is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/health"), {
        method: 'GET',
        credentials: 'include',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract public key from npub format
   */
  static npubToHex(npub: string): string {
    try {
      const decoded = nip19.decode(npub);
      if (decoded.type === 'npub') {
        return decoded.data;
      }
      return npub; // Return original if not npub format
    } catch (error) {
      return npub; // Return original if decoding fails
    }
  }

  /**
   * Decrypt a NIP-49 encrypted private key using the user's password
   * @param encryptedKey NIP-49 encrypted key (ncryptsec format)
   * @param password User's password for decryption
   * @returns Promise<string> Decrypted private key in nsec format
   */
  async decryptPrivateKey(encryptedKey: string, password: string): Promise<string> {
    // Standard encrypted formats.
    if (encryptedKey.startsWith('ncryptsec') || isNip49EncryptedKey(encryptedKey)) {
      return decryptNip49PrivateKey(encryptedKey, password);
    }

    // Raw hex private key.
    if (/^[0-9a-f]{64}$/i.test(encryptedKey)) {
      return encryptedKey.toLowerCase();
    }

    // Raw nsec private key.
    try {
      const decoded = nip19.decode(encryptedKey);
      if (decoded.type === 'nsec') {
        return Array.from(new Uint8Array(decoded.data))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      }
    } catch {
      // Ignore and throw below.
    }

    try {
      return await decryptNip49PrivateKey(encryptedKey, password);
    } catch (error) {
      console.error('Private key decryption failed:', error);
      throw new Error(`Could not decrypt private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
