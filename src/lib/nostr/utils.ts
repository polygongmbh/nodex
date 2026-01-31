import { NostrEvent, NostrEventKind, UnsignedEvent } from "./types";

/**
 * Generate a random subscription ID
 */
export function generateSubscriptionId(prefix = "sub"): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create an unsigned event (stub - in production would use actual crypto)
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
 * Sign an event (stub - in production would use secp256k1)
 * This is a placeholder that generates mock signatures for testing
 */
export function signEvent(unsignedEvent: UnsignedEvent): NostrEvent {
  // In production, this would:
  // 1. Serialize the event
  // 2. Hash with SHA256
  // 3. Sign with secp256k1
  // 4. Return the complete event with id and sig

  const mockId = generateMockEventId(unsignedEvent);
  const mockSig = generateMockSignature();

  return {
    ...unsignedEvent,
    id: mockId,
    sig: mockSig,
  };
}

/**
 * Generate a mock event ID (stub for testing)
 */
function generateMockEventId(event: UnsignedEvent): string {
  // In production: SHA256(JSON.stringify([0, pubkey, created_at, kind, tags, content]))
  const data = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  
  // Simple hash simulation for testing
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(16).padStart(64, "0").slice(0, 64);
}

/**
 * Generate a mock signature (stub for testing)
 */
function generateMockSignature(): string {
  // In production: secp256k1 signature
  return Array.from({ length: 128 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

/**
 * Validate event structure (basic validation)
 */
export function validateEvent(event: NostrEvent): boolean {
  if (!event.id || typeof event.id !== "string" || event.id.length !== 64) {
    return false;
  }
  if (!event.pubkey || typeof event.pubkey !== "string" || event.pubkey.length !== 64) {
    return false;
  }
  if (typeof event.created_at !== "number" || event.created_at < 0) {
    return false;
  }
  if (typeof event.kind !== "number" || event.kind < 0) {
    return false;
  }
  if (!Array.isArray(event.tags)) {
    return false;
  }
  if (typeof event.content !== "string") {
    return false;
  }
  if (!event.sig || typeof event.sig !== "string" || event.sig.length !== 128) {
    return false;
  }
  return true;
}

/**
 * Extract mentioned pubkeys from event tags
 */
export function extractMentions(event: NostrEvent): string[] {
  return event.tags
    .filter((tag) => tag[0] === "p")
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
    .filter((tag) => tag[0] === "t")
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
