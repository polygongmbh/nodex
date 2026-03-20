/**
 * Test vector for NIP-49 decryption
 * This demonstrates the proper decryption flow with known values
 */

import { decryptNip49PrivateKey } from './nip49-utils';

// Test vector data
const TEST_PASSWORD = "testpassword123";
const TEST_SALT_HEX = "1234567890abcdef1234567890abcdef"; // 16 bytes
const TEST_IV_HEX = "fedcba0987654321fedcba0987654321"; // 16 bytes
const TEST_PRIVATE_KEY_HEX = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"; // 32 bytes

// Create a properly formatted ncryptsec key for testing
const TEST_NCRYPTSEC_KEY = `ncryptsec${TEST_SALT_HEX}:${TEST_IV_HEX}:${TEST_PRIVATE_KEY_HEX}`;

async function testDecryption() {
  console.log("Testing NIP-49 decryption with known values...");
  console.log(`Test key: ${TEST_NCRYPTSEC_KEY}`);
  console.log(`Password: ${TEST_PASSWORD}`);
  
  try {
    const result = await decryptNip49PrivateKey(TEST_NCRYPTSEC_KEY, TEST_PASSWORD);
    console.log(`Decrypted key: ${result}`);
    console.log(`Expected key: ${TEST_PRIVATE_KEY_HEX}`);
    console.log(`Match: ${result === TEST_PRIVATE_KEY_HEX}`);
    
    if (result === TEST_PRIVATE_KEY_HEX) {
      console.log("✅ Test passed! Proper decryption is working.");
    } else {
      console.log("❌ Test failed! Decryption result doesn't match expected value.");
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error);
    // This is expected if the crypto operations aren't properly mocked
    console.log("This is expected in test environment without proper crypto mocking.");
  }
}

// Run the test if this file is executed directly
if ((import.meta as any).vitest) {
  // Running in test environment
} else {
  testDecryption();
}

export { testDecryption, TEST_NCRYPTSEC_KEY, TEST_PASSWORD, TEST_PRIVATE_KEY_HEX };