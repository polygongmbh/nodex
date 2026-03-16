/**
 * Noas API Client
 * Handles communication with the Noas authentication server
 */

import { nip19 } from 'nostr-tools';
import { decryptNip49PrivateKey, isNip49EncryptedKey } from './nip49-utils';

interface NoasSignInResponse {
  success: boolean;
  encryptedPrivateKey?: string;
  publicKey?: string;
  relays?: string[];
  error?: string;
}

interface NoasRegisterResponse {
  success: boolean;
  user?: {
    username: string;
    publicKey: string;
  };
  error?: string;
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
  private nip05Domain: string;

  constructor(baseUrl: string, nip05Domain: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.nip05Domain = nip05Domain;
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
        };
      }

      return await response.json();
    } catch (error) {
      console.error('Noas sign-in error:', error);
      return {
        success: false,
        error: 'Network error during sign in',
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
        };
      }

      return await response.json();
    } catch (error) {
      console.error('Noas registration error:', error);
      return {
        success: false,
        error: 'Network error during registration',
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
    return `${username}@${this.nip05Domain}`;
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
