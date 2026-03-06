/**
 * NIP-49 Utility Functions
 * 
 * Handles decryption of NIP-49 encrypted private keys (ncryptsec format)
 * using the user's password as the decryption key.
 */

import { nip44, nip19, type Event as NostrEvent } from 'nostr-tools';

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
    // Current NOAS implementation stores keys as-is without actual encryption
    // This is a temporary solution until proper NIP-49 encryption is implemented
    
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
        return decoded.data; // Return the hex version
      }
    } catch {
      // Not an nsec key, continue
    }
    
    // For ncryptsec keys (future implementation when NOAS properly encrypts keys)
    // This is a placeholder for when actual NIP-49 encryption is implemented
    if (encryptedKey.startsWith('ncryptsec')) {
      console.warn('NIP-49 decryption not yet implemented - using fallback');
      
      // Temporary fallback: extract hex from the ncryptsec string
      // This is NOT secure and should be replaced with proper decryption
      // Extract only the hex part after "ncryptsec" prefix
      console.log(`DEBUG: Original encrypted key: ${encryptedKey}`);
      const afterPrefix = encryptedKey.replace('ncryptsec', '');
      console.log(`DEBUG: After removing prefix: ${afterPrefix}`);
      const hexMatch = afterPrefix.match(/^[0-9a-f]+/i);
      console.log(`DEBUG: Hex match: ${hexMatch ? hexMatch[0] : 'null'}`);
      
      if (hexMatch) {
        console.warn('Using insecure fallback - extracting hex from ncryptsec string');
        let hexKey = hexMatch[0];
        console.log(`DEBUG: Initial hex key length: ${hexKey.length}`);
        
        // Ensure it's exactly 64 characters (32 bytes) for a valid private key
        if (hexKey.length > 64) {
          console.warn(`Key too long (${hexKey.length} chars), truncating to 64`);
          hexKey = hexKey.substring(0, 64);
        } else if (hexKey.length < 64) {
          console.warn(`Key too short (${hexKey.length} chars), padding with zeros`);
          hexKey = hexKey.padEnd(64, '0');
        }
        
        console.log(`DEBUG: Final hex key length: ${hexKey.length}`);
        console.log(`DEBUG: Final hex key: ${hexKey}`);
        return hexKey;
      } else {
        throw new Error('Could not extract private key from ncryptsec format');
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