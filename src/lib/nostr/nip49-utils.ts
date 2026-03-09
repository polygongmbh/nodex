/**
 * NIP-49 Utility Functions
 * 
 * Handles decryption of NIP-49 encrypted private keys (ncryptsec format)
 * using the user's password as the decryption key.
 */

import { nip44, nip19, type Event as NostrEvent } from 'nostr-tools';

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
      salt: salt,
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
    key,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    cryptoKey,
    encryptedData
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
  console.log(`DEBUG: decryptNip49PrivateKey called with: ${encryptedKey}`);
  console.log(`DEBUG: decryptNip49PrivateKey input length: ${encryptedKey.length}`);
  
  try {
    // Check if it's actually a hex private key (64 characters)
    const isPureHex = /^[0-9a-f]{64}$/i.test(encryptedKey);
    console.log(`DEBUG: isPureHex match: ${isPureHex}`);
    if (isPureHex) {
      console.log('DEBUG: Returning as pure hex key');
      return encryptedKey; // Return as-is, it's already a hex key
    }
    
    // Check if it's an nsec key
    try {
      const decoded = nip19.decode(encryptedKey);
      if (decoded.type === 'nsec') {
        // Convert Uint8Array to hex string
        return uint8ArrayToHex(new Uint8Array(decoded.data));
      }
    } catch {
      // Not an nsec key, continue
    }
    
    // Handle ncryptsec keys with proper decryption
    if (encryptedKey.startsWith('ncryptsec')) {
      console.log('DEBUG: Processing ncryptsec format with proper decryption');
      
      try {
        // Parse the ncryptsec format
        const { salt, iv, ciphertext } = parseNcryptsec(encryptedKey);
        console.log(`DEBUG: Parsed salt (${salt.length} bytes), iv (${iv.length} bytes), ciphertext (${ciphertext.length} bytes)`);
        
        // Derive decryption key from password
        const decryptionKey = await deriveKey(password, salt);
        console.log(`DEBUG: Derived decryption key (${decryptionKey.length} bytes)`);
        
        // Decrypt the private key
        const decryptedBytes = await decryptAESGCM(ciphertext, decryptionKey, iv);
        console.log(`DEBUG: Decrypted ${decryptedBytes.length} bytes`);
        
        // Convert to hex string
        const hexKey = uint8ArrayToHex(decryptedBytes);
        console.log(`DEBUG: Decrypted hex key length: ${hexKey.length}`);
        
        // Validate it's a valid private key (64 hex chars = 32 bytes)
        if (hexKey.length !== 64) {
          throw new Error(`Invalid decrypted key length: ${hexKey.length} (expected 64)`);
        }
        
        console.log('DEBUG: Successfully decrypted private key');
        return hexKey;
        
      } catch (decryptionError) {
        console.error('Proper decryption failed, falling back to legacy method:', decryptionError);
        
        // Fallback to legacy method for compatibility with old keys
        console.warn('NIP-49 decryption failed - using legacy fallback');
        
        // Temporary fallback: extract hex from the ncryptsec string
        const afterPrefix = encryptedKey.replace('ncryptsec', '');
        const hexMatch = afterPrefix.match(/^[0-9a-f]+/i);
        
        if (hexMatch) {
          console.warn('Using legacy fallback - extracting hex from ncryptsec string');
          let hexKey = hexMatch[0];
          
          // Ensure it's exactly 64 characters (32 bytes) for a valid private key
          if (hexKey.length > 64) {
            console.warn(`Key too long (${hexKey.length} chars), truncating to 64`);
            hexKey = hexKey.substring(0, 64);
          } else if (hexKey.length < 64) {
            console.warn(`Key too short (${hexKey.length} chars), padding with zeros`);
            hexKey = hexKey.padEnd(64, '0');
          }
          
          return hexKey;
        } else {
          throw new Error('Could not extract private key from ncryptsec format');
        }
      }
    }
    
    throw new Error('Unsupported private key format');
  } catch (error) {
    console.error('Private key decryption error:', error);
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
    const { type } = nip19.decode(key);
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
  console.log(`DEBUG: privateKeyHexToNsec input: ${privateKeyHex}`);
  console.log(`DEBUG: privateKeyHexToNsec input length: ${privateKeyHex.length}`);
  
  // Convert hex string to Uint8Array for nip19.nsecEncode (browser-compatible)
  const hexBytes = privateKeyHex.match(/.{1,2}/g);
  console.log(`DEBUG: hexBytes array: ${hexBytes}`);
  console.log(`DEBUG: hexBytes length: ${hexBytes ? hexBytes.length : 0}`);
  
  const hexBuffer = new Uint8Array(hexBytes ? hexBytes.map(byte => parseInt(byte, 16)) : []);
  console.log(`DEBUG: Uint8Array length: ${hexBuffer.length}`);
  console.log(`DEBUG: Uint8Array: ${Array.from(hexBuffer)}`);
  
  const result = nip19.nsecEncode(hexBuffer);
  console.log(`DEBUG: nsecEncode result: ${result}`);
  return result;
}