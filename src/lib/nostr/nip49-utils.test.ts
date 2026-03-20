import { describe, it, expect } from 'vitest';
import { isNip49EncryptedKey, privateKeyHexToNsec } from './nip49-utils';
import { nip19 } from 'nostr-tools';
import * as nip49 from 'nostr-tools/nip49';

describe('NIP-49 Utility Functions', () => {

  describe('isNip49EncryptedKey', () => {
    it('should return false for non-ncryptsec keys', () => {
      expect(isNip49EncryptedKey('nsec123')).toBe(false);
      expect(isNip49EncryptedKey('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')).toBe(false);
      expect(isNip49EncryptedKey('invalidkey')).toBe(false);
    });

    it('should not throw for ncryptsec-like strings', () => {
      // We can't test the actual ncryptsec decoding without a real key,
      // but we can ensure it doesn't crash
      expect(() => isNip49EncryptedKey('ncryptsec123')).not.toThrow();
    });
  });

  describe('privateKeyHexToNsec', () => {
    it('should convert hex private key to nsec format', () => {
      const hexKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const result = privateKeyHexToNsec(hexKey);
      
      // Should start with 'nsec'
      expect(result).toMatch(/^nsec/);
      
      // Should be a valid bech32 encoded key
      const decoded = nip19.decode(result);
      expect(decoded.type).toBe('nsec');
      // decoded.data is Uint8Array, convert to hex for comparison
      const decodedHex = uint8ArrayToHex(new Uint8Array(decoded.data as any));
      expect(decodedHex).toBe(hexKey);
    });

    it('should handle 64-character hex strings', () => {
      const hexKey = 'a'.repeat(64);
      const result = privateKeyHexToNsec(hexKey);
      expect(result).toMatch(/^nsec/);
      
      // Verify it can be decoded back
      const decoded = nip19.decode(result);
      const decodedHex = uint8ArrayToHex(new Uint8Array(decoded.data));
      expect(decodedHex).toBe(hexKey);
    });

    it('should reject invalid hex length', () => {
      expect(() => privateKeyHexToNsec('123')).toThrow();
      expect(() => privateKeyHexToNsec('1234')).toThrow();
    });
  });

  describe('decryptNip49PrivateKey - basic functionality', () => {
    it('should handle pure hex keys without crypto operations', async () => {
      // Import the actual function for this test
      const { decryptNip49PrivateKey } = await import('./nip49-utils');
      
      const hexKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const result = await decryptNip49PrivateKey(hexKey, 'password');
      expect(result).toBe(hexKey);
    });

    it('should handle nsec keys without crypto operations', async () => {
      // Import the actual function for this test
      const { decryptNip49PrivateKey } = await import('./nip49-utils');
      
      const hexKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const nsecKey = nip19.nsecEncode(hexToUint8Array(hexKey));
      
      const result = await decryptNip49PrivateKey(nsecKey, 'password');
      // decryptNip49PrivateKey returns hex string for nsec keys
      // The result should be the hex representation of the private key data
      expect(result).toBe(hexKey);
    });

    it('should decrypt real NIP-49 ncryptsec keys from nostr-tools', async () => {
      const { decryptNip49PrivateKey } = await import('./nip49-utils');

      const hexKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const password = 'correct horse battery staple';
      const encrypted = await nip49.encrypt(hexToUint8Array(hexKey), password);

      const result = await decryptNip49PrivateKey(encrypted, password);
      expect(result).toBe(hexKey);
    });
  });
});

// Helper function to convert hex to Uint8Array for testing
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Helper function to convert Uint8Array to hex for testing
function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
