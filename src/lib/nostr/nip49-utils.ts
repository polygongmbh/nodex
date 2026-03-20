/**
 * NIP-49 Utility Functions
 * 
 * Handles decryption of NIP-49 encrypted private keys (ncryptsec format)
 * using the user's password as the decryption key.
 */

import { nip44, nip19, type Event as NostrEvent } from 'nostr-tools';
import * as nip49 from 'nostr-tools/nip49';

/**
 * Derive a cryptographic key from password using PBKDF2
 * @param password User's password
 * @param salt Salt for key derivation
 * @param iterations Number of iterations
 * @returns Promise<Uint8Array> Derived key
 */
async function deriveKey(password: string, salt: Uint8Array, iterations: number = 100000): Promise<Uint8Array> {
  // Import the password as a key
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  // Derive a key using PBKDF2
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: iterations,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // Export the derived key
  const exportedKey = await crypto.subtle.exportKey('raw', derivedKey);
  return new Uint8Array(exportedKey);
}

/**
 * Decrypt data using AES-GCM
 * @param encryptedData Encrypted data
 * @param key Decryption key
 * @param iv Initialization vector
 * @returns Promise<Uint8Array> Decrypted data
 */
async function decryptAESGCM(encryptedData: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource
    },
    cryptoKey,
    encryptedData as BufferSource
  );
  
  return new Uint8Array(decrypted);
}

/**
 * Parse NIP-49 ncryptsec format
 * Format: ncryptsec<salt>:<iv>:<ciphertext>
 * @param encryptedKey NIP-49 encrypted key
 * @returns { salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array }
 */
function parseNcryptsec(encryptedKey: string): { salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array } {
  if (!encryptedKey.startsWith('ncryptsec')) {
    throw new Error('Invalid ncryptsec format');
  }
  
  // Remove prefix
  const dataPart = encryptedKey.slice('ncryptsec'.length);
  
  // Split by colons
  const parts = dataPart.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ncryptsec format - expected salt:iv:ciphertext');
  }
  
  return {
    salt: hexToUint8Array(parts[0]),
    iv: hexToUint8Array(parts[1]),
    ciphertext: hexToUint8Array(parts[2])
  };
}

/**
 * Convert hex string to Uint8Array
 * @param hex Hex string
 * @returns Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 * @param bytes Uint8Array
 * @returns Hex string
 */
function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Decrypt a NIP-49 encrypted private key using the user's password
 * @param encryptedKey NIP-49 encrypted key (ncryptsec format)
 * @param password User's password for decryption
 * @returns Promise<string> Decrypted private key in hex format
 * @throws Error if decryption fails
 */
export async function decryptNip49PrivateKey(encryptedKey: string, password: string): Promise<string> {
  try {
    // Already a raw hex private key.
    if (/^[0-9a-f]{64}$/i.test(encryptedKey)) {
      return encryptedKey.toLowerCase();
    }

    // Already an nsec private key.
    try {
      const decoded = nip19.decode(encryptedKey) as any;
      if (decoded.type === 'nsec') {
        return uint8ArrayToHex(new Uint8Array(decoded.data));
      }
    } catch {
      // Ignore and continue to encrypted handling.
    }

    // Legacy custom format: ncryptsec<salt>:<iv>:<ciphertext>
    if (encryptedKey.startsWith('ncryptsec') && encryptedKey.includes(':')) {
      const { salt, iv, ciphertext } = parseNcryptsec(encryptedKey);
      const decryptionKey = await deriveKey(password, salt);
      const decryptedBytes = await decryptAESGCM(ciphertext, decryptionKey, iv);
      const hexKey = uint8ArrayToHex(decryptedBytes);
      if (!/^[0-9a-f]{64}$/i.test(hexKey)) {
        throw new Error(`Invalid decrypted key length: ${hexKey.length} (expected 64)`);
      }
      return hexKey.toLowerCase();
    }

    // Standard NIP-49 format from nostr-tools (bech32 ncryptsec1...).
    if (encryptedKey.startsWith('ncryptsec')) {
      const decrypted: any = await nip49.decrypt(encryptedKey, password);
      if (typeof decrypted === 'string') {
        if (/^[0-9a-f]{64}$/i.test(decrypted)) return decrypted.toLowerCase();
        const maybeNsec = nip19.decode(decrypted) as any;
        if (maybeNsec.type === 'nsec') return uint8ArrayToHex(new Uint8Array(maybeNsec.data));
        throw new Error('NIP-49 decrypt returned unsupported key string format');
      }

      const decryptedBytes =
        decrypted instanceof Uint8Array
          ? decrypted
          : new Uint8Array((decrypted as ArrayBufferView).buffer);
      const hexKey = uint8ArrayToHex(decryptedBytes);
      if (!/^[0-9a-f]{64}$/i.test(hexKey)) {
        throw new Error('NIP-49 decrypt returned invalid key bytes');
      }
      return hexKey.toLowerCase();
    }

    throw new Error('Unsupported private key format');
  } catch (error) {
    throw new Error(`Failed to decrypt private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a key is in NIP-49 encrypted format (ncryptsec)
 * @param key Key to check
 * @returns boolean True if key is NIP-49 encrypted
 */
export function isNip49EncryptedKey(key: string): boolean {
  try {
    const { type } = nip19.decode(key) as any;
    return type === 'ncryptsec';
  } catch {
    return false;
  }
}

/**
 * Convert decrypted private key to nsec format for compatibility
 * @param privateKeyHex Private key in hex format
 * @returns string Private key in nsec format
 */
export function privateKeyHexToNsec(privateKeyHex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(privateKeyHex)) {
    throw new Error('Private key must be a 64-character hex string');
  }

  const hexBytes = privateKeyHex.match(/.{1,2}/g) || [];
  const hexBuffer = new Uint8Array(hexBytes.map((byte) => parseInt(byte, 16)));
  return nip19.nsecEncode(hexBuffer);
}
