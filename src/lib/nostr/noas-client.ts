/**
 * Noas API Client
 * Handles communication with the Noas authentication server
 */

import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { nip19 } from 'nostr-tools';
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
  errorCode?: NoasAuthErrorCode;
  errorMessage?: string;
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

export async function resolveNoasApiBaseUrl(rawValue: string): Promise<string> {
  const normalizedBaseUrl = normalizeNoasBaseUrl(rawValue);
  if (!normalizedBaseUrl || !isValidNoasBaseUrl(normalizedBaseUrl)) return normalizedBaseUrl;

  const cachedApiBaseUrl = loadCachedNoasApiBaseUrl(normalizedBaseUrl);
  if (cachedApiBaseUrl) {
    nostrDevLog("noas", "Using cached NoaS API base URL", {
      submittedBaseUrl: normalizedBaseUrl,
      apiBaseUrl: cachedApiBaseUrl,
    });
    return cachedApiBaseUrl;
  }

  const discoveryOrigin = resolveNoasDiscoveryOrigin(normalizedBaseUrl);
  if (!discoveryOrigin) return normalizedBaseUrl;

  try {
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
      return normalizedBaseUrl;
    }

    const discoveryDocument = await response.json() as NoasDiscoveryDocument;
    const discoveredApiBaseUrl = typeof discoveryDocument.noas?.api_base === "string"
      ? normalizeNoasBaseUrl(discoveryDocument.noas.api_base)
      : "";

    if (!isValidNoasBaseUrl(discoveredApiBaseUrl)) {
      nostrDevLog("noas", "NoaS API base discovery missing a valid api_base entry", {
        submittedBaseUrl: normalizedBaseUrl,
        discoveryOrigin,
      });
      return normalizedBaseUrl;
    }

    cacheNoasApiBaseUrl(normalizedBaseUrl, discoveredApiBaseUrl);
    nostrDevLog("noas", "Discovered NoaS API base URL", {
      submittedBaseUrl: normalizedBaseUrl,
      discoveryOrigin,
      apiBaseUrl: discoveredApiBaseUrl,
    });
    return discoveredApiBaseUrl;
  } catch (error) {
    nostrDevLog("noas", "NoaS API base discovery failed, falling back to submitted host", {
      submittedBaseUrl: normalizedBaseUrl,
      discoveryOrigin,
      error: error instanceof Error ? error.message : String(error),
    });
    return normalizedBaseUrl;
  }
}

interface NoasSignInResponse {
  success: boolean;
  encryptedPrivateKey?: string;
  publicKey?: string;
  relays?: string[];
  error?: string;
  errorCode?: NoasAuthErrorCode;
}

interface NoasRegisterResponse {
  success: boolean;
  user?: {
    username: string;
    publicKey: string;
  };
  error?: string;
  errorCode?: NoasAuthErrorCode;
}

interface NoasUserProfile {
  username: string;
  publicKey: string;
  encryptedPrivateKey?: string;
  relays?: string[];
  profilePicture?: string;
  profilePictureType?: string;
}

export class NoasClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  /**
   * Sign in with username and password
   */
  async signIn(username: string, password: string): Promise<NoasSignInResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/signin`, {
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
          error: errorData.error || 'Sign in failed',
          errorCode: response.status === 401 || response.status === 403 ? "invalid_credentials" : "server_error",
        };
      }

      return await response.json();
    } catch (error) {
      console.error('Noas sign-in error:', error);
      return {
        success: false,
        error: 'Network error during sign in',
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
    nsecKey: string,
    pubkey: string,
    relays: string[] = []
  ): Promise<NoasRegisterResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          nsecKey,
          pubkey,
          relays,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || 'Registration failed',
          errorCode: response.status === 400 ? "invalid_credentials" : "server_error",
        };
      }

      return await response.json();
    } catch (error) {
      console.error('Noas registration error:', error);
      return {
        success: false,
        error: 'Network error during registration',
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
      const response = await fetch(`${this.baseUrl}/picture/${publicKey}`, {
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
   * Get NIP-05 verification data
   */
  async getNip05Verification(username: string): Promise<{
    names?: Record<string, string>;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/.well-known/nostr.json?name=${encodeURIComponent(username)}`
      );

      if (!response.ok) {
        return {
          error: 'NIP-05 verification failed',
        };
      }

      return await response.json();
    } catch (error) {
      console.error('NIP-05 verification error:', error);
      return {
        error: 'Network error during NIP-05 verification',
      };
    }
  }

  /**
   * Check if Noas server is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        credentials: 'include',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate NIP-05 identifier for a username
   */
  getNip05Identifier(username: string): string {
    try {
      return `${username}@${new URL(this.baseUrl).hostname}`;
    } catch {
      return username;
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
