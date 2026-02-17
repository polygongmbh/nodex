import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { NostrEvent, NostrEventKind, UnsignedEvent } from "./types";

/**
 * Generate a random subscription ID
 */
export function generateSubscriptionId(prefix = "sub"): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generate a random 32-byte hex string (for mock pubkeys/event IDs)
 */
export function generateRandomHex(bytes = 32): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return bytesToHex(array);
}

/**
 * Serialize event for hashing according to NIP-01
 * Format: [0, pubkey, created_at, kind, tags, content]
 */
export function serializeEventForId(event: UnsignedEvent): string {
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
}

/**
 * Generate event ID according to NIP-01 (SHA256 of serialized event)
 */
export function generateEventId(event: UnsignedEvent): string {
  const serialized = serializeEventForId(event);
  const encoder = new TextEncoder();
  const hash = sha256(encoder.encode(serialized));
  return bytesToHex(hash);
}

/**
 * Create an unsigned event
 */
export function createUnsignedEvent(
  pubkey: string,
  kind: NostrEventKind,
  content: string,
  tags: string[][] = []
): UnsignedEvent {
  return {
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags,
    content,
  };
}

/**
 * Sign an event (mock implementation - in production use NIP-07 or secp256k1)
 * This generates a proper event ID per NIP-01 but uses a mock signature
 */
export function signEvent(unsignedEvent: UnsignedEvent): NostrEvent {
  // Generate proper NIP-01 compliant event ID
  const id = generateEventId(unsignedEvent);
  
  // Mock signature (64 bytes = 128 hex chars)
  // In production, this would be a schnorr signature over the event ID
  const sig = generateRandomHex(64);

  return {
    ...unsignedEvent,
    id,
    sig,
  };
}

/**
 * Validate event structure (basic validation per NIP-01)
 */
export function validateEvent(event: NostrEvent): boolean {
  // Check id format (32 bytes hex = 64 chars)
  if (!event.id || typeof event.id !== "string" || event.id.length !== 64) {
    return false;
  }
  if (!/^[0-9a-f]+$/.test(event.id)) {
    return false;
  }
  
  // Check pubkey format (32 bytes hex = 64 chars)
  if (!event.pubkey || typeof event.pubkey !== "string" || event.pubkey.length !== 64) {
    return false;
  }
  if (!/^[0-9a-f]+$/.test(event.pubkey)) {
    return false;
  }
  
  // Check created_at is a valid unix timestamp
  if (typeof event.created_at !== "number" || event.created_at < 0) {
    return false;
  }
  
  // Check kind is a valid integer
  if (typeof event.kind !== "number" || event.kind < 0 || event.kind > 65535) {
    return false;
  }
  
  // Check tags is array of string arrays
  if (!Array.isArray(event.tags)) {
    return false;
  }
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || !tag.every(t => typeof t === "string")) {
      return false;
    }
  }
  
  // Check content is string
  if (typeof event.content !== "string") {
    return false;
  }
  
  // Check sig format (64 bytes hex = 128 chars)
  if (!event.sig || typeof event.sig !== "string" || event.sig.length !== 128) {
    return false;
  }
  if (!/^[0-9a-f]+$/.test(event.sig)) {
    return false;
  }
  
  return true;
}

/**
 * Verify event ID matches content (NIP-01 compliance check)
 */
export function verifyEventId(event: NostrEvent): boolean {
  const expectedId = generateEventId(event);
  return event.id === expectedId;
}

/**
 * Extract mentioned pubkeys from event tags
 */
export function extractMentions(event: NostrEvent): string[] {
  return event.tags
    .filter((tag) => tag[0]?.toLowerCase() === "p")
    .map((tag) => tag[1])
    .filter(Boolean);
}

/**
 * Extract referenced event IDs from tags
 */
export function extractReferences(event: NostrEvent): string[] {
  return event.tags
    .filter((tag) => tag[0] === "e")
    .map((tag) => tag[1])
    .filter(Boolean);
}

/**
 * Extract hashtags from event tags
 */
export function extractHashtags(event: NostrEvent): string[] {
  return event.tags
    .filter((tag) => tag[0]?.toLowerCase() === "t")
    .map((tag) => tag[1]?.toLowerCase())
    .filter(Boolean);
}

/**
 * Format pubkey for display (first 8 chars...last 8 chars)
 */
export function formatPubkey(pubkey: string): string {
  if (pubkey.length < 16) return pubkey;
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
}

/**
 * Convert timestamp to relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  
  return new Date(timestamp * 1000).toLocaleDateString();
}
